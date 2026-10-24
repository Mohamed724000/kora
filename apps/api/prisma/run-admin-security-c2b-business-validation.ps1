[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DockerCommand = @(Get-Command docker -CommandType Application -ErrorAction Stop)[0].Source
$NodeCommand = @(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
$NpmCommand = @(Get-Command npm -CommandType Application -ErrorAction Stop)[0].Source

$ExpectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$ActualRoot = [IO.Path]::GetFullPath((Get-Location).Path)
$Instance = [Environment]::GetEnvironmentVariable('KORA_C2B_INSTANCE')
if ([string]::IsNullOrWhiteSpace($Instance) -or $Instance -eq 'local' -or
    $Instance -notmatch '^c2b-[a-z0-9-]{8,80}$') {
  throw 'KORA_C2B_INSTANCE must identify a dedicated non-local campaign.'
}
if ($ActualRoot -cne $ExpectedRoot) {
  throw 'C2b business validation must start from the resolved repository root.'
}

$Suffix = $Instance.Substring(4)
$PostgresContainer = "kora-c2b-$Suffix-business-postgres"
$RedisContainer = "kora-c2b-$Suffix-business-redis"
$Network = "kora-c2b-$Suffix-business-network"
$PostgresImage = 'postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$RedisImage = 'redis:7.2.15-alpine3.21@sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6'
$Database = 'kora_c2b_business'
$Owner = 'kora_owner'
$SecretRoot = Join-Path ([IO.Path]::GetTempPath()) "kora-c2b-business-secrets-$Suffix"
$StorageRoot = Join-Path ([IO.Path]::GetTempPath()) "kora-c2b-business-storage-$Suffix"
$CreatedPostgres = $false
$CreatedRedis = $false
$CreatedNetwork = $false

function New-Secret {
  $bytes = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  }
  finally { $generator.Dispose() }
}

function Write-Secret([string]$Name, [string]$Value) {
  $path = Join-Path $SecretRoot $Name
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Value + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  }
  finally { $stream.Dispose() }
}

function Write-HelperScript([string]$Name, [string]$Value) {
  $path = Join-Path $SecretRoot $Name
  $encoding = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText($path, $Value.Replace("`r`n", "`n") + "`n", $encoding)
}

function Docker([string[]]$Arguments) {
  $output = @(& $DockerCommand @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: $($Arguments -join ' ')`n$($output -join "`n")"
  }
  return $output
}

function Docker-Status([string[]]$Arguments) {
  $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) ("kora-c2b-docker-$([Guid]::NewGuid().ToString('N')).out")
  $stderrPath = Join-Path ([IO.Path]::GetTempPath()) ("kora-c2b-docker-$([Guid]::NewGuid().ToString('N')).err")
  try {
    $process = Start-Process -FilePath $DockerCommand -ArgumentList $Arguments -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    return [pscustomobject]@{
      Code = $process.ExitCode
      Stdout = [IO.File]::ReadAllText($stdoutPath)
      Stderr = [IO.File]::ReadAllText($stderrPath)
    }
  }
  finally {
    if (Test-Path -LiteralPath $stdoutPath) { Remove-Item -LiteralPath $stdoutPath -Force }
    if (Test-Path -LiteralPath $stderrPath) { Remove-Item -LiteralPath $stderrPath -Force }
  }
}

function Inventory {
  return [ordered]@{
    containers = @(& $DockerCommand container ls --all --no-trunc --format '{{.ID}}|{{.Names}}|{{.State}}|{{.Ports}}' | Sort-Object)
    volumes = @(& $DockerCommand volume ls --quiet | Sort-Object)
    networks = @(& $DockerCommand network ls --no-trunc --format '{{.ID}}|{{.Name}}' | Sort-Object)
    images = @(& $DockerCommand image ls --all --no-trunc --digests --format '{{.Repository}}:{{.Tag}}|{{.Digest}}|{{.ID}}' | Sort-Object)
  }
}

function Wait-Postgres {
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  while ([DateTime]::UtcNow -lt $deadline) {
    $probe = Docker-Status @('exec', $PostgresContainer, 'pg_isready', '--host=127.0.0.1', '--port=5432', "--username=$Owner", "--dbname=$Database")
    if ($probe.Code -eq 0) { return }
    Start-Sleep -Milliseconds 750
  }
  throw 'Ephemeral PostgreSQL did not become ready within 120 seconds.'
}

function Wait-Redis {
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ([DateTime]::UtcNow -lt $deadline) {
    $probe = Docker-Status @('exec', $RedisContainer, 'sh', '/run/secrets/redis-healthcheck.sh')
    if ($probe.Code -eq 0 -and $probe.Stdout.Trim() -ceq 'PONG') { return }
    $running = Docker-Status @('inspect', '--format', '{{.State.Running}}', $RedisContainer)
    if ($running.Code -ne 0 -or $running.Stdout.Trim() -cne 'true') {
      $logs = Docker-Status @('logs', $RedisContainer)
      throw "Ephemeral Redis exited before readiness.`n$($logs.Stdout)$($logs.Stderr)"
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'Ephemeral Redis did not become ready within 60 seconds.'
}

function Resolve-Port([string]$Container, [string]$Port) {
  $line = Docker @('port', $Container, "$Port/tcp") | Select-Object -First 1
  if ($line -notmatch '127\.0\.0\.1:(\d+)$') { throw "Unable to resolve port $Port for $Container." }
  return [int]$Matches[1]
}

$Before = Inventory
try {
  foreach ($target in @($PostgresContainer, $RedisContainer)) {
    if (@(& $DockerCommand container ls --all --filter "name=^/$target$" --quiet).Count -ne 0) {
      throw "Campaign container already exists: $target"
    }
  }
  if (@(& $DockerCommand network ls --filter "name=^$Network$" --quiet).Count -ne 0) {
    throw "Campaign network already exists: $Network"
  }
  foreach ($image in @($PostgresImage, $RedisImage)) {
    & $DockerCommand image inspect $image *> $null
    if ($LASTEXITCODE -ne 0) { throw "Required pinned image is not already present: $image" }
  }
  [IO.Directory]::CreateDirectory($SecretRoot) | Out-Null
  [IO.Directory]::CreateDirectory($StorageRoot) | Out-Null
  $secrets = [ordered]@{
    postgres_password = New-Secret
    postgres_runtime_password = New-Secret
    postgres_admin_writer_password = New-Secret
    postgres_admin_c2a_writer_password = New-Secret
    postgres_admin_c2a_notification_worker_password = New-Secret
    postgres_admin_c2a_expiration_worker_password = New-Secret
    postgres_admin_c2a_bootstrap_password = New-Secret
    postgres_admin_c2b_audit_api_password = New-Secret
    postgres_admin_c2b_export_worker_password = New-Secret
    redis_password = New-Secret
  }
  if (@($secrets.Values | Sort-Object -Unique).Count -ne $secrets.Count) {
    throw 'Ephemeral service secrets are not pairwise unique.'
  }
  foreach ($entry in $secrets.GetEnumerator()) { Write-Secret $entry.Key $entry.Value }
  Write-HelperScript 'redis-entrypoint.sh' @'
#!/bin/sh
set -eu
exec redis-server --save "" --appendonly no --requirepass "$(cat /run/secrets/redis_password)"
'@
  Write-HelperScript 'redis-healthcheck.sh' @'
#!/bin/sh
set -eu
exec redis-cli --no-auth-warning -a "$(cat /run/secrets/redis_password)" ping
'@

  Docker @('network', 'create', '--label', 'com.kora-plus.managed=true', '--label', "com.kora-plus.project=$Instance", $Network) | Out-Null
  $CreatedNetwork = $true
  $Provision = [IO.Path]::GetFullPath((Join-Path $ExpectedRoot 'infra\postgres\provision-runtime.sh'))
  Docker @(
    'run', '--detach', '--name', $PostgresContainer, '--network', $Network,
    '--label', 'com.kora-plus.managed=true', '--label', "com.kora-plus.project=$Instance",
    '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=768m',
    '--mount', "type=bind,src=$SecretRoot,dst=/run/secrets,readonly",
    '--mount', "type=bind,src=$Provision,dst=/usr/local/bin/kora-provision-postgresql-runtime.sh,readonly",
    '--publish', '127.0.0.1::5432',
    '--env', "POSTGRES_DB=$Database", '--env', "POSTGRES_USER=$Owner",
    '--env', 'POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password',
    '--env', 'KORA_POSTGRES_RUNTIME_USER=kora_runtime',
    '--env', 'KORA_POSTGRES_ADMIN_WRITER_USER=kora_admin_writer',
    '--env', 'KORA_POSTGRES_C2A_ENABLED=true',
    '--env', 'KORA_POSTGRES_C2A_WRITER_USER=kora_admin_c2a_writer',
    '--env', 'KORA_POSTGRES_C2A_NOTIFICATION_WORKER_USER=kora_admin_c2a_notification_worker',
    '--env', 'KORA_POSTGRES_C2A_EXPIRATION_WORKER_USER=kora_admin_c2a_expiration_worker',
    '--env', 'KORA_POSTGRES_C2A_BOOTSTRAP_USER=kora_admin_c2a_bootstrap',
    '--env', 'KORA_POSTGRES_C2A_SECRET_DIRECTORY=/run/secrets',
    '--env', 'KORA_POSTGRES_C2B_ENABLED=true',
    '--env', 'KORA_POSTGRES_C2B_AUDIT_API_USER=kora_admin_c2b_audit_api',
    '--env', 'KORA_POSTGRES_C2B_EXPORT_WORKER_USER=kora_admin_c2b_export_worker',
    '--env', 'KORA_POSTGRES_C2B_SECRET_DIRECTORY=/run/secrets',
    $PostgresImage
  ) | Out-Null
  $CreatedPostgres = $true
  Docker @(
    'run', '--detach', '--name', $RedisContainer, '--network', $Network,
    '--label', 'com.kora-plus.managed=true', '--label', "com.kora-plus.project=$Instance",
    '--tmpfs', '/data:rw,noexec,nosuid,size=128m',
    '--mount', "type=bind,src=$SecretRoot,dst=/run/secrets,readonly",
    '--publish', '127.0.0.1::6379', '--entrypoint', 'sh', $RedisImage,
    '/run/secrets/redis-entrypoint.sh'
  ) | Out-Null
  $CreatedRedis = $true

  Wait-Postgres
  Wait-Redis
  $PostgresPort = Resolve-Port $PostgresContainer '5432'
  $RedisPort = Resolve-Port $RedisContainer '6379'
  [Console]::Out.WriteLine("C2B_BUSINESS_CHILD_ATTESTATION instance=$Instance root=$ActualRoot postgres=$PostgresContainer redis=$RedisContainer network=$Network")

  $databaseNames = @('DATABASE_USER', 'DATABASE_PASSWORD', 'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME')
  $previousDatabase = [ordered]@{}
  foreach ($name in $databaseNames) { $previousDatabase[$name] = [Environment]::GetEnvironmentVariable($name) }
  try {
    $env:DATABASE_USER = $Owner
    $env:DATABASE_PASSWORD = $secrets.postgres_password
    $env:DATABASE_HOST = '127.0.0.1'
    $env:DATABASE_PORT = [string]$PostgresPort
    $env:DATABASE_NAME = $Database
    & $NodeCommand node_modules/prisma/build/index.js migrate deploy --config apps/api/prisma.config.ts
    if ($LASTEXITCODE -ne 0) { throw 'C2b business Prisma migrate deploy failed.' }
  }
  finally {
    foreach ($name in $previousDatabase.Keys) {
      [Environment]::SetEnvironmentVariable($name, $previousDatabase[$name])
    }
  }
  Docker @('exec', $PostgresContainer, '/usr/local/bin/kora-provision-postgresql-runtime.sh') | ForEach-Object { [Console]::Out.WriteLine($_) }

  & $NpmCommand run build --workspace '@kora-plus/api'
  if ($LASTEXITCODE -ne 0) { throw 'C2b business API build failed.' }

  $businessNames = @(
    'KORA_C2B_EXPECTED_INSTANCE', 'S1203C2B_BUSINESS_E2E',
    'S1203C2B_BUSINESS_DATABASE', 'S1203C2B_BUSINESS_POSTGRES_PORT',
    'S1203C2B_BUSINESS_OWNER_PASSWORD', 'S1203C2B_BUSINESS_READER_PASSWORD',
    'S1203C2B_BUSINESS_C1_WRITER_PASSWORD', 'S1203C2B_BUSINESS_AUDIT_API_PASSWORD',
    'S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD', 'S1203C2B_BUSINESS_REDIS_PORT',
    'S1203C2B_BUSINESS_REDIS_PASSWORD', 'S1203C2B_TEST_STORAGE_DIRECTORY'
  )
  $previousBusiness = [ordered]@{}
  foreach ($name in $businessNames) { $previousBusiness[$name] = [Environment]::GetEnvironmentVariable($name) }
  try {
    $env:KORA_C2B_EXPECTED_INSTANCE = $Instance
    $env:S1203C2B_BUSINESS_E2E = '1'
    $env:S1203C2B_BUSINESS_DATABASE = $Database
    $env:S1203C2B_BUSINESS_POSTGRES_PORT = [string]$PostgresPort
    $env:S1203C2B_BUSINESS_OWNER_PASSWORD = $secrets.postgres_password
    $env:S1203C2B_BUSINESS_READER_PASSWORD = $secrets.postgres_runtime_password
    $env:S1203C2B_BUSINESS_C1_WRITER_PASSWORD = $secrets.postgres_admin_writer_password
    $env:S1203C2B_BUSINESS_AUDIT_API_PASSWORD = $secrets.postgres_admin_c2b_audit_api_password
    $env:S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD = $secrets.postgres_admin_c2b_export_worker_password
    $env:S1203C2B_BUSINESS_REDIS_PORT = [string]$RedisPort
    $env:S1203C2B_BUSINESS_REDIS_PASSWORD = $secrets.redis_password
    $env:S1203C2B_TEST_STORAGE_DIRECTORY = $StorageRoot
    & $NodeCommand apps/api/prisma/validate-admin-security-c2b-business.mjs
    if ($LASTEXITCODE -ne 0) { throw 'C2b business validator failed.' }
  }
  finally {
    foreach ($name in $previousBusiness.Keys) {
      [Environment]::SetEnvironmentVariable($name, $previousBusiness[$name])
    }
  }
}
finally {
  foreach ($target in @(
    [pscustomobject]@{ Created = $CreatedRedis; Name = $RedisContainer },
    [pscustomobject]@{ Created = $CreatedPostgres; Name = $PostgresContainer }
  )) {
    if ($target.Created) {
      & $DockerCommand container inspect $target.Name *> $null
      if ($LASTEXITCODE -eq 0) { & $DockerCommand container rm --force $target.Name *> $null }
    }
  }
  if ($CreatedNetwork) { & $DockerCommand network rm $Network *> $null }
  foreach ($directory in @($SecretRoot, $StorageRoot)) {
    if ([IO.Directory]::Exists($directory)) {
      $resolved = [IO.Path]::GetFullPath($directory)
      $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
      if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean non-temporary campaign directory: $resolved"
      }
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}

$After = Inventory
foreach ($surface in @('containers', 'volumes', 'networks', 'images')) {
  if (@(Compare-Object $Before[$surface] $After[$surface]).Count -ne 0) {
    throw "Foreign Docker $surface inventory changed during C2b business validation."
  }
}
[Console]::Out.WriteLine('C2B_BUSINESS_WRAPPER_PASS foreign_inventory=preserved cleanup=targeted')
