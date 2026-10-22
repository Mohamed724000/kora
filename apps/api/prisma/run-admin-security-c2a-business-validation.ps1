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
      throw "Docker $surface inventory differs after targeted C2a business cleanup."
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

$postgresTag = 'postgres:18.4-alpine3.24'
$postgresDigest = 'sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$postgresImage = "$postgresTag@$postgresDigest"
$redisTag = 'redis:7.2.15-alpine3.21'
$redisDigest = 'sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6'
$redisImage = "$redisTag@$redisDigest"
$suffix = "$PID-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$postgresContainer = "kora-s1203c2a-business-$suffix-postgres"
$redisContainer = "kora-s1203c2a-business-$suffix-redis"
$network = "kora-s1203c2a-business-$suffix-network"
$secretDirectory = Join-Path ([IO.Path]::GetTempPath()) "kora-s1203c2a-business-secrets-$suffix"
$provisionScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\infra\postgres\provision-runtime.sh'))
$validator = Join-Path $PSScriptRoot 'validate-admin-security-c2a-business.mjs'

if ($postgresContainer -notmatch '^kora-s1203c2a-business-[0-9]+-[0-9a-f]{12}-postgres$' -or
    $redisContainer -notmatch '^kora-s1203c2a-business-[0-9]+-[0-9a-f]{12}-redis$' -or
    $network -notmatch '^kora-s1203c2a-business-[0-9]+-[0-9a-f]{12}-network$') {
  throw 'Generated C2a business resource name failed its target guard.'
}
if (-not (Test-Path -LiteralPath $provisionScript -PathType Leaf)) {
  throw 'The PostgreSQL runtime provisioner is missing.'
}
if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
  throw 'The C2a business validator is missing.'
}
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedSecretDirectory = [IO.Path]::GetFullPath($secretDirectory)
if (-not $resolvedSecretDirectory.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Generated C2a business secret directory escaped the OS temporary directory.'
}

$secretNames = @(
  'postgres_password',
  'postgres_runtime_password',
  'postgres_admin_writer_password',
  'postgres_admin_c2a_writer_password',
  'postgres_admin_c2a_notification_worker_password',
  'postgres_admin_c2a_expiration_worker_password',
  'postgres_admin_c2a_bootstrap_password',
  'redis_password'
)
$secrets = @{}
foreach ($name in $secretNames) { $secrets[$name] = New-EphemeralSecret }
if (@($secrets.Values | Sort-Object -Unique).Count -ne 8 -or
    @($secrets.Values | Where-Object { $_.Length -ne 43 }).Count -ne 0) {
  throw 'Generated C2a business secrets failed uniqueness or format checks.'
}

$environmentNames = @(
  'S1203C2A_BUSINESS_ADMIN_PASSWORD', 'S1203C2A_BUSINESS_ADMIN_USER',
  'S1203C2A_BUSINESS_BOOTSTRAP_PASSWORD', 'S1203C2A_BUSINESS_C1_WRITER_PASSWORD',
  'S1203C2A_BUSINESS_C1_WRITER_USER', 'S1203C2A_BUSINESS_EXPIRATION_PASSWORD',
  'S1203C2A_BUSINESS_NOTIFICATION_PASSWORD', 'S1203C2A_BUSINESS_POSTGRES_CONTAINER',
  'S1203C2A_BUSINESS_POSTGRES_PORT', 'S1203C2A_BUSINESS_READER_PASSWORD',
  'S1203C2A_BUSINESS_READER_USER', 'S1203C2A_BUSINESS_REDIS_PASSWORD',
  'S1203C2A_BUSINESS_REDIS_PORT', 'S1203C2A_BUSINESS_WRITER_PASSWORD'
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
$postgresInitial = Get-PinnedImageState -Image $postgresImage -ExpectedRepoDigest "postgres@$postgresDigest" `
  -InventoryImages $initialInventory.Images -Phase 'initial_postgres'
$redisInitial = Get-PinnedImageState -Image $redisImage -ExpectedRepoDigest "redis@$redisDigest" `
  -InventoryImages $initialInventory.Images -Phase 'initial_redis'

$postgresCreated = $false
$redisCreated = $false
$postgresAcquisitionAttempted = $false
$redisAcquisitionAttempted = $false
$postgresAcquiredState = $null
$redisAcquiredState = $null
$networkCreated = $false
$secretDirectoryCreated = $false
$postgresId = $null
$redisId = $null
$networkId = $null
$validationError = $null
$cleanupErrors = @()

try {
  foreach ($name in @($postgresContainer, $redisContainer)) {
    $matches = @(& docker container ls --all --filter "name=^/$name$" --quiet)
    if ($LASTEXITCODE -ne 0 -or $matches.Count -ne 0) {
      throw "Generated C2a business container name is not absent: $name"
    }
  }
  $networkMatches = @(& docker network ls --filter "name=^$network$" --quiet)
  if ($LASTEXITCODE -ne 0 -or $networkMatches.Count -ne 0) {
    throw 'Generated C2a business network name is not absent.'
  }

  [IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretDirectoryCreated = $true
  $secretInfo = Get-Item -LiteralPath $secretDirectory -Force
  if (($secretInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Generated C2a business secret directory is a reparse point.'
  }
  foreach ($name in $secretNames) {
    Write-NewSecretFile -Path (Join-Path $secretDirectory $name) -Value $secrets[$name]
  }
  $redisConfigPath = Join-Path $secretDirectory 'redis.conf'
  $redisConfig = @(
    'bind 0.0.0.0',
    'protected-mode yes',
    'port 6379',
    'appendonly yes',
    'dir /data',
    "requirepass $($secrets['redis_password'])"
  ) -join "`n"
  Write-NewSecretFile -Path $redisConfigPath -Value $redisConfig
  $redisProbePath = Join-Path $secretDirectory 'redis-probe.sh'
  $redisProbeScript = @(
    '#!/bin/sh',
    'REDISCLI_AUTH="$(cat /run/secrets/redis_password)" exec redis-cli --no-auth-warning PING'
  ) -join "`n"
  Write-NewSecretFile -Path $redisProbePath -Value $redisProbeScript

  $networkId = (& docker network create `
    --driver bridge `
    --label kora.slice=s1.2-03c2a-business `
    $network).Trim()
  if ($LASTEXITCODE -ne 0 -or $networkId -notmatch '^[0-9a-f]{64}$') {
    throw 'Unable to create the isolated C2a business network.'
  }
  $networkCreated = $true

  $postgresAcquisitionAttempted = $true
  $postgresId = (& docker run --detach --name $postgresContainer `
    --network $network `
    --label kora.slice=s1.2-03c2a-business `
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
    $postgresImage).Trim()
  $postgresRunExitCode = $LASTEXITCODE
  $postgresRunSucceeded = $postgresRunExitCode -eq 0 -and $postgresId -match '^[0-9a-f]{64}$'
  if ($postgresRunSucceeded) { $postgresCreated = $true }
  $postgresSnapshotError = $null
  try {
    $postPostgresInventory = Get-DockerInventory
    $postgresAcquiredState = Get-PinnedImageState -Image $postgresImage `
      -ExpectedRepoDigest "postgres@$postgresDigest" -InventoryImages $postPostgresInventory.Images `
      -Phase 'post_run_postgres'
  }
  catch { $postgresSnapshotError = $_.Exception }
  if (-not $postgresRunSucceeded) {
    if ($postgresSnapshotError -ne $null) {
      throw [AggregateException]::new(
        'PostgreSQL docker run and pinned image acquisition snapshot both failed.',
        [Exception[]]@(
          [Exception]::new('Unable to create the isolated C2a business PostgreSQL container.'),
          $postgresSnapshotError
        )
      )
    }
    throw 'Unable to create the isolated C2a business PostgreSQL container.'
  }
  if ($postgresSnapshotError -ne $null) { throw $postgresSnapshotError }
  if (-not $postgresAcquiredState.Present) {
    throw 'Pinned PostgreSQL image was absent after successful business container creation.'
  }

  $redisAcquisitionAttempted = $true
  $redisId = (& docker run --detach --name $redisContainer `
    --network $network `
    --label kora.slice=s1.2-03c2a-business `
    --mount "type=bind,source=$redisConfigPath,target=/usr/local/etc/redis/redis.conf,readonly" `
    --mount "type=bind,source=$(Join-Path $secretDirectory 'redis_password'),target=/run/secrets/redis_password,readonly" `
    --mount "type=bind,source=$redisProbePath,target=/run/secrets/redis-probe.sh,readonly" `
    --publish 127.0.0.1::6379 `
    --tmpfs /data:rw,nosuid,nodev `
    $redisImage redis-server /usr/local/etc/redis/redis.conf).Trim()
  $redisRunExitCode = $LASTEXITCODE
  $redisRunSucceeded = $redisRunExitCode -eq 0 -and $redisId -match '^[0-9a-f]{64}$'
  if ($redisRunSucceeded) { $redisCreated = $true }
  $redisSnapshotError = $null
  try {
    $postRedisInventory = Get-DockerInventory
    $redisAcquiredState = Get-PinnedImageState -Image $redisImage `
      -ExpectedRepoDigest "redis@$redisDigest" -InventoryImages $postRedisInventory.Images `
      -Phase 'post_run_redis'
  }
  catch { $redisSnapshotError = $_.Exception }
  if (-not $redisRunSucceeded) {
    if ($redisSnapshotError -ne $null) {
      throw [AggregateException]::new(
        'Redis docker run and pinned image acquisition snapshot both failed.',
        [Exception[]]@(
          [Exception]::new('Unable to create the isolated C2a business Redis container.'),
          $redisSnapshotError
        )
      )
    }
    throw 'Unable to create the isolated C2a business Redis container.'
  }
  if ($redisSnapshotError -ne $null) { throw $redisSnapshotError }
  if (-not $redisAcquiredState.Present) {
    throw 'Pinned Redis image was absent after successful business container creation.'
  }

  $postgresPortLine = & docker port $postgresContainer 5432/tcp
  if ($LASTEXITCODE -ne 0 -or $postgresPortLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated C2a business PostgreSQL port.'
  }
  $postgresPort = $Matches[1]
  $redisPortLine = & docker port $redisContainer 6379/tcp
  if ($LASTEXITCODE -ne 0 -or $redisPortLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated C2a business Redis port.'
  }
  $redisPort = $Matches[1]

  $postgresReady = $false
  $redisReady = $false
  for ($attempt = 0; $attempt -lt 120 -and (-not $postgresReady -or -not $redisReady); $attempt += 1) {
    if (-not $postgresReady) {
      & docker exec $postgresContainer pg_isready --host=127.0.0.1 --port=5432 --username=kora_s1203c2a_admin --dbname=postgres *> $null
      $postgresReady = $LASTEXITCODE -eq 0
    }
    if (-not $redisReady) {
      & docker exec $redisContainer sh /run/secrets/redis-probe.sh *> $null
      $redisReady = $LASTEXITCODE -eq 0
    }
    if (-not $postgresReady -or -not $redisReady) { Start-Sleep -Milliseconds 250 }
  }
  if (-not $postgresReady -or -not $redisReady) {
    throw "C2a business dependencies did not become ready: postgres=$postgresReady redis=$redisReady"
  }

  $env:S1203C2A_BUSINESS_ADMIN_PASSWORD = $secrets['postgres_password']
  $env:S1203C2A_BUSINESS_ADMIN_USER = 'kora_s1203c2a_admin'
  $env:S1203C2A_BUSINESS_BOOTSTRAP_PASSWORD = $secrets['postgres_admin_c2a_bootstrap_password']
  $env:S1203C2A_BUSINESS_C1_WRITER_PASSWORD = $secrets['postgres_admin_writer_password']
  $env:S1203C2A_BUSINESS_C1_WRITER_USER = 'kora_s1203c2a_c1_writer'
  $env:S1203C2A_BUSINESS_EXPIRATION_PASSWORD = $secrets['postgres_admin_c2a_expiration_worker_password']
  $env:S1203C2A_BUSINESS_NOTIFICATION_PASSWORD = $secrets['postgres_admin_c2a_notification_worker_password']
  $env:S1203C2A_BUSINESS_POSTGRES_CONTAINER = $postgresContainer
  $env:S1203C2A_BUSINESS_POSTGRES_PORT = $postgresPort
  $env:S1203C2A_BUSINESS_READER_PASSWORD = $secrets['postgres_runtime_password']
  $env:S1203C2A_BUSINESS_READER_USER = 'kora_s1203c2a_reader'
  $env:S1203C2A_BUSINESS_REDIS_PASSWORD = $secrets['redis_password']
  $env:S1203C2A_BUSINESS_REDIS_PORT = $redisPort
  $env:S1203C2A_BUSINESS_WRITER_PASSWORD = $secrets['postgres_admin_c2a_writer_password']

  Write-Output "C2A_BUSINESS_ISOLATION_PASS postgres=$postgresContainer redis=$redisContainer network=$network storage=tmpfs"
  $nodeCommand = Get-Command node -ErrorAction Stop
  $validatorStart = [Diagnostics.ProcessStartInfo]::new()
  $validatorStart.FileName = $nodeCommand.Source
  if ($validator.Contains('"')) {
    throw 'Validator path cannot contain a quote.'
  }
  $validatorStart.Arguments = '"' + $validator + '"'
  $validatorStart.UseShellExecute = $false
  $validatorStart.CreateNoWindow = $true
  $validatorStart.RedirectStandardOutput = $true
  $validatorStart.RedirectStandardError = $true
  $validatorProcess = [Diagnostics.Process]::Start($validatorStart)
  if ($validatorProcess -eq $null) { throw 'Unable to start the C2a business validator.' }
  try {
    $validatorStdoutTask = $validatorProcess.StandardOutput.ReadToEndAsync()
    $validatorStderrTask = $validatorProcess.StandardError.ReadToEndAsync()
    $validatorTimedOut = -not $validatorProcess.WaitForExit(900000)
    if ($validatorTimedOut) {
      $validatorProcess.Kill($true)
      $validatorProcess.WaitForExit()
    }
    $validatorStdout = $validatorStdoutTask.GetAwaiter().GetResult()
    $validatorStderr = $validatorStderrTask.GetAwaiter().GetResult()
    if ($validatorStdout.Length -gt 0) { [Console]::Out.Write($validatorStdout) }
    if ($validatorStderr.Length -gt 0) { [Console]::Error.Write($validatorStderr) }
    if ($validatorTimedOut) {
      throw 'C2a business validator exceeded its 900 second campaign bound.'
    }
    if ($validatorProcess.ExitCode -ne 0) {
      throw "C2a business validator exited with code $($validatorProcess.ExitCode)."
    }
  }
  finally {
    $validatorProcess.Dispose()
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

  foreach ($resource in @(
      [pscustomobject]@{ Created = $redisCreated; Id = $redisId; Name = $redisContainer },
      [pscustomobject]@{ Created = $postgresCreated; Id = $postgresId; Name = $postgresContainer }
    )) {
    try {
      $matches = @(& docker container ls --all --no-trunc --filter "name=^/$($resource.Name)$" --quiet)
      if ($LASTEXITCODE -ne 0 -or $matches.Count -gt 1) {
        throw "Unable to resolve owned C2a business container $($resource.Name)."
      }
      if ($matches.Count -eq 1) {
        if (-not $resource.Created -or $matches[0] -ne $resource.Id) {
          throw "Targeted cleanup refused unowned container $($resource.Name)."
        }
        $inspection = @(& docker container inspect $resource.Id)
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect $($resource.Id)." }
        $details = @(($inspection -join "`n") | ConvertFrom-Json)
        if ($details.Count -ne 1 -or
            $details[0].Id -ne $resource.Id -or
            $details[0].Name -ne "/$($resource.Name)" -or
            $details[0].Config.Labels.'kora.slice' -ne 's1.2-03c2a-business') {
          throw "Targeted cleanup refused unexpected container identity $($resource.Id)."
        }
        & docker rm --force $resource.Id | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $($resource.Id)." }
        Write-Output "TARGETED_C2A_BUSINESS_CONTAINER_REMOVED id=$($resource.Id)"
      }
      elseif ($resource.Created) {
        throw "Created C2a business container disappeared: $($resource.Id)."
      }
    }
    catch { $cleanupErrors += $_.Exception }
  }

  try {
    $matches = @(& docker network ls --no-trunc --filter "name=^$network$" --quiet)
    if ($LASTEXITCODE -ne 0 -or $matches.Count -gt 1) {
      throw 'Unable to resolve the owned C2a business network.'
    }
    if ($matches.Count -eq 1) {
      if (-not $networkCreated -or $matches[0] -ne $networkId) {
        throw 'Targeted cleanup refused an unowned C2a business network.'
      }
      $inspection = @(& docker network inspect $networkId)
      if ($LASTEXITCODE -ne 0) { throw "Unable to inspect network $networkId." }
      $details = @(($inspection -join "`n") | ConvertFrom-Json)
      if ($details.Count -ne 1 -or
          $details[0].Id -ne $networkId -or
          $details[0].Name -ne $network -or
          $details[0].Labels.'kora.slice' -ne 's1.2-03c2a-business') {
        throw 'Targeted cleanup refused unexpected C2a business network identity.'
      }
      & docker network rm $networkId | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Targeted network cleanup failed for $networkId." }
      Write-Output "TARGETED_C2A_BUSINESS_NETWORK_REMOVED id=$networkId"
    }
    elseif ($networkCreated) {
      throw "Created C2a business network disappeared: $networkId"
    }
  }
  catch { $cleanupErrors += $_.Exception }

  try {
    if ($secretDirectoryCreated -and (Test-Path -LiteralPath $secretDirectory)) {
      $target = [IO.Path]::GetFullPath($secretDirectory)
      if ($target -ne $resolvedSecretDirectory -or
          -not $target.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Targeted C2a business secret cleanup guard failed.'
      }
      $targetInfo = Get-Item -LiteralPath $target -Force
      if (($targetInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Targeted C2a business secret cleanup refused a reparse point.'
      }
      [IO.Directory]::Delete($target, $true)
    }
    Write-Output 'TARGETED_C2A_BUSINESS_SECRETS_REMOVED'
  }
  catch { $cleanupErrors += $_.Exception }

  foreach ($imageState in @(
      [pscustomobject]@{
        Initial = $redisInitial; Image = $redisImage; RepoDigest = "redis@$redisDigest";
        AcquisitionAttempted = $redisAcquisitionAttempted; Acquired = $redisAcquiredState; Name = 'redis'
      },
      [pscustomobject]@{
        Initial = $postgresInitial; Image = $postgresImage; RepoDigest = "postgres@$postgresDigest";
        AcquisitionAttempted = $postgresAcquisitionAttempted; Acquired = $postgresAcquiredState; Name = 'postgres'
      }
    )) {
    if (-not $imageState.Initial.Present) {
      try {
        $currentImageInventory = Get-DockerInventory
        $currentImageState = Get-PinnedImageState -Image $imageState.Image `
          -ExpectedRepoDigest $imageState.RepoDigest -InventoryImages $currentImageInventory.Images `
          -Phase "pre_cleanup_$($imageState.Name)"
        if ($currentImageState.Present) {
          if (-not $imageState.AcquisitionAttempted -or $imageState.Acquired -eq $null) {
            throw "Targeted cleanup refused present $($imageState.Name) image without an owned acquisition snapshot."
          }
          $containerIdentities = @(Get-DockerContainerImageIdentities)
          Assert-PinnedImageCleanupSafe -Image $imageState.Image `
            -ExpectedRepoDigest $imageState.RepoDigest `
            -AcquisitionAttempted $imageState.AcquisitionAttempted `
            -AcquiredState $imageState.Acquired -CurrentState $currentImageState `
            -InitialImageIds $initialImageIds -CurrentInventoryImages $currentImageInventory.Images `
            -ContainerIdentities $containerIdentities | Out-Null
          $removeResult = Invoke-DockerCapture -Arguments @('image', 'rm', $imageState.Image)
          if ($removeResult.TimedOut -or $removeResult.ExitCode -ne 0) {
            throw "Unable to remove exact acquired $($imageState.Name) image reference."
          }
          $postRemovalInventory = Get-DockerInventory
          $postRemovalState = Get-PinnedImageState -Image $imageState.Image `
            -ExpectedRepoDigest $imageState.RepoDigest -InventoryImages $postRemovalInventory.Images `
            -Phase "post_cleanup_$($imageState.Name)"
          Assert-PinnedImageRemovalPostcondition -Image $imageState.Image `
            -AcquiredImageId $imageState.Acquired.Id -PostRemovalState $postRemovalState `
            -PostRemovalInventoryImages $postRemovalInventory.Images | Out-Null
          Write-Output "TARGETED_C2A_BUSINESS_IMAGE_REFERENCE_REMOVED reference=$($imageState.Image)"
        }
        elseif ($imageState.Acquired -ne $null -and $imageState.Acquired.Present) {
          throw "Acquired $($imageState.Name) image disappeared before targeted cleanup."
        }
      }
      catch {
        [Console]::Error.WriteLine("DOCKER_IMAGE_CLEANUP_ERROR phase=image_cleanup_$($imageState.Name) reference=$($imageState.Image) error=$($_.Exception.Message)")
        $cleanupErrors += $_.Exception
      }
    }
  }

  try {
    $finalInventory = Get-DockerInventory
    Assert-SameInventory -Before $initialInventory -After $finalInventory
    Write-Output 'C2A_BUSINESS_DOCKER_POSTFLIGHT_PASS foreign_inventory=preserved'
  }
  catch { $cleanupErrors += $_.Exception }
}

if ($validationError -ne $null) {
  [Console]::Error.WriteLine("C2A_BUSINESS_VALIDATION_ERROR phase=validation error=$($validationError.Message)")
}
foreach ($cleanupError in $cleanupErrors) {
  [Console]::Error.WriteLine("C2A_BUSINESS_CLEANUP_ERROR phase=cleanup error=$($cleanupError.Message)")
}
if ($validationError -ne $null -and $cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new(
    'C2a business validation and targeted cleanup failed.',
    [Exception[]](@($validationError) + $cleanupErrors)
  )
}
if ($validationError -ne $null) { throw $validationError }
if ($cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new('C2a business targeted cleanup failed.', [Exception[]]$cleanupErrors)
}
Write-Output 'S1.2-03C2A_BUSINESS_LOCAL_PASS cleanup=verified foreign_inventory=preserved providers=test_only'
