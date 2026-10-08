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
$redisImage = 'redis:7.2.15-alpine3.21@sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6'
$container = 'kora-s1203c1-validation-' + $PID + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$redisSuffix = (Get-Random -Minimum 10000000 -Maximum 100000000).ToString()
$redisContainer = 'kora-s1203c1-redis-validation-' + $redisSuffix
$redisVolume = $redisContainer + '-data'
$e2eDatabase = 'kora_s1203c1_e_' + $PID + '_' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$secretDirectory = Join-Path ([IO.Path]::GetTempPath()) ('kora-s1203c1-secret-' + [guid]::NewGuid().ToString('N'))
$ownerSecretFile = Join-Path $secretDirectory 'postgres_password'
$readerSecretFile = Join-Path $secretDirectory 'postgres_runtime_password'
$writerSecretFile = Join-Path $secretDirectory 'postgres_admin_writer_password'
$provisionScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\infra\postgres\provision-runtime.sh'))
$ownerPassword = New-EphemeralSecret
$readerPassword = New-EphemeralSecret
$writerPassword = New-EphemeralSecret
$environmentNames = @(
  'S1203C1_EPHEMERAL_POSTGRES', 'S1203C1_ADMIN_HOST', 'S1203C1_ADMIN_PORT',
  'S1203C1_ADMIN_USER', 'S1203C1_ADMIN_PASSWORD', 'S1203C1_READER_USER',
  'S1203C1_READER_PASSWORD', 'S1203C1_WRITER_USER', 'S1203C1_WRITER_PASSWORD',
  'S1203C1_VALIDATION_CONTAINER', 'S1203C1_HTTP_E2E', 'S1203C1_E2E_DATABASE',
  'S1203C1_E2E_OWNER_USER', 'S1203C1_E2E_OWNER_PASSWORD', 'S1203C1_E2E_POSTGRES_PORT',
  'S1203C1_E2E_READER_USER', 'S1203C1_E2E_READER_PASSWORD',
  'S1203C1_E2E_WRITER_USER', 'S1203C1_E2E_WRITER_PASSWORD', 'S1203C1_E2E_REDIS_PORT',
  'S1203C1_REAL_REDIS', 'S1203C1_REDIS_PORT', 'S1203C1_REDIS_CONTAINER',
  'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD',
  'DATABASE_SSL'
)
$savedEnvironment = @{}
$containerCreated = $false
$redisContainerCreated = $false
$redisVolumeCreated = $false
$e2eDatabaseCreated = $false
$secretDirectoryCreated = $false
$validationError = $null
$cleanupErrors = @()

if ($container -notmatch '^kora-s1203c1-validation-[0-9]+-[0-9a-f]{8}$') {
  throw 'Generated container name failed the destructive-operation guard.'
}
if ($redisContainer -notmatch '^kora-s1203c1-redis-validation-[0-9]{8}$') {
  throw 'Generated Redis container name failed the destructive-operation guard.'
}
if ($redisVolume -notmatch '^kora-s1203c1-redis-validation-[0-9]{8}-data$') {
  throw 'Generated Redis volume name failed the destructive-operation guard.'
}
if ($e2eDatabase -notmatch '^kora_s1203c1_e_[0-9]+_[0-9a-f]{8}$') {
  throw 'Generated HTTP E2E database name failed the destructive-operation guard.'
}
if (-not (Test-Path -LiteralPath $provisionScript -PathType Leaf)) {
  throw 'The PostgreSQL runtime provisioner is missing.'
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
  [IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
  $secretDirectoryCreated = $true
  [IO.File]::WriteAllText($ownerSecretFile, $ownerPassword + [Environment]::NewLine)
  [IO.File]::WriteAllText($readerSecretFile, $readerPassword + [Environment]::NewLine)
  [IO.File]::WriteAllText($writerSecretFile, $writerPassword + [Environment]::NewLine)

  $containerId = docker run --detach --name $container `
    --label kora.slice=s1.2-03c1-validation `
    --env POSTGRES_USER=kora_s1203c1_admin `
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password `
    --env POSTGRES_DB=postgres `
    --mount "type=bind,source=$ownerSecretFile,target=/run/secrets/postgres_password,readonly" `
    --mount "type=bind,source=$readerSecretFile,target=/run/secrets/postgres_runtime_password,readonly" `
    --mount "type=bind,source=$writerSecretFile,target=/run/secrets/postgres_admin_writer_password,readonly" `
    --mount "type=bind,source=$provisionScript,target=/usr/local/bin/kora-provision-postgresql-runtime.sh,readonly" `
    --publish 127.0.0.1::5432 `
    --tmpfs /var/lib/postgresql:rw,nosuid,nodev `
    $image
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Unable to create the isolated PostgreSQL C1 validation container.'
  }
  $containerCreated = $true
  Write-Output "POSTGRESQL_C1_CONTAINER_ISOLATION_PASS image=$image storage=tmpfs bind=127.0.0.1"

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    docker exec $container pg_isready --username=kora_s1203c1_admin --dbname=postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'The isolated PostgreSQL C1 container did not become ready.' }

  $portLine = docker port $container 5432/tcp
  if ($LASTEXITCODE -ne 0 -or $portLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated PostgreSQL C1 port.'
  }
  $postgresPort = $Matches[1]

  $env:S1203C1_EPHEMERAL_POSTGRES = '1'
  $env:S1203C1_ADMIN_HOST = '127.0.0.1'
  $env:S1203C1_ADMIN_PORT = $postgresPort
  $env:S1203C1_ADMIN_USER = 'kora_s1203c1_admin'
  $env:S1203C1_ADMIN_PASSWORD = $ownerPassword
  $env:S1203C1_READER_USER = 'kora_s1203c1_reader'
  $env:S1203C1_READER_PASSWORD = $readerPassword
  $env:S1203C1_WRITER_USER = 'kora_s1203c1_writer'
  $env:S1203C1_WRITER_PASSWORD = $writerPassword
  $env:S1203C1_VALIDATION_CONTAINER = $container

  & node (Join-Path $PSScriptRoot 'validate-admin-auth-runtime.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw "S1.2-03C1 PostgreSQL validation exited with code $LASTEXITCODE."
  }

  docker exec $container createdb --username=kora_s1203c1_admin $e2eDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create the isolated C1 HTTP E2E database.' }
  $e2eDatabaseCreated = $true

  $redisPortListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $redisPortListener.Start()
    $redisHostPort = ([Net.IPEndPoint]$redisPortListener.LocalEndpoint).Port
  }
  finally {
    $redisPortListener.Stop()
  }
  $redisVolumeId = docker volume create `
    --label kora.slice=s1.2-03c1-validation `
    $redisVolume
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($redisVolumeId)) {
    throw 'Unable to create the isolated Redis C1 validation volume.'
  }
  $redisVolumeCreated = $true
  $redisContainerId = docker run --detach --name $redisContainer `
    --label kora.slice=s1.2-03c1-validation `
    --publish "127.0.0.1:${redisHostPort}:6379" `
    --mount "type=volume,source=$redisVolume,target=/data" `
    $redisImage redis-server --appendonly yes --appendfsync always
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($redisContainerId)) {
    throw 'Unable to create the isolated Redis C1 validation container.'
  }
  $redisContainerCreated = $true
  $redisReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    $pong = docker exec $redisContainer redis-cli PING 2> $null
    if ($LASTEXITCODE -eq 0 -and $pong -eq 'PONG') { $redisReady = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $redisReady) { throw 'The isolated Redis C1 container did not become ready.' }
  $redisPortLine = docker port $redisContainer 6379/tcp
  if ($LASTEXITCODE -ne 0 -or $redisPortLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'Unable to resolve the isolated Redis C1 port.'
  }
  $redisPort = $Matches[1]

  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCommand) { $npmCommand = Get-Command npm -ErrorAction Stop }
  $env:DATABASE_HOST = '127.0.0.1'
  $env:DATABASE_PORT = $postgresPort
  $env:DATABASE_NAME = $e2eDatabase
  $env:DATABASE_USER = 'kora_s1203c1_admin'
  $env:DATABASE_PASSWORD = $ownerPassword
  $env:DATABASE_SSL = 'false'
  & $npmCommand.Source exec --workspace '@kora-plus/api' -- prisma migrate deploy --config prisma.config.ts
  if ($LASTEXITCODE -ne 0) { throw 'C1 HTTP E2E migration deployment failed.' }

  docker exec `
    --env "POSTGRES_DB=$e2eDatabase" `
    --env POSTGRES_USER=kora_s1203c1_admin `
    --env KORA_POSTGRES_RUNTIME_USER=kora_s1203c1_reader `
    --env KORA_POSTGRES_ADMIN_WRITER_USER=kora_s1203c1_writer `
    $container sh /usr/local/bin/kora-provision-postgresql-runtime.sh
  if ($LASTEXITCODE -ne 0) { throw 'C1 HTTP E2E role provisioning failed.' }

  $env:S1203C1_HTTP_E2E = '1'
  $env:S1203C1_E2E_DATABASE = $e2eDatabase
  $env:S1203C1_E2E_OWNER_USER = 'kora_s1203c1_admin'
  $env:S1203C1_E2E_OWNER_PASSWORD = $ownerPassword
  $env:S1203C1_E2E_POSTGRES_PORT = $postgresPort
  $env:S1203C1_E2E_READER_USER = 'kora_s1203c1_reader'
  $env:S1203C1_E2E_READER_PASSWORD = $readerPassword
  $env:S1203C1_E2E_WRITER_USER = 'kora_s1203c1_writer'
  $env:S1203C1_E2E_WRITER_PASSWORD = $writerPassword
  $env:S1203C1_E2E_REDIS_PORT = $redisPort
  $env:S1203C1_REAL_REDIS = '1'
  $env:S1203C1_REDIS_PORT = $redisPort
  $env:S1203C1_REDIS_CONTAINER = $redisContainer
  & $npmCommand.Source run test --workspace '@kora-plus/api' -- test/admin-auth.integration.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'C1 real HTTP integration validation failed.' }
  Write-Output 'S1.2-03C1_ADMIN_AUTH_HTTP_PASS operations=12 postgresql=real redis=real keys=ephemeral'
}
catch {
  $validationError = $_.Exception
}
finally {
  if ($redisContainerCreated) {
    try {
      docker rm --force $redisContainer *> $null
      if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $redisContainer." }
      Write-Output 'TARGETED_C1_HTTP_REDIS_CONTAINER_REMOVED'
    }
    catch { $cleanupErrors += $_.Exception }
  }
  if ($redisVolumeCreated) {
    try {
      docker volume rm $redisVolume *> $null
      if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $redisVolume." }
      Write-Output 'TARGETED_C1_HTTP_REDIS_VOLUME_REMOVED'
    }
    catch { $cleanupErrors += $_.Exception }
  }
  if ($e2eDatabaseCreated -and $containerCreated) {
    try {
      docker exec $container dropdb --force --username=kora_s1203c1_admin $e2eDatabase *> $null
      if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $e2eDatabase." }
      Write-Output 'TARGETED_C1_HTTP_DATABASE_REMOVED'
    }
    catch { $cleanupErrors += $_.Exception }
  }
  foreach ($name in $environmentNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  $ownerPassword = $null
  $readerPassword = $null
  $writerPassword = $null
  if ($containerCreated) {
    try {
      docker rm --force $container *> $null
      if ($LASTEXITCODE -ne 0) { throw "Targeted cleanup failed for $container." }
      Write-Output 'TARGETED_C1_VALIDATION_CONTAINER_REMOVED'
    }
    catch { $cleanupErrors += $_.Exception }
  }
  foreach ($secretFile in @($ownerSecretFile, $readerSecretFile, $writerSecretFile)) {
    try { if (Test-Path -LiteralPath $secretFile) { [IO.File]::Delete($secretFile) } }
    catch { $cleanupErrors += $_.Exception }
  }
  try {
    if ($secretDirectoryCreated -and (Test-Path -LiteralPath $secretDirectory)) {
      [IO.Directory]::Delete($secretDirectory, $false)
    }
    Write-Output 'TARGETED_C1_VALIDATION_SECRETS_REMOVED'
  }
  catch { $cleanupErrors += $_.Exception }
}

if ($validationError -ne $null -and $cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new('C1 validation and cleanup failed.', [Exception[]](@($validationError) + $cleanupErrors))
}
if ($validationError -ne $null) { throw $validationError }
if ($cleanupErrors.Count -gt 0) {
  throw [AggregateException]::new('C1 targeted cleanup failed.', [Exception[]]$cleanupErrors)
}
