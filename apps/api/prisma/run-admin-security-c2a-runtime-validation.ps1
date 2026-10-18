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
$initialImageIds = @(
  $initialInventory.Images | ForEach-Object {
    $fields = @($_ -split '\|')
    if ($fields.Count -ne 3 -or $fields[2] -notmatch '^sha256:[0-9a-f]{64}$') {
      throw "Docker image inventory returned an unexpected entry: $_"
    }
    $fields[2]
  } | Sort-Object -Unique
)
$matchingPinnedInventoryEntries = @(
  $initialInventory.Images | Where-Object { $_.StartsWith("$imageRepositoryTag|$imageDigest|") }
)
$initialImageInspection = @(& docker image inspect $image 2>$null)
$initialImageInspectExitCode = $LASTEXITCODE
$imageInitiallyPresent = $initialImageInspectExitCode -eq 0
$initialImageId = $null
if ($imageInitiallyPresent) {
  $initialImageDetails = @(($initialImageInspection -join "`n") | ConvertFrom-Json)
  if ($initialImageDetails.Count -ne 1 -or
      $initialImageDetails[0].Id -notmatch '^sha256:[0-9a-f]{64}$' -or
      @($initialImageDetails[0].RepoDigests) -notcontains $expectedRepoDigest) {
    throw 'The pinned PostgreSQL image exact inspection returned an unexpected identity.'
  }
  $initialImageId = $initialImageDetails[0].Id
  $expectedImageInventoryEntry = "$imageRepositoryTag|$imageDigest|$initialImageId"
  if ($matchingPinnedInventoryEntries.Count -ne 1 -or
      $initialInventory.Images -notcontains $expectedImageInventoryEntry -or
      $initialImageIds -notcontains $initialImageId) {
    throw 'The pinned PostgreSQL image inventory and exact inspection disagree.'
  }
}
else {
  if ($matchingPinnedInventoryEntries.Count -ne 0) {
    throw 'The pinned PostgreSQL image inventory was not confirmed by exact inspection.'
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to distinguish an absent pinned image from a Docker daemon failure.'
  }
}
$containerCreated = $false
$networkCreated = $false
$containerCreateAttempted = $false
$networkCreateAttempted = $false
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
  if ($LASTEXITCODE -ne 0 -or $containerId -notmatch '^[0-9a-f]{64}$') {
    throw 'Unable to create the isolated PostgreSQL C2a validation container.'
  }
  $containerCreated = $true

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
      $finalImageInspection = @(& docker image inspect $image 2>$null)
      $finalImageInspectExitCode = $LASTEXITCODE
      if ($finalImageInspectExitCode -eq 0) {
        $finalImageDetails = @(($finalImageInspection -join "`n") | ConvertFrom-Json)
        if ($finalImageDetails.Count -ne 1 -or
            $finalImageDetails[0].Id -notmatch '^sha256:[0-9a-f]{64}$' -or
            @($finalImageDetails[0].RepoDigests) -notcontains $expectedRepoDigest) {
          throw 'Targeted cleanup refused an unexpected acquired image identity.'
        }
        $acquiredImageId = $finalImageDetails[0].Id
        if ($initialImageIds -contains $acquiredImageId) {
          throw 'Targeted cleanup refused to remove an image ID present in the initial inventory.'
        }
        $currentImageInventory = Get-DockerInventory
        $expectedAcquiredImageEntry = "$imageRepositoryTag|$imageDigest|$acquiredImageId"
        $acquiredImageEntries = @(
          $currentImageInventory.Images | Where-Object { $_.EndsWith("|$acquiredImageId") }
        )
        if ($acquiredImageEntries.Count -ne 1 -or
            $acquiredImageEntries[0] -ne $expectedAcquiredImageEntry) {
          throw 'Targeted cleanup refused an acquired image with unexpected references.'
        }
        & docker image rm $acquiredImageId | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Targeted cleanup failed for the newly acquired image.' }
        Write-Output "TARGETED_C2A_VALIDATION_IMAGE_REMOVED id=$acquiredImageId"
      }
    }
    catch { $cleanupErrors += $_.Exception }
  }
  try {
    $finalInventory = Get-DockerInventory
    Assert-SameInventory -Before $initialInventory -After $finalInventory
    Write-Output 'POSTGRESQL_C2A_DOCKER_POSTFLIGHT_PASS foreign_inventory=preserved'
  }
  catch { $cleanupErrors += $_.Exception }
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
