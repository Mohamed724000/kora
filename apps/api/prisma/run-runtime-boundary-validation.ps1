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

$image = 'postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$container = 'kora-s1203a-validation-' + $PID + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$secretDirectory = Join-Path ([IO.Path]::GetTempPath()) ('kora-s1203a-secret-' + [guid]::NewGuid().ToString('N'))
$ownerSecretFile = Join-Path $secretDirectory 'postgres_password'
$runtimeSecretFile = Join-Path $secretDirectory 'postgres_runtime_password'
$provisionScript = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\..\..\infra\postgres\provision-runtime.sh')
)
$ownerPassword = New-EphemeralSecret
$runtimePassword = New-EphemeralSecret
$environmentNames = @(
  'S1203A_EPHEMERAL_POSTGRES',
  'S1203A_ADMIN_HOST',
  'S1203A_ADMIN_PORT',
  'S1203A_ADMIN_DATABASE',
  'S1203A_ADMIN_USER',
  'S1203A_ADMIN_PASSWORD',
  'S1203A_RUNTIME_PASSWORD',
  'S1203A_VALIDATION_CONTAINER'
)
$savedEnvironment = @{}
$containerCreated = $false
$secretDirectoryCreated = $false
$validationError = $null
$cleanupErrors = @()

if ($container -notmatch '^kora-s1203a-validation-[0-9]+-[0-9a-f]{8}$') {
  throw 'Generated container name failed the destructive-operation guard.'
}
if (-not (Test-Path -LiteralPath $provisionScript -PathType Leaf)) {
  throw 'The delivered PostgreSQL runtime provisioner is missing.'
}
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedSecretDirectory = [IO.Path]::GetFullPath($secretDirectory)
if (-not $resolvedSecretDirectory.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Generated secret directory escaped the operating-system temporary directory.'
}

foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  & npm.cmd run build --workspace '@kora-plus/api'
  if ($LASTEXITCODE -ne 0) {
    throw "API build required by S1.2-03A validation exited with code $LASTEXITCODE."
  }

  [IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretDirectoryCreated = $true
  [IO.File]::WriteAllText($ownerSecretFile, $ownerPassword + [Environment]::NewLine)
  [IO.File]::WriteAllText($runtimeSecretFile, $runtimePassword + [Environment]::NewLine)

  $existingContainerId = docker container ls --all --quiet --filter "name=^/$container$"
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect Docker container names before validation.'
  }
  if (-not [string]::IsNullOrWhiteSpace($existingContainerId)) {
    throw "Generated validation container name already exists: $container"
  }

  $containerId = docker run --detach --name $container `
    --label kora.slice=s1.2-03a-validation `
    --env POSTGRES_USER=kora_s1203a_admin `
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password `
    --env POSTGRES_DB=postgres `
    --mount "type=bind,source=$ownerSecretFile,target=/run/secrets/postgres_password,readonly" `
    --mount "type=bind,source=$runtimeSecretFile,target=/run/secrets/postgres_runtime_password,readonly" `
    --mount "type=bind,source=$provisionScript,target=/usr/local/bin/kora-provision-postgresql-runtime.sh,readonly" `
    --publish 127.0.0.1::5432 `
    --tmpfs /var/lib/postgresql:rw,nosuid,nodev `
    $image
  $runExitCode = $LASTEXITCODE

  $createdContainerId = docker container ls --all --quiet --filter "name=^/$container$"
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect Docker container names after creation.'
  }
  if (-not [string]::IsNullOrWhiteSpace($createdContainerId)) {
    $ownedContainerId = docker container ls --all --quiet `
      --filter "name=^/$container$" `
      --filter 'label=kora.slice=s1.2-03a-validation'
    if ($LASTEXITCODE -ne 0 -or $ownedContainerId -ne $createdContainerId) {
      throw "Refusing cleanup ownership for unexpected container label on $container."
    }
    $containerCreated = $true
  }

  if ($runExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Unable to create the isolated PostgreSQL validation container.'
  }
  Write-Output "POSTGRESQL_RUNTIME_CONTAINER_ISOLATION_PASS image=$image storage=tmpfs bind=127.0.0.1"

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    docker exec $container pg_isready --username=kora_s1203a_admin --dbname=postgres *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    throw 'The isolated PostgreSQL validation container did not become ready.'
  }

  $portLine = docker port $container 5432/tcp
  if ($LASTEXITCODE -ne 0 -or $portLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated loopback PostgreSQL port.'
  }

  $env:S1203A_EPHEMERAL_POSTGRES = '1'
  $env:S1203A_ADMIN_HOST = '127.0.0.1'
  $env:S1203A_ADMIN_PORT = $Matches[1]
  $env:S1203A_ADMIN_DATABASE = 'postgres'
  $env:S1203A_ADMIN_USER = 'kora_s1203a_admin'
  $env:S1203A_ADMIN_PASSWORD = $ownerPassword
  $env:S1203A_RUNTIME_PASSWORD = $runtimePassword
  $env:S1203A_VALIDATION_CONTAINER = $container

  & node (Join-Path $PSScriptRoot 'validate-runtime-boundary.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw "S1.2-03A runtime boundary validation exited with code $LASTEXITCODE."
  }
}
catch {
  $validationError = $_.Exception
}
finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  $ownerPassword = $null
  $runtimePassword = $null

  if ($containerCreated) {
    try {
      docker rm --force $container *> $null
      if ($LASTEXITCODE -ne 0) {
        throw "Targeted cleanup failed for validation container $container."
      }
      Write-Output 'TARGETED_RUNTIME_VALIDATION_CONTAINER_REMOVED'
    }
    catch {
      $cleanupErrors += $_.Exception
    }
  }

  foreach ($secretFile in @($ownerSecretFile, $runtimeSecretFile)) {
    try {
      if (Test-Path -LiteralPath $secretFile) {
        [IO.File]::Delete($secretFile)
      }
    }
    catch {
      $cleanupErrors += $_.Exception
    }
  }
  try {
    if ($secretDirectoryCreated -and (Test-Path -LiteralPath $secretDirectory)) {
      [IO.Directory]::Delete($secretDirectory, $false)
    }
    Write-Output 'TARGETED_RUNTIME_VALIDATION_SECRETS_REMOVED'
  }
  catch {
    $cleanupErrors += $_.Exception
  }
}

if ($validationError -ne $null -and $cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new(
    'S1.2-03A validation and targeted cleanup both failed.',
    [Exception[]](@($validationError) + $cleanupErrors)
  )
}
if ($validationError -ne $null) {
  throw $validationError
}
if ($cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new('S1.2-03A targeted cleanup failed.', [Exception[]]$cleanupErrors)
}
