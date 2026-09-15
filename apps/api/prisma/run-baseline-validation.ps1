[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$image = 'postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$container = 'kora-s1202-validation-' + $PID + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$password = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$environmentNames = @(
  'S1202_EPHEMERAL_POSTGRES',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD'
)
$savedEnvironment = @{}
$containerCreated = $false
$validationFailed = $false

if ($container -notmatch '^kora-s1202-validation-[0-9]+-[0-9a-f]{8}$') {
  throw 'Generated container name failed the destructive-operation guard.'
}

foreach ($name in $environmentNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  $existingContainerId = docker container ls --all --quiet --filter "name=^/$container$"
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect Docker container names before validation.'
  }
  if (-not [string]::IsNullOrWhiteSpace($existingContainerId)) {
    throw "Generated validation container name already exists: $container"
  }

  $containerId = docker run --detach --name $container `
    --label kora.slice=s1.2-02-validation `
    --env POSTGRES_USER=kora_s1202 `
    --env POSTGRES_PASSWORD=$password `
    --env POSTGRES_DB=postgres `
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
      --filter 'label=kora.slice=s1.2-02-validation'
    if ($LASTEXITCODE -ne 0 -or $ownedContainerId -ne $createdContainerId) {
      throw "Refusing cleanup ownership for unexpected container label on $container."
    }
    $containerCreated = $true
  }

  if ($runExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Unable to create the isolated PostgreSQL validation container.'
  }
  Write-Output "POSTGRESQL_CONTAINER_ISOLATION_PASS image=$image storage=tmpfs bind=127.0.0.1"

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    docker exec $container pg_isready --username=kora_s1202 --dbname=postgres *> $null
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

  $env:S1202_EPHEMERAL_POSTGRES = '1'
  $env:DATABASE_HOST = '127.0.0.1'
  $env:DATABASE_PORT = $Matches[1]
  $env:DATABASE_NAME = 'postgres'
  $env:DATABASE_USER = 'kora_s1202'
  $env:DATABASE_PASSWORD = $password

  & node (Join-Path $PSScriptRoot 'validate-baseline.mjs')
  if ($LASTEXITCODE -ne 0) {
    $validationFailed = $true
    throw "S1.2-02 baseline validation exited with code $LASTEXITCODE."
  }
}
finally {
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  $password = $null

  if ($containerCreated) {
    docker rm --force $container *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Targeted cleanup failed for validation container $container."
    }
    Write-Output "TARGETED_VALIDATION_CONTAINER_REMOVED $container"
  }
}

if ($validationFailed) {
  exit 1
}
