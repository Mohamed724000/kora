[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-EphemeralSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  }
  finally {
    $generator.Dispose()
    $bytes = $null
  }
}

function Write-NewSecretFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Value + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  }
  finally {
    $stream.Dispose()
  }
}

function Get-DockerInventory {
  $containers = @(& docker container ls --all --no-trunc --format '{{.ID}}|{{.Names}}|{{.State}}|{{.Ports}}')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inventory Docker containers.' }
  $volumes = @(& docker volume ls --quiet)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inventory Docker volumes.' }
  $networks = @(& docker network ls --no-trunc --format '{{.ID}}|{{.Name}}')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inventory Docker networks.' }
  $images = @(& docker image ls --all --no-trunc --digests --format '{{.Repository}}:{{.Tag}}|{{.Digest}}|{{.ID}}')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inventory Docker images.' }
  return [pscustomobject]@{
    Containers = @($containers | Sort-Object)
    Volumes = @($volumes | Sort-Object)
    Networks = @($networks | Sort-Object)
    Images = @($images | Sort-Object)
  }
}

function Assert-SameInventory {
  param(
    [Parameter(Mandatory = $true)]$Before,
    [Parameter(Mandatory = $true)]$After
  )
  foreach ($surface in @('Containers', 'Volumes', 'Networks', 'Images')) {
    $difference = @(Compare-Object -ReferenceObject $Before.$surface -DifferenceObject $After.$surface)
    if ($difference.Count -ne 0) {
      throw "Docker $surface inventory differs after targeted cleanup."
    }
  }
}

function ConvertTo-DockerImageInventoryEntries {
  param([AllowEmptyCollection()][string[]]$Images)
  return @(
    $Images | ForEach-Object {
      $fields = @($_ -split '\|')
      if ($fields.Count -ne 3 -or $fields[2] -notmatch '^sha256:[0-9a-f]{64}$') {
        throw "Docker image inventory returned an unexpected entry: $_"
      }
      [pscustomobject]@{
        Raw = $_
        RepositoryTag = $fields[0]
        Digest = $fields[1]
        Id = $fields[2]
      }
    }
  )
}

function Invoke-DockerCapture {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Arguments,
    [int]$TimeoutMilliseconds = 30000
  )
  $dockerCommand = @(Get-Command docker -CommandType Application -ErrorAction Stop)[0]
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $dockerCommand.Source
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$start.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::Start($start)
  if ($process -eq $null) { throw 'Unable to start the Docker CLI.' }
  try {
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit($TimeoutMilliseconds)
    if ($timedOut) {
      $process.Kill($true)
      $process.WaitForExit()
    }
    return [pscustomobject]@{
      ExitCode = if ($timedOut) { $null } else { $process.ExitCode }
      Stdout = $stdoutTask.GetAwaiter().GetResult()
      Stderr = $stderrTask.GetAwaiter().GetResult()
      TimedOut = $timedOut
    }
  }
  finally {
    $process.Dispose()
  }
}

function Test-DockerNoSuchImageResult {
  param(
    [Parameter(Mandatory = $true)]$Result,
    [Parameter(Mandatory = $true)][string]$Reference
  )
  if ($Result.TimedOut -or $Result.ExitCode -eq 0) { return $false }
  return $Result.Stderr.Trim() -ceq "Error response from daemon: No such image: $Reference"
}

function Resolve-PinnedImageIdentity {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedRepoDigest,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$InventoryImages,
    [Parameter(Mandatory = $true)]$InspectResult,
    $DaemonInfoResult = $null,
    $TagInspectResult = $null,
    $DigestInspectResult = $null
  )
  $inventoryEntries = @(ConvertTo-DockerImageInventoryEntries -Images $InventoryImages)
  $imageParts = @($Image -split '@', 2)
  $digestParts = @($ExpectedRepoDigest -split '@', 2)
  if ($imageParts.Count -ne 2 -or $digestParts.Count -ne 2) {
    throw 'Pinned image reference is malformed.'
  }
  $requestedTag = $imageParts[0]
  $expectedRepository = $digestParts[0]
  $expectedDigest = $digestParts[1]

  if ($InspectResult.TimedOut) { throw "Pinned image inspection timed out for $Image." }
  if ($InspectResult.ExitCode -eq 0) {
    if ([string]::IsNullOrWhiteSpace($InspectResult.Stdout)) {
      throw "Pinned image inspection was empty for $Image."
    }
    try { $details = @(($InspectResult.Stdout) | ConvertFrom-Json) }
    catch { throw "Pinned image inspection returned invalid JSON for $Image." }
    if ($details.Count -ne 1 -or
        $details[0].Id -notmatch '^sha256:[0-9a-f]{64}$' -or
        @($details[0].RepoDigests) -notcontains $ExpectedRepoDigest) {
      throw "Pinned image identity mismatch for $Image."
    }
    $matchingEntries = @($inventoryEntries | Where-Object { $_.Id -eq $details[0].Id })
    if ($matchingEntries.Count -eq 0) {
      throw "Pinned image inventory does not contain inspected identity $($details[0].Id)."
    }
    return [pscustomobject]@{
      Present = $true
      Classification = 'present'
      Id = $details[0].Id
      RepoTags = @($details[0].RepoTags | Sort-Object -Unique)
      RepoDigests = @($details[0].RepoDigests | Sort-Object -Unique)
      InventoryEntries = @($matchingEntries.Raw | Sort-Object -Unique)
      InspectExitCode = 0
      DaemonInfoExitCode = $null
    }
  }

  if (-not (Test-DockerNoSuchImageResult -Result $InspectResult -Reference $Image)) {
    throw "Pinned image inspection failed without an exact no-such-image result for $Image."
  }
  if ($DaemonInfoResult -eq $null -or $DaemonInfoResult.TimedOut -or $DaemonInfoResult.ExitCode -ne 0) {
    throw "Docker is unavailable while resolving pinned image state for $Image."
  }
  if ($TagInspectResult -eq $null -or
      -not (Test-DockerNoSuchImageResult -Result $TagInspectResult -Reference $requestedTag)) {
    throw "Pinned image tag state is inconsistent for $requestedTag."
  }
  if ($DigestInspectResult -eq $null -or
      -not (Test-DockerNoSuchImageResult -Result $DigestInspectResult -Reference $ExpectedRepoDigest)) {
    throw "Pinned image repository digest state is inconsistent for $ExpectedRepoDigest."
  }
  $contradictoryEntries = @(
    $inventoryEntries | Where-Object {
      $_.RepositoryTag -eq $requestedTag -or
      ($_.RepositoryTag -match ('^' + [regex]::Escape($expectedRepository) + ':') -and
       $_.Digest -eq $expectedDigest)
    }
  )
  if ($contradictoryEntries.Count -ne 0) {
    throw "Pinned image inventory contradicts exact absence for $Image."
  }
  return [pscustomobject]@{
    Present = $false
    Classification = 'no_such_image'
    Id = $null
    RepoTags = @()
    RepoDigests = @()
    InventoryEntries = @()
    InspectExitCode = $InspectResult.ExitCode
    DaemonInfoExitCode = $DaemonInfoResult.ExitCode
  }
}

function Write-PinnedImageDiagnostic {
  param(
    [Parameter(Mandatory = $true)][string]$Phase,
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedRepoDigest,
    [Parameter(Mandatory = $true)]$State
  )
  $payload = [ordered]@{
    phase = $Phase
    requestedReference = $Image
    expectedRepoDigest = $ExpectedRepoDigest
    classification = $State.Classification
    inspectExitCode = $State.InspectExitCode
    daemonInfoExitCode = $State.DaemonInfoExitCode
    imageId = $State.Id
    repoTags = @($State.RepoTags)
    repoDigests = @($State.RepoDigests)
    matchingInventoryEntries = @($State.InventoryEntries)
  }
  [Console]::Out.WriteLine('DOCKER_IMAGE_IDENTITY ' + ($payload | ConvertTo-Json -Compress -Depth 4))
}

function Get-PinnedImageState {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedRepoDigest,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$InventoryImages,
    [Parameter(Mandatory = $true)][string]$Phase
  )
  $inspection = Invoke-DockerCapture -Arguments @('image', 'inspect', $Image)
  $daemon = $null
  $tagInspection = $null
  $digestInspection = $null
  if ($inspection.ExitCode -ne 0) {
    $daemon = Invoke-DockerCapture -Arguments @('info')
    $requestedTag = @($Image -split '@', 2)[0]
    $tagInspection = Invoke-DockerCapture -Arguments @('image', 'inspect', $requestedTag)
    $digestInspection = Invoke-DockerCapture -Arguments @('image', 'inspect', $ExpectedRepoDigest)
  }
  $state = Resolve-PinnedImageIdentity -Image $Image -ExpectedRepoDigest $ExpectedRepoDigest `
    -InventoryImages $InventoryImages -InspectResult $inspection -DaemonInfoResult $daemon `
    -TagInspectResult $tagInspection -DigestInspectResult $digestInspection
  Write-PinnedImageDiagnostic -Phase $Phase -Image $Image -ExpectedRepoDigest $ExpectedRepoDigest -State $state
  return $state
}

function Get-DockerContainerImageIdentities {
  $containerList = Invoke-DockerCapture -Arguments @('container', 'ls', '--all', '--no-trunc', '--quiet')
  if ($containerList.TimedOut -or $containerList.ExitCode -ne 0) {
    throw 'Unable to enumerate Docker containers for image cleanup.'
  }
  $containerIds = @($containerList.Stdout -split '\r?\n' | Where-Object { $_.Length -gt 0 })
  if ($containerIds.Count -eq 0) { return @() }
  $inspection = Invoke-DockerCapture -Arguments (@('container', 'inspect') + $containerIds)
  if ($inspection.TimedOut -or $inspection.ExitCode -ne 0) {
    throw 'Unable to inspect Docker containers for image cleanup.'
  }
  try { $details = @(($inspection.Stdout) | ConvertFrom-Json) }
  catch { throw 'Docker container inspection returned invalid JSON during image cleanup.' }
  if ($details.Count -ne $containerIds.Count) {
    throw 'Docker container inspection count changed during image cleanup.'
  }
  return @($details | ForEach-Object {
      if ($_.Id -notmatch '^[0-9a-f]{64}$' -or $_.Image -notmatch '^sha256:[0-9a-f]{64}$') {
        throw 'Docker container inspection returned an invalid identity during image cleanup.'
      }
      [pscustomobject]@{ Id = $_.Id; Image = $_.Image }
    })
}

function Assert-PinnedImageCleanupSafe {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedRepoDigest,
    [Parameter(Mandatory = $true)][bool]$AcquisitionAttempted,
    [Parameter(Mandatory = $true)]$AcquiredState,
    [Parameter(Mandatory = $true)]$CurrentState,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$InitialImageIds,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$CurrentInventoryImages,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$ContainerIdentities
  )
  if (-not $AcquisitionAttempted -or $AcquiredState -eq $null) {
    throw "Cleanup has no owned acquisition snapshot for $Image."
  }
  if (-not $AcquiredState.Present -or -not $CurrentState.Present -or
      $AcquiredState.Id -ne $CurrentState.Id) {
    throw "Acquired image identity changed before cleanup for $Image."
  }
  if ($InitialImageIds -contains $CurrentState.Id) {
    throw "Cleanup refused image identity present in the initial inventory for $Image."
  }
  if (@($ContainerIdentities | Where-Object { $_.Image -eq $CurrentState.Id }).Count -ne 0) {
    throw "Cleanup refused image identity used by a Docker container for $Image."
  }
  foreach ($surface in @('RepoTags', 'RepoDigests', 'InventoryEntries')) {
    $difference = @(Compare-Object -ReferenceObject @($AcquiredState.$surface | Sort-Object -Unique) `
      -DifferenceObject @($CurrentState.$surface | Sort-Object -Unique))
    if ($difference.Count -ne 0) {
      throw "Acquired image $surface changed before cleanup for $Image."
    }
  }
  $imageParts = @($Image -split '@', 2)
  $digestParts = @($ExpectedRepoDigest -split '@', 2)
  $allowedTags = @($imageParts[0], $ExpectedRepoDigest)
  if (@($CurrentState.RepoTags | Where-Object { $allowedTags -notcontains $_ }).Count -ne 0 -or
      @($CurrentState.RepoDigests | Where-Object { $_ -ne $ExpectedRepoDigest }).Count -ne 0) {
    throw "Cleanup refused unexpected image references for $Image."
  }
  $entries = @(ConvertTo-DockerImageInventoryEntries -Images $CurrentInventoryImages)
  $ownedEntries = @($entries | Where-Object { $_.Id -eq $CurrentState.Id })
  if ($ownedEntries.Count -eq 0 -or
      @($ownedEntries | Where-Object {
          $_.RepositoryTag -ne $imageParts[0] -or $_.Digest -ne $digestParts[1]
        }).Count -ne 0) {
    throw "Cleanup refused shared or incoherent inventory references for $Image."
  }
  return $true
}

function Assert-PinnedImageRemovalPostcondition {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$AcquiredImageId,
    [Parameter(Mandatory = $true)]$PostRemovalState,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$PostRemovalInventoryImages
  )
  if ($PostRemovalState.Present) {
    throw "Targeted cleanup left the exact acquired image reference present for $Image."
  }
  $postRemovalEntries = @(ConvertTo-DockerImageInventoryEntries -Images $PostRemovalInventoryImages)
  if (@($postRemovalEntries | Where-Object { $_.Id -eq $AcquiredImageId }).Count -ne 0) {
    throw "Targeted cleanup left the acquired image identity in inventory for $Image."
  }
  return $true
}

$imageRepositoryTag = 'postgres:18.4-alpine3.24'
$imageDigest = 'sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$expectedRepoDigest = "postgres@$imageDigest"
$image = "$imageRepositoryTag@$imageDigest"
$suffix = "$PID-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$container = "kora-s1203c2a-validation-$suffix"
$network = "kora-s1203c2a-validation-$suffix-network"
$secretDirectory = Join-Path ([IO.Path]::GetTempPath()) "kora-s1203c2a-secrets-$suffix"
$provisionScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\infra\postgres\provision-runtime.sh'))
$validator = Join-Path $PSScriptRoot 'validate-admin-security-c2a-runtime.mjs'

if ($container -notmatch '^kora-s1203c2a-validation-[0-9]+-[0-9a-f]{12}$') {
  throw 'Generated container name failed the destructive-operation guard.'
}
if ($network -notmatch '^kora-s1203c2a-validation-[0-9]+-[0-9a-f]{12}-network$') {
  throw 'Generated network name failed the destructive-operation guard.'
}
if (-not (Test-Path -LiteralPath $provisionScript -PathType Leaf)) {
  throw 'The PostgreSQL runtime provisioner is missing.'
}
if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
  throw 'The C2a PostgreSQL validator is missing.'
}
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedSecretDirectory = [IO.Path]::GetFullPath($secretDirectory)
if (-not $resolvedSecretDirectory.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Generated secret directory escaped the operating-system temporary directory.'
}

$secretNames = @(
  'postgres_password',
  'postgres_runtime_password',
  'postgres_admin_writer_password',
  'postgres_admin_c2a_writer_password',
  'postgres_admin_c2a_notification_worker_password',
  'postgres_admin_c2a_expiration_worker_password',
  'postgres_admin_c2a_bootstrap_password'
)
$secrets = @{}
foreach ($name in $secretNames) { $secrets[$name] = New-EphemeralSecret }
if (@($secrets.Values | Sort-Object -Unique).Count -ne 7) {
  throw 'Generated PostgreSQL secrets are not pairwise distinct.'
}
if (@($secrets.Values | Where-Object { $_.Length -ne 43 }).Count -ne 0) {
  throw 'Generated PostgreSQL secrets do not have the required 43-character format.'
}

$environmentNames = @(
  'S1203C2A_EPHEMERAL_POSTGRES', 'S1203C2A_ADMIN_HOST', 'S1203C2A_ADMIN_PORT',
  'S1203C2A_ADMIN_USER', 'S1203C2A_ADMIN_PASSWORD', 'S1203C2A_READER_USER',
  'S1203C2A_READER_PASSWORD', 'S1203C2A_C1_WRITER_USER', 'S1203C2A_C1_WRITER_PASSWORD',
  'S1203C2A_WRITER_USER', 'S1203C2A_WRITER_PASSWORD', 'S1203C2A_NOTIFICATION_USER',
  'S1203C2A_NOTIFICATION_PASSWORD', 'S1203C2A_EXPIRATION_USER',
  'S1203C2A_EXPIRATION_PASSWORD', 'S1203C2A_BOOTSTRAP_USER',
  'S1203C2A_BOOTSTRAP_PASSWORD', 'S1203C2A_VALIDATION_CONTAINER'
)
$savedEnvironment = @{}
foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$initialInventory = Get-DockerInventory
$initialImageEntries = @(ConvertTo-DockerImageInventoryEntries -Images $initialInventory.Images)
$initialImageIds = @(
  $initialImageEntries.Id | Sort-Object -Unique
)
$initialImageState = Get-PinnedImageState -Image $image -ExpectedRepoDigest $expectedRepoDigest `
  -InventoryImages $initialInventory.Images -Phase 'initial'
$imageInitiallyPresent = $initialImageState.Present
$containerCreated = $false
$networkCreated = $false
$containerCreateAttempted = $false
$networkCreateAttempted = $false
$imageAcquisitionAttempted = $false
$acquiredImageState = $null
$secretDirectoryCreated = $false
$validationError = $null
$cleanupErrors = @()

try {
  $existingContainer = @(& docker container ls --all --filter "name=^/$container$" --quiet)
  if ($LASTEXITCODE -ne 0 -or $existingContainer.Count -ne 0) {
    throw 'The generated validation container name is not absent.'
  }
  $existingNetwork = @(& docker network ls --filter "name=^$network$" --quiet)
  if ($LASTEXITCODE -ne 0 -or $existingNetwork.Count -ne 0) {
    throw 'The generated validation network name is not absent.'
  }

  [IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretDirectoryCreated = $true
  $secretDirectoryInfo = Get-Item -LiteralPath $secretDirectory -Force
  if (($secretDirectoryInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'The generated secret directory is an unexpected reparse point.'
  }
  foreach ($name in $secretNames) {
    Write-NewSecretFile -Path (Join-Path $secretDirectory $name) -Value $secrets[$name]
  }

  $networkCreateAttempted = $true
  $networkId = (& docker network create `
    --driver bridge `
    --label kora.slice=s1.2-03c2a-validation `
    $network).Trim()
  if ($LASTEXITCODE -ne 0 -or $networkId -notmatch '^[0-9a-f]{64}$') {
    throw 'Unable to create the isolated C2a Docker network.'
  }
  $networkCreated = $true

  $containerCreateAttempted = $true
  $imageAcquisitionAttempted = $true
  $containerId = (& docker run --detach --name $container `
    --network $network `
    --label kora.slice=s1.2-03c2a-validation `
    --env POSTGRES_USER=kora_s1203c2a_admin `
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password `
    --env POSTGRES_DB=postgres `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_password'),target=/run/secrets/postgres_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_runtime_password'),target=/run/secrets/postgres_runtime_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_admin_writer_password'),target=/run/secrets/postgres_admin_writer_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_admin_c2a_writer_password'),target=/run/kora-c2a-secrets/postgres_admin_c2a_writer_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_admin_c2a_notification_worker_password'),target=/run/kora-c2a-secrets/postgres_admin_c2a_notification_worker_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_admin_c2a_expiration_worker_password'),target=/run/kora-c2a-secrets/postgres_admin_c2a_expiration_worker_password,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'postgres_admin_c2a_bootstrap_password'),target=/run/kora-c2a-secrets/postgres_admin_c2a_bootstrap_password,readonly" `
    --mount "type=bind,source=$provisionScript,target=/usr/local/bin/kora-provision-postgresql-runtime.sh,readonly" `
    --publish 127.0.0.1::5432 `
    --tmpfs /var/lib/postgresql:rw,nosuid,nodev `
    $image).Trim()
  $containerRunExitCode = $LASTEXITCODE
  $containerRunSucceeded = $containerRunExitCode -eq 0 -and $containerId -match '^[0-9a-f]{64}$'
  if ($containerRunSucceeded) { $containerCreated = $true }
  $acquisitionSnapshotError = $null
  try {
    $postRunInventory = Get-DockerInventory
    $acquiredImageState = Get-PinnedImageState -Image $image -ExpectedRepoDigest $expectedRepoDigest `
      -InventoryImages $postRunInventory.Images -Phase 'post_run'
  }
  catch { $acquisitionSnapshotError = $_.Exception }
  if (-not $containerRunSucceeded) {
    if ($acquisitionSnapshotError -ne $null) {
      throw [AggregateException]::new(
        'Docker run and pinned image acquisition snapshot both failed.',
        [Exception[]]@(
          [Exception]::new('Unable to create the isolated PostgreSQL C2a validation container.'),
          $acquisitionSnapshotError
        )
      )
    }
    throw 'Unable to create the isolated PostgreSQL C2a validation container.'
  }
  if ($acquisitionSnapshotError -ne $null) { throw $acquisitionSnapshotError }
  if (-not $acquiredImageState.Present) {
    throw 'Pinned PostgreSQL image was absent after successful container creation.'
  }

  $portLine = & docker port $container 5432/tcp
  if ($LASTEXITCODE -ne 0 -or $portLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated PostgreSQL C2a port.'
  }
  $postgresPort = $Matches[1]

  $env:S1203C2A_EPHEMERAL_POSTGRES = '1'
  $env:S1203C2A_ADMIN_HOST = '127.0.0.1'
  $env:S1203C2A_ADMIN_PORT = $postgresPort
  $env:S1203C2A_ADMIN_USER = 'kora_s1203c2a_admin'
  $env:S1203C2A_ADMIN_PASSWORD = $secrets['postgres_password']
  $env:S1203C2A_READER_USER = 'kora_s1203c2a_reader'
  $env:S1203C2A_READER_PASSWORD = $secrets['postgres_runtime_password']
  $env:S1203C2A_C1_WRITER_USER = 'kora_s1203c2a_c1_writer'
  $env:S1203C2A_C1_WRITER_PASSWORD = $secrets['postgres_admin_writer_password']
  $env:S1203C2A_WRITER_USER = 'kora_admin_c2a_writer'
  $env:S1203C2A_WRITER_PASSWORD = $secrets['postgres_admin_c2a_writer_password']
  $env:S1203C2A_NOTIFICATION_USER = 'kora_admin_c2a_notification_worker'
  $env:S1203C2A_NOTIFICATION_PASSWORD = $secrets['postgres_admin_c2a_notification_worker_password']
  $env:S1203C2A_EXPIRATION_USER = 'kora_admin_c2a_expiration_worker'
  $env:S1203C2A_EXPIRATION_PASSWORD = $secrets['postgres_admin_c2a_expiration_worker_password']
  $env:S1203C2A_BOOTSTRAP_USER = 'kora_admin_c2a_bootstrap'
  $env:S1203C2A_BOOTSTRAP_PASSWORD = $secrets['postgres_admin_c2a_bootstrap_password']
  $env:S1203C2A_VALIDATION_CONTAINER = $container

  Write-Output "POSTGRESQL_C2A_CONTAINER_ISOLATION_PASS image=$image storage=tmpfs bind=127.0.0.1 network=isolated secrets=7"
  $nodeCommand = Get-Command node -ErrorAction Stop
  & $nodeCommand.Source $validator
  if ($LASTEXITCODE -ne 0) {
    throw "S1.2-03C2a PostgreSQL validation exited with code $LASTEXITCODE."
  }
}
catch {
  $validationError = $_.Exception
}
finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  foreach ($name in $secretNames) { $secrets[$name] = $null }

  if ($containerCreateAttempted -or $containerCreated) {
    try {
      $containerMatches = @(& docker container ls --all --no-trunc --filter "name=^/$container$" --quiet)
      if ($LASTEXITCODE -ne 0) { throw "Unable to locate the validation container $container." }
      if ($containerMatches.Count -gt 1) { throw "Validation container identity is ambiguous for $container." }
      if ($containerMatches.Count -eq 0) {
        if ($containerCreated) { throw "Created validation container disappeared before cleanup: $containerId." }
      }
      else {
        if (-not $containerCreated -or $containerMatches[0] -ne $containerId) {
          throw "Targeted cleanup refused an unowned container for $container."
        }
        if (@($initialInventory.Containers | Where-Object { $_.StartsWith("$containerId|") }).Count -ne 0) {
          throw "Targeted cleanup refused a pre-existing container ID for $container."
        }
        $containerInspection = @(& docker container inspect $containerId)
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the validation container $containerId." }
        $containerDetails = @(($containerInspection -join "`n") | ConvertFrom-Json)
        if ($containerDetails.Count -ne 1 -or
            $containerDetails[0].Id -ne $containerId -or
            $containerDetails[0].Name -ne "/$container" -or
            $containerDetails[0].Config.Labels.'kora.slice' -ne 's1.2-03c2a-validation') {
          throw "Targeted cleanup refused unexpected container identity for $containerId."
        }
        & docker rm --force $containerId | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $containerId." }
        Write-Output "TARGETED_C2A_VALIDATION_CONTAINER_REMOVED id=$containerId"
      }
    }
    catch { $cleanupErrors += $_.Exception }
  }
  if ($networkCreateAttempted -or $networkCreated) {
    try {
      $networkMatches = @(& docker network ls --no-trunc --filter "name=^$network$" --quiet)
      if ($LASTEXITCODE -ne 0) { throw "Unable to locate the validation network $network." }
      if ($networkMatches.Count -gt 1) { throw "Validation network identity is ambiguous for $network." }
      if ($networkMatches.Count -eq 0) {
        if ($networkCreated) { throw "Created validation network disappeared before cleanup: $networkId." }
      }
      else {
        if (-not $networkCreated -or $networkMatches[0] -ne $networkId) {
          throw "Targeted cleanup refused an unowned network for $network."
        }
        if (@($initialInventory.Networks | Where-Object { $_.StartsWith("$networkId|") }).Count -ne 0) {
          throw "Targeted cleanup refused a pre-existing network ID for $network."
        }
        $networkInspection = @(& docker network inspect $networkId)
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the validation network $networkId." }
        $networkDetails = @(($networkInspection -join "`n") | ConvertFrom-Json)
        if ($networkDetails.Count -ne 1 -or
            $networkDetails[0].Id -ne $networkId -or
            $networkDetails[0].Name -ne $network -or
            $networkDetails[0].Labels.'kora.slice' -ne 's1.2-03c2a-validation') {
          throw "Targeted cleanup refused unexpected network identity for $networkId."
        }
        & docker network rm $networkId | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $networkId." }
        Write-Output "TARGETED_C2A_VALIDATION_NETWORK_REMOVED id=$networkId"
      }
    }
    catch { $cleanupErrors += $_.Exception }
  }
  try {
    if ($secretDirectoryCreated -and (Test-Path -LiteralPath $secretDirectory)) {
      $deleteTarget = [IO.Path]::GetFullPath($secretDirectory)
      if (-not $deleteTarget.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
          $deleteTarget -ne $resolvedSecretDirectory) {
        throw 'Targeted secret cleanup guard failed.'
      }
      $deleteInfo = Get-Item -LiteralPath $deleteTarget -Force
      if (($deleteInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Targeted secret cleanup refused a reparse point.'
      }
      [IO.Directory]::Delete($deleteTarget, $true)
    }
    Write-Output 'TARGETED_C2A_VALIDATION_SECRETS_REMOVED'
  }
  catch { $cleanupErrors += $_.Exception }
  if (-not $imageInitiallyPresent) {
    try {
      $currentImageInventory = Get-DockerInventory
      $currentImageState = Get-PinnedImageState -Image $image -ExpectedRepoDigest $expectedRepoDigest `
        -InventoryImages $currentImageInventory.Images -Phase 'pre_cleanup'
      if ($currentImageState.Present) {
        if (-not $imageAcquisitionAttempted -or $acquiredImageState -eq $null) {
          throw 'Targeted cleanup refused a present image without an owned acquisition snapshot.'
        }
        $containerIdentities = @(Get-DockerContainerImageIdentities)
        Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $expectedRepoDigest `
          -AcquisitionAttempted $imageAcquisitionAttempted -AcquiredState $acquiredImageState `
          -CurrentState $currentImageState -InitialImageIds $initialImageIds `
          -CurrentInventoryImages $currentImageInventory.Images `
          -ContainerIdentities $containerIdentities | Out-Null
        $removeResult = Invoke-DockerCapture -Arguments @('image', 'rm', $image)
        if ($removeResult.TimedOut -or $removeResult.ExitCode -ne 0) {
          throw 'Targeted cleanup failed to remove the exact acquired image reference.'
        }
        $postRemovalInventory = Get-DockerInventory
        $postRemovalState = Get-PinnedImageState -Image $image -ExpectedRepoDigest $expectedRepoDigest `
          -InventoryImages $postRemovalInventory.Images -Phase 'post_cleanup'
        Assert-PinnedImageRemovalPostcondition -Image $image -AcquiredImageId $acquiredImageState.Id `
          -PostRemovalState $postRemovalState -PostRemovalInventoryImages $postRemovalInventory.Images | Out-Null
        Write-Output "TARGETED_C2A_VALIDATION_IMAGE_REFERENCE_REMOVED reference=$image"
      }
      elseif ($acquiredImageState -ne $null -and $acquiredImageState.Present) {
        throw 'Acquired image disappeared before targeted cleanup.'
      }
    }
    catch {
      [Console]::Error.WriteLine("DOCKER_IMAGE_CLEANUP_ERROR phase=image_cleanup reference=$image error=$($_.Exception.Message)")
      $cleanupErrors += $_.Exception
    }
  }
  try {
    $finalInventory = Get-DockerInventory
    Assert-SameInventory -Before $initialInventory -After $finalInventory
    Write-Output 'POSTGRESQL_C2A_DOCKER_POSTFLIGHT_PASS foreign_inventory=preserved'
  }
  catch { $cleanupErrors += $_.Exception }
}

if ($validationError -ne $null) {
  [Console]::Error.WriteLine("C2A_VALIDATION_ERROR phase=validation error=$($validationError.Message)")
}
foreach ($cleanupError in $cleanupErrors) {
  [Console]::Error.WriteLine("C2A_CLEANUP_ERROR phase=cleanup error=$($cleanupError.Message)")
}
if ($validationError -ne $null -and $cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new(
    'C2a validation and targeted cleanup failed.',
    [Exception[]](@($validationError) + $cleanupErrors)
  )
}
if ($validationError -ne $null) { throw $validationError }
if ($cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new('C2a targeted cleanup failed.', [Exception[]]$cleanupErrors)
}
Write-Output 'S1.2-03C2A_ADMIN_SECURITY_POSTGRESQL_PASS cleanup=verified foreign_inventory=preserved'
