[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DockerCommand = @(Get-Command docker -CommandType Application -ErrorAction Stop)[0].Source
$NodeCommand = @(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source

$ExpectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$ActualRoot = [IO.Path]::GetFullPath((Get-Location).Path)
$Instance = [Environment]::GetEnvironmentVariable('KORA_C2B_INSTANCE')
if ([string]::IsNullOrWhiteSpace($Instance) -or $Instance -eq 'local' -or $Instance -notmatch '^c2b-[a-z0-9-]{8,80}$') {
  throw 'KORA_C2B_INSTANCE must identify a dedicated non-local campaign.'
}
if ($ActualRoot -cne $ExpectedRoot) { throw 'C2b validation must start from the resolved repository root.' }

$Suffix = $Instance.Substring(4)
$Container = "kora-c2b-$Suffix-postgres"
$Network = "kora-c2b-$Suffix-network"
$Image = 'postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15'
$FreshDatabase = 'kora_c2b_fresh'
$Owner = 'kora_owner'
$SecretRoot = Join-Path ([IO.Path]::GetTempPath()) ("kora-c2b-secrets-$Suffix")
$CreatedContainer = $false
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
  $encoding = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText($path, $Value + "`n", $encoding)
}

function Docker([string[]]$Arguments) {
  $output = @(& $DockerCommand @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($Arguments[0]) $($Arguments[1])`n$($output -join "`n")" }
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

$Before = Inventory
try {
  if (@(& $DockerCommand container ls --all --filter "name=^/$Container$" --quiet).Count -ne 0) {
    throw "Campaign container already exists: $Container"
  }
  if (@(& $DockerCommand network ls --filter "name=^$Network$" --quiet).Count -ne 0) {
    throw "Campaign network already exists: $Network"
  }
  [IO.Directory]::CreateDirectory($SecretRoot) | Out-Null
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
  }
  if (@($secrets.Values | Sort-Object -Unique).Count -ne $secrets.Count) {
    throw 'Ephemeral database secrets are not pairwise unique.'
  }
  foreach ($entry in $secrets.GetEnumerator()) { Write-Secret $entry.Key $entry.Value }

  Docker @('network', 'create', '--label', 'com.kora-plus.managed=true', '--label', "com.kora-plus.project=$Instance", $Network) | Out-Null
  $CreatedNetwork = $true
  $Provision = [IO.Path]::GetFullPath((Join-Path $ExpectedRoot 'infra\postgres\provision-runtime.sh'))
  Docker @(
    'run', '--detach', '--name', $Container, '--network', $Network,
    '--label', 'com.kora-plus.managed=true', '--label', "com.kora-plus.project=$Instance",
    '--tmpfs', '/var/lib/postgresql:rw,noexec,nosuid,size=768m',
    '--mount', "type=bind,src=$SecretRoot,dst=/run/secrets,readonly",
    '--mount', "type=bind,src=$Provision,dst=/usr/local/bin/kora-provision-postgresql-runtime.sh,readonly",
    '--publish', '127.0.0.1::5432',
    '--env', "POSTGRES_DB=$FreshDatabase", '--env', "POSTGRES_USER=$Owner",
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
    $Image
  ) | Out-Null
  $CreatedContainer = $true

  $ready = $false
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  while ([DateTime]::UtcNow -lt $deadline) {
    $probe = Docker-Status @('exec', $Container, 'pg_isready', '--host=127.0.0.1', '--port=5432', "--username=$Owner", "--dbname=$FreshDatabase")
    if ($probe.Code -eq 0) { $ready = $true; break }
    $running = Docker-Status @('inspect', '--format', '{{.State.Running}}', $Container)
    if ($running.Code -ne 0 -or $running.Stdout.Trim() -cne 'true') {
      $logs = Docker-Status @('logs', $Container)
      throw "Ephemeral PostgreSQL exited before readiness.`n$($logs.Stdout)$($logs.Stderr)"
    }
    Start-Sleep -Milliseconds 750
  }
  if (-not $ready) { throw 'Ephemeral PostgreSQL did not become ready within 120 seconds.' }
  $portLine = (Docker @('port', $Container, '5432/tcp') | Select-Object -First 1)
  if ($portLine -notmatch '127\.0\.0\.1:(\d+)$') { throw 'Unable to resolve the isolated PostgreSQL port.' }
  $Port = [int]$Matches[1]
  $encodedOwner = [Uri]::EscapeDataString($secrets.postgres_password)
  $OwnerUrl = "postgresql://${Owner}:${encodedOwner}@127.0.0.1:${Port}/${FreshDatabase}?schema=public"
  $encodedC1Writer = [Uri]::EscapeDataString($secrets.postgres_admin_writer_password)
  $encodedC2aWriter = [Uri]::EscapeDataString($secrets.postgres_admin_c2a_writer_password)
  $encodedC2bAuditApi = [Uri]::EscapeDataString($secrets.postgres_admin_c2b_audit_api_password)
  $encodedC2bExportWorker = [Uri]::EscapeDataString($secrets.postgres_admin_c2b_export_worker_password)
  $C1WriterUrl = "postgresql://kora_admin_writer:${encodedC1Writer}@127.0.0.1:${Port}/${FreshDatabase}?schema=public"
  $C2aWriterUrl = "postgresql://kora_admin_c2a_writer:${encodedC2aWriter}@127.0.0.1:${Port}/${FreshDatabase}?schema=public"
  $C2bAuditApiUrl = "postgresql://kora_admin_c2b_audit_api:${encodedC2bAuditApi}@127.0.0.1:${Port}/${FreshDatabase}?schema=public"
  $C2bExportWorkerUrl = "postgresql://kora_admin_c2b_export_worker:${encodedC2bExportWorker}@127.0.0.1:${Port}/${FreshDatabase}?schema=public"

  [Console]::Out.WriteLine("C2B_CHILD_ATTESTATION instance=$Instance project=$Instance root=$ActualRoot container=$Container network=$Network port=$Port")
  $databaseEnvironment = @('DATABASE_USER','DATABASE_PASSWORD','DATABASE_HOST','DATABASE_PORT','DATABASE_NAME')
  $oldDatabaseEnvironment = [ordered]@{}
  foreach ($name in $databaseEnvironment) { $oldDatabaseEnvironment[$name] = [Environment]::GetEnvironmentVariable($name) }
  try {
    $env:DATABASE_USER = $Owner
    $env:DATABASE_PASSWORD = $secrets.postgres_password
    $env:DATABASE_HOST = '127.0.0.1'
    $env:DATABASE_PORT = [string]$Port
    $env:DATABASE_NAME = $FreshDatabase
    & $NodeCommand node_modules/prisma/build/index.js migrate deploy --config apps/api/prisma.config.ts
    if ($LASTEXITCODE -ne 0) { throw 'Fresh Prisma migrate deploy failed.' }
  }
  finally {
    foreach ($name in $oldDatabaseEnvironment.Keys) {
      [Environment]::SetEnvironmentVariable($name, $oldDatabaseEnvironment[$name])
    }
  }

  Docker @('exec', $Container, 'sh', '/usr/local/bin/kora-provision-postgresql-runtime.sh') | ForEach-Object { [Console]::Out.WriteLine($_) }

  $previous = [ordered]@{}
  foreach ($name in @(
    'KORA_C2B_EXPECTED_INSTANCE',
    'S1203C2B_OWNER_DATABASE_URL',
    'S1203C2B_C1_WRITER_DATABASE_URL',
    'S1203C2B_C2A_WRITER_DATABASE_URL',
    'S1203C2B_AUDIT_API_DATABASE_URL',
    'S1203C2B_EXPORT_WORKER_DATABASE_URL',
    'S1203C2B_FRESH_DATABASE',
    'S1203C2B_ADMIN_DATABASE'
  )) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name)
  }
  try {
    $env:KORA_C2B_EXPECTED_INSTANCE = $Instance
    $env:S1203C2B_OWNER_DATABASE_URL = $OwnerUrl
    $env:S1203C2B_C1_WRITER_DATABASE_URL = $C1WriterUrl
    $env:S1203C2B_C2A_WRITER_DATABASE_URL = $C2aWriterUrl
    $env:S1203C2B_AUDIT_API_DATABASE_URL = $C2bAuditApiUrl
    $env:S1203C2B_EXPORT_WORKER_DATABASE_URL = $C2bExportWorkerUrl
    $env:S1203C2B_FRESH_DATABASE = $FreshDatabase
    $env:S1203C2B_ADMIN_DATABASE = 'postgres'
    & $NodeCommand apps/api/prisma/validate-admin-security-c2b-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw 'C2b PostgreSQL validator failed.' }
  }
  finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name]) }
  }
}
finally {
  if ($CreatedContainer) {
    & $DockerCommand container inspect $Container *> $null
    if ($LASTEXITCODE -eq 0) { & $DockerCommand container rm --force $Container *> $null }
  }
  if ($CreatedNetwork) { & $DockerCommand network rm $Network *> $null }
  if ([IO.Directory]::Exists($SecretRoot)) {
    $resolved = [IO.Path]::GetFullPath($SecretRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to clean a secret directory outside the system temporary root.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

$After = Inventory
foreach ($surface in @('containers','volumes','networks','images')) {
  if (@(Compare-Object $Before[$surface] $After[$surface]).Count -ne 0) {
    throw "Foreign Docker $surface inventory changed during C2b validation."
  }
}
[Console]::Out.WriteLine('C2B_RUNTIME_WRAPPER_PASS foreign_inventory=preserved cleanup=targeted')
