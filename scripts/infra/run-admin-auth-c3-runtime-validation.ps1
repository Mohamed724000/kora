[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9][a-z0-9-]{7,39}$')]
  [string]$Instance,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceDirectory,

  [ValidateRange(1024, 65535)]
  [int]$HttpsPort = 18443,

  [ValidateSet('Complete', 'ChromiumWebKit', 'Firefox', IgnoreCase = $false)]
  [string]$BrowserProjectSet = 'Complete',

  [string]$FirefoxBrowserCacheRoot = '',

  [string]$FirefoxBrowserInventorySha256 = ''
)

$ErrorActionPreference = 'Stop'
$Utf8 = [Text.UTF8Encoding]::new($false)

# BEGIN C3 BROWSER TEST ARGUMENT FUNCTIONS
function Resolve-C3BrowserTestArguments([string]$ProjectSet) {
  $baseArguments = @('run', 'test:e2e', '--workspace', '@kora-plus/admin')
  switch -CaseSensitive ($ProjectSet) {
    'Complete' { return [string[]]$baseArguments }
    'ChromiumWebKit' {
      return [string[]]($baseArguments + @(
          '--',
          '--project',
          'chromium-c3',
          'webkit-public-smoke'
        ))
    }
    'Firefox' {
      return [string[]]($baseArguments + @(
          '--',
          '--project',
          'firefox-public-smoke'
        ))
    }
    default { throw 'Invalid C3 browser project set.' }
  }
}
# END C3 BROWSER TEST ARGUMENT FUNCTIONS

# BEGIN C3 QUALIFIED FIREFOX CACHE FUNCTIONS
function Get-C3FirefoxBrowserInventory([string]$FirefoxDirectory) {
  $records = @(
    Get-ChildItem -LiteralPath $FirefoxDirectory -Recurse -File -Force |
      ForEach-Object {
        [pscustomobject]@{
          RelativePath = [IO.Path]::GetRelativePath($FirefoxDirectory, $_.FullName).Replace('\', '/')
          Length = $_.Length
          Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
        }
      } |
      Sort-Object -Property RelativePath -CaseSensitive
  )
  $text = (($records | ForEach-Object {
        "$($_.RelativePath)`t$($_.Length)`t$($_.Sha256)"
      }) -join "`n") + "`n"
  $sha256 = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($Utf8.GetBytes($text))
  ).ToLowerInvariant()
  return [pscustomobject]@{
    Count = $records.Count
    Sha256 = $sha256
    Text = $text
  }
}

function Assert-C3FirefoxBrowserInventory($Inventory, [int]$ExpectedCount, [string]$ExpectedSha256) {
  if ($Inventory.Count -ne $ExpectedCount -or $Inventory.Sha256 -ne $ExpectedSha256) {
    throw 'The qualified Firefox browser inventory diverged.'
  }
}

function Resolve-C3QualifiedFirefoxBrowser([string]$CacheRoot, [string]$ExpectedInventorySha256) {
  if (-not [IO.Path]::IsPathFullyQualified($CacheRoot)) {
    throw 'The qualified Firefox cache root must be absolute.'
  }
  if ($ExpectedInventorySha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'The qualified Firefox inventory SHA-256 is invalid.'
  }
  $resolvedRoot = (Resolve-Path -LiteralPath $CacheRoot -ErrorAction Stop).Path
  $rootItem = Get-Item -LiteralPath $resolvedRoot -Force
  if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'The qualified Firefox cache root is not a plain directory.'
  }
  if (@(Get-ChildItem -LiteralPath $resolvedRoot -Recurse -Force | Where-Object {
        $_.Attributes -band [IO.FileAttributes]::ReparsePoint
      }).Count -ne 0) {
    throw 'The qualified Firefox cache must not contain reparse points.'
  }

  $playwrightCorePackage = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'node_modules/playwright-core/package.json') -Raw | ConvertFrom-Json
  $browserDescriptors = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'node_modules/playwright-core/browsers.json') -Raw | ConvertFrom-Json
  $firefoxDescriptors = @($browserDescriptors.browsers | Where-Object { $_.name -eq 'firefox' })
  if ($playwrightCorePackage.version -ne '1.64.1' -or $firefoxDescriptors.Count -ne 1) {
    throw 'The qualified Playwright Firefox descriptor is unavailable.'
  }
  $descriptor = $firefoxDescriptors[0]
  if ($descriptor.revision -ne '1555' -or $descriptor.browserVersion -ne '157.0') {
    throw 'The qualified Playwright Firefox revision or version diverged.'
  }

  $firefoxDirectory = [IO.Path]::GetFullPath(
    (Join-Path $resolvedRoot "firefox-$($descriptor.revision)/firefox")
  )
  $rootPrefix = $resolvedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $firefoxDirectory.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The qualified Firefox directory escapes its cache root.'
  }
  $executablePath = Join-Path $firefoxDirectory 'firefox.exe'
  $mozgluePath = Join-Path $firefoxDirectory 'mozglue.dll'
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf) -or -not (Test-Path -LiteralPath $mozgluePath -PathType Leaf)) {
    throw 'The qualified Firefox executable or mozglue dependency is unavailable.'
  }

  $executableSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $executablePath).Hash.ToLowerInvariant()
  $mozglueSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $mozgluePath).Hash.ToLowerInvariant()
  if ($executableSha256 -ne 'c949e57fba9a65ab6c434a76e32d2c72eb43f8b99a7c48ee7e927a4fad4b2a36') {
    throw 'The qualified Firefox executable identity diverged.'
  }
  if ($mozglueSha256 -ne '552ebda93b13633e3382382ffebf4d37adbc0138df94ee85ac1dd6240b4fb470') {
    throw 'The qualified Firefox mozglue identity diverged.'
  }

  $inventory = Get-C3FirefoxBrowserInventory $firefoxDirectory
  Assert-C3FirefoxBrowserInventory $inventory 61 $ExpectedInventorySha256
  return [pscustomobject]@{
    BrowserVersion = [string]$descriptor.browserVersion
    CacheRoot = $resolvedRoot
    ExecutablePath = $executablePath
    ExecutableSha256 = $executableSha256
    FirefoxDirectory = $firefoxDirectory
    InventoryCount = $inventory.Count
    InventorySha256 = $inventory.Sha256
    InventoryText = $inventory.Text
    MozgluePath = $mozgluePath
    MozglueSha256 = $mozglueSha256
    PlaywrightCoreVersion = [string]$playwrightCorePackage.version
    Revision = [string]$descriptor.revision
  }
}
# END C3 QUALIFIED FIREFOX CACHE FUNCTIONS

$BrowserTestArguments = Resolve-C3BrowserTestArguments $BrowserProjectSet
$RepositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$ComposeFile = Join-Path $RepositoryRoot 'infra/c3/compose.yaml'
$ProjectName = "kora-c3-$Instance"
$CampaignId = "c3-browser-$Instance"
$DatabaseName = ('kora_c3_' + $Instance.Replace('-', '_'))
$OwnerName = ('kora_c3_owner_' + ($Instance.Replace('-', '_')))
$OpenSsl = if ($IsWindows) {
  'C:\Program Files\Git\mingw64\bin\openssl.exe'
} else {
  (Get-Command openssl -CommandType Application -ErrorAction Stop).Source
}
$Docker = (Get-Command $(if ($IsWindows) { 'docker.exe' } else { 'docker' }) -CommandType Application -ErrorAction Stop).Source
$Npm = (Get-Command $(if ($IsWindows) { 'npm.cmd' } else { 'npm' }) -CommandType Application -ErrorAction Stop).Source
$PermissionTool = (Get-Command $(if ($IsWindows) { 'icacls.exe' } else { 'chmod' }) -CommandType Application -ErrorAction Stop).Source

$inheritedFirefoxExecutable = [Environment]::GetEnvironmentVariable('KORA_C3_FIREFOX_EXECUTABLE_PATH', 'Process')
if ($null -ne $inheritedFirefoxExecutable) {
  throw 'An inherited Firefox executable override is forbidden.'
}
$requiresQualifiedFirefox = $IsWindows -and $BrowserProjectSet -in @('Complete', 'Firefox')
if ($requiresQualifiedFirefox -and ($FirefoxBrowserCacheRoot.Length -eq 0 -or $FirefoxBrowserInventorySha256.Length -eq 0)) {
  throw 'Windows Firefox qualification requires an explicit qualified cache root and inventory SHA-256.'
}
if (-not $requiresQualifiedFirefox -and ($FirefoxBrowserCacheRoot.Length -ne 0 -or $FirefoxBrowserInventorySha256.Length -ne 0)) {
  throw 'A qualified Firefox cache is not applicable to this platform or browser project set.'
}
$QualifiedFirefoxBrowser = if ($requiresQualifiedFirefox) {
  Resolve-C3QualifiedFirefoxBrowser $FirefoxBrowserCacheRoot $FirefoxBrowserInventorySha256
} else {
  $null
}

if ($ProjectName -eq 'kora-plus-local' -or $ProjectName.Length -gt 72) {
  throw 'The C3 project identity is not isolated.'
}
if (Test-Path -LiteralPath $EvidenceDirectory) {
  throw 'The evidence directory already exists.'
}
if (-not (Test-Path -LiteralPath $OpenSsl -PathType Leaf)) {
  throw 'The qualified OpenSSL executable is unavailable.'
}

$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$CampaignRoot = Join-Path ([IO.Path]::GetTempPath()) ("kora-c3-$Instance-" + [Guid]::NewGuid().ToString('N'))
$SecretDirectory = Join-Path $CampaignRoot 'secrets'
$PrivateDirectory = Join-Path $CampaignRoot 'private'
$PublicCertificateDirectory = Join-Path $EvidenceDirectory 'certificates'
$PlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-output'
$RedactionProbePlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-redaction-probe-output'
$VisualPlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-visual-output'
$VisualOutputDirectory = Join-Path $EvidenceDirectory 'visual-fixtures'

function Write-NewText([string]$Path, [string]$Value) {
  if (Test-Path -LiteralPath $Path) { throw "Refusing to overwrite $Path" }
  [IO.File]::WriteAllText($Path, $Value, $Utf8)
}

function ConvertTo-CanonicalDockerInventory([string]$Label, [string]$JsonLines) {
  $rows = foreach ($line in ($JsonLines -split "`r?`n")) {
    if ($line.Length -eq 0) { continue }
    $record = $line | ConvertFrom-Json
    $canonical = [ordered]@{}
    foreach ($property in ($record.PSObject.Properties | Sort-Object Name)) {
      if (
        ($Label -eq 'containers' -and $property.Name -eq 'RunningFor') -or
        ($Label -eq 'images' -and $property.Name -eq 'CreatedSince')
      ) { continue }
      $value = $property.Value
      if ($Label -eq 'containers' -and $property.Name -eq 'Status') {
        if ($value -match '\((healthy|unhealthy|health: starting)\)') {
          $value = "$($record.State):$($Matches[1])"
        }
        elseif ($value -match '^Exited \((-?\d+)\)') {
          $value = "exited:$($Matches[1])"
        }
        else { $value = [string]$record.State }
      }
      elseif (($property.Name -eq 'Labels' -or $property.Name -eq 'Mounts') -and $value -is [string] -and $value.Length -gt 0) {
        $value = (($value -split ',') | Sort-Object -CaseSensitive) -join ','
      }
      elseif ($value -is [Management.Automation.PSCustomObject]) {
        $nested = [ordered]@{}
        foreach ($nestedProperty in ($value.PSObject.Properties | Sort-Object Name)) {
          $nested[$nestedProperty.Name] = $nestedProperty.Value
        }
        $value = $nested
      }
      $canonical[$property.Name] = $value
    }
    $canonical | ConvertTo-Json -Compress -Depth 8
  }
  return $Label + "`n" + (($rows | Sort-Object -CaseSensitive) -join "`n")
}

# BEGIN C3 INVENTORY COMPARISON FUNCTIONS
function Get-CanonicalDockerInventoryRows([string]$Label, [string]$CanonicalInventory) {
  $lines = @($CanonicalInventory -split "`r?`n")
  if ($lines.Count -eq 0 -or $lines[0] -cne $Label) {
    throw "Invalid canonical Docker inventory section: $Label"
  }
  return @($lines | Select-Object -Skip 1 | Where-Object { $_.Length -gt 0 })
}

function ConvertTo-DockerImageReferenceIdentity([string]$Repository, [string]$Tag, [string]$Digest) {
  return ([ordered]@{
    Digest = $Digest
    Repository = $Repository
    Tag = $Tag
  } | ConvertTo-Json -Compress)
}

function Compare-CanonicalDockerInventories(
  [Collections.IDictionary]$BeforeByLabel,
  [Collections.IDictionary]$AfterByLabel,
  [string[]]$QualifiedImageReferences
) {
  $changed = $false
  foreach ($label in @('containers', 'volumes', 'networks')) {
    if ($AfterByLabel[$label] -cne $BeforeByLabel[$label]) { $changed = $true }
  }
  $beforeImageRows = @(Get-CanonicalDockerInventoryRows 'images' $BeforeByLabel['images'])
  $afterImageRows = @(Get-CanonicalDockerInventoryRows 'images' $AfterByLabel['images'])
  $missingImageRows = @($beforeImageRows | Where-Object { $afterImageRows -cnotcontains $_ })
  $acquiredImageRows = @($afterImageRows | Where-Object { $beforeImageRows -cnotcontains $_ })
  $unqualifiedImageRows = @($acquiredImageRows | Where-Object {
    $record = $_ | ConvertFrom-Json
    $identity = ConvertTo-DockerImageReferenceIdentity ([string]$record.Repository) ([string]$record.Tag) ([string]$record.Digest)
    $QualifiedImageReferences -cnotcontains $identity
  })
  if ($missingImageRows.Count -gt 0 -or $unqualifiedImageRows.Count -gt 0) { $changed = $true }
  $status = if ($changed) {
    'SEMANTIC_DIFFERENT'
  } elseif ($acquiredImageRows.Count -gt 0) {
    'SEMANTIC_PRESERVED_WITH_QUALIFIED_CAMPAIGN_IMAGES'
  } else {
    'SEMANTIC_IDENTICAL'
  }
  return [ordered]@{
    AcquiredImageRows = $acquiredImageRows
    MissingImageRows = $missingImageRows
    Status = $status
    UnqualifiedImageRows = $unqualifiedImageRows
  }
}
# END C3 INVENTORY COMPARISON FUNCTIONS

function Get-QualifiedComposeImageReferences([string]$Path) {
  $references = foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*(?:x-node-image:\s*&node-image\s+|image:\s+)(?<Reference>[^\s#]+@sha256:[0-9a-f]{64})\s*$') {
      $reference = $Matches['Reference']
      $at = $reference.LastIndexOf('@')
      $nameAndTag = $reference.Substring(0, $at)
      $tagSeparator = $nameAndTag.LastIndexOf(':')
      if ($tagSeparator -le 0) { throw "Pinned Compose image has no explicit tag: $reference" }
      ConvertTo-DockerImageReferenceIdentity `
        $nameAndTag.Substring(0, $tagSeparator) `
        $nameAndTag.Substring($tagSeparator + 1) `
        $reference.Substring($at + 1)
    }
  }
  $qualified = @($references | Sort-Object -Unique)
  if ($qualified.Count -ne 4) { throw 'The four pinned Compose image references were not resolved exactly.' }
  return $qualified
}

function New-SecretValue() {
  $bytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $value = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  if ($value.Length -ne 43) { throw 'Generated secret length is invalid.' }
  return $value
}

function Write-Secret([string]$Name, [string]$Value = '') {
  if ($Value.Length -eq 0) { $Value = New-SecretValue }
  Write-NewText (Join-Path $SecretDirectory $Name) $Value
  return $Value
}

function Get-OrdinalOccurrenceCount([string]$Text, [string]$Value) {
  if ($Value.Length -eq 0) { throw 'Sensitive redaction value is empty.' }
  $count = 0
  $offset = 0
  while ($offset -lt $Text.Length) {
    $match = $Text.IndexOf($Value, $offset, [StringComparison]::Ordinal)
    if ($match -lt 0) { break }
    $count += 1
    $offset = $match + $Value.Length
  }
  return $count
}

function Get-DynamicSentinelValues([string]$Directory) {
  $values = [Collections.Generic.List[string]]::new()
  if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return @() }
  foreach ($file in Get-ChildItem -LiteralPath $Directory -File) {
    if ($file.Name -notmatch '^[0-9a-f-]{36}\.sentinel\.json$') {
      throw "Unexpected dynamic sentinel file: $($file.Name)"
    }
    $record = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
    if (
      @($record.PSObject.Properties.Name | Sort-Object) -join ',' -cne 'value,version' -or
      $record.version -ne 1 -or
      $record.value -isnot [string] -or
      $record.value.Length -lt 6 -or
      $Utf8.GetByteCount($record.value) -gt 4096
    ) { throw "Invalid dynamic sentinel file: $($file.Name)" }
    $values.Add($record.value)
  }
  return @($values)
}

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [hashtable]$Environment = @{},
    [string[]]$RemoveEnvironment = @(),
    [string]$DynamicSentinelDirectory = '',
    [string[]]$SensitiveRedactions = @(),
    [int[]]$AllowedExitCodes = @(0)
  )
  if ($Label -notmatch '^[a-z0-9][a-z0-9._-]+$') { throw 'Invalid evidence label.' }
  if (
    $SensitiveRedactions.Count -gt 512 -or
    @($SensitiveRedactions | Where-Object { $null -eq $_ -or $_.Length -lt 6 -or $Utf8.GetByteCount($_) -gt 4096 }).Count -ne 0
  ) { throw 'Invalid sensitive redaction set.' }
  if (
    $DynamicSentinelDirectory.Length -ne 0 -and
    -not (Test-Path -LiteralPath $DynamicSentinelDirectory -PathType Container)
  ) { throw 'Dynamic sentinel directory is unavailable.' }
  $stdoutPath = Join-Path $EvidenceDirectory "$Label.stdout.txt"
  $stderrPath = Join-Path $EvidenceDirectory "$Label.stderr.txt"
  $resultPath = Join-Path $EvidenceDirectory "$Label.result.json"
  foreach ($path in @($stdoutPath, $stderrPath, $resultPath)) {
    if (Test-Path -LiteralPath $path) { throw "Evidence already exists: $path" }
  }
  $start = [DateTimeOffset]::UtcNow
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $FilePath
  $info.WorkingDirectory = $RepositoryRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$info.ArgumentList.Add($argument) }
  foreach ($name in $RemoveEnvironment) { [void]$info.Environment.Remove($name) }
  foreach ($entry in $Environment.GetEnumerator()) { $info.Environment[$entry.Key] = [string]$entry.Value }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  $launchError = $null
  try {
    if (-not $process.Start()) { throw 'Process did not start.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
  }
  catch {
    $stdout = ''
    $stderr = ''
    $exitCode = $null
    $launchError = [ordered]@{ name = $_.Exception.GetType().Name; message = $_.Exception.Message }
  }
  finally {
    $process.Dispose()
  }
  $effectiveRedactions = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($sensitive in $SensitiveRedactions) { [void]$effectiveRedactions.Add($sensitive) }
  if ($DynamicSentinelDirectory.Length -ne 0) {
    foreach ($sensitive in @(Get-DynamicSentinelValues $DynamicSentinelDirectory)) {
      [void]$effectiveRedactions.Add($sensitive)
    }
  }
  if ($effectiveRedactions.Count -gt 4096) { throw 'Sensitive redaction set is oversized.' }
  $preWriteRedactionsApplied = 0
  foreach ($sensitive in @($effectiveRedactions | Sort-Object -Property Length -Descending)) {
    $stdoutOccurrences = Get-OrdinalOccurrenceCount $stdout $sensitive
    $stderrOccurrences = Get-OrdinalOccurrenceCount $stderr $sensitive
    $preWriteRedactionsApplied += $stdoutOccurrences + $stderrOccurrences
    if ($stdoutOccurrences -gt 0) {
      $stdout = $stdout.Replace($sensitive, '[REDACTED_C3_SENTINEL]', [StringComparison]::Ordinal)
    }
    if ($stderrOccurrences -gt 0) {
      $stderr = $stderr.Replace($sensitive, '[REDACTED_C3_SENTINEL]', [StringComparison]::Ordinal)
    }
  }
  Write-NewText $stdoutPath $stdout
  Write-NewText $stderrPath $stderr
  Write-NewText $resultPath (([ordered]@{
    arguments = $Arguments
    command = $FilePath
    endedAt = [DateTimeOffset]::UtcNow.ToString('O')
    exitCode = $exitCode
    label = $Label
    launchError = $launchError
    preWriteRedactionsApplied = $preWriteRedactionsApplied
    startedAt = $start.ToString('O')
  } | ConvertTo-Json -Depth 6) + "`n")
  if ($null -ne $launchError -or $AllowedExitCodes -notcontains $exitCode) {
    throw "Command failed: $Label"
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    PreWriteRedactionsApplied = $preWriteRedactionsApplied
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Invoke-EvidenceSecretScan([Collections.Generic.List[string]]$SensitiveValues) {
  $sentinelDirectory = Join-Path $PrivateDirectory 'sentinels'
  foreach ($sensitive in @(Get-DynamicSentinelValues $sentinelDirectory)) {
    $SensitiveValues.Add($sensitive)
  }

  $uniqueSensitiveValues = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($sensitive in $SensitiveValues) { [void]$uniqueSensitiveValues.Add($sensitive) }

  $violations = [Collections.Generic.List[string]]::new()
  $excludedVisuals = [Collections.Generic.List[string]]::new()
  $allowedTextExtensions = @('.txt', '.json', '.log', '.xml', '.html', '.pem', '.md', '.yaml', '.yml')
  $allowedVisualNames = @(
    '375-login.png',
    '768-recovery.png',
    '1440-invitation-invalid.png',
    '375-not-found.png',
    '768-session-expired.png',
    '1440-focus-visible.png',
    '375-reduced-motion.png',
    '375-loading-synthetic.png',
    '768-unavailable-synthetic.png'
  )
  foreach ($file in Get-ChildItem -LiteralPath $EvidenceDirectory -Recurse -File) {
    $extension = $file.Extension.ToLowerInvariant()
    if ($extension -eq '.png' -and $file.DirectoryName -ceq $VisualOutputDirectory -and $allowedVisualNames -ccontains $file.Name) {
      $excludedVisuals.Add($file.FullName)
      continue
    }
    if ($allowedTextExtensions -cnotcontains $extension) {
      $violations.Add("UNINSPECTABLE:$($file.FullName)")
      continue
    }
    $content = [IO.File]::ReadAllText($file.FullName)
    foreach ($sentinel in $uniqueSensitiveValues) {
      if ($sentinel.Length -gt 0 -and $content.Contains($sentinel, [StringComparison]::Ordinal)) {
        $violations.Add("LEAK:$($file.FullName)")
        break
      }
    }
  }
  Write-NewText (Join-Path $EvidenceDirectory 'secret-scan.result.json') (([ordered]@{
    excludedSyntheticVisuals = @($excludedVisuals)
    inspectedTextFiles = @(Get-ChildItem -LiteralPath $EvidenceDirectory -Recurse -File | Where-Object { $allowedTextExtensions -ccontains $_.Extension.ToLowerInvariant() }).Count
    registeredSentinels = $uniqueSensitiveValues.Count
    status = if ($violations.Count -eq 0) { 'PASS' } else { 'FAIL' }
    violations = @($violations)
  } | ConvertTo-Json -Depth 4) + "`n")
  if ($violations.Count -ne 0) { throw 'Secret evidence scan failed.' }
}

function Invoke-Docker([string]$Label, [string[]]$Arguments, [int[]]$AllowedExitCodes = @(0)) {
  return Invoke-Captured -Label $Label -FilePath $Docker -Arguments $Arguments -Environment $ComposeEnvironment -AllowedExitCodes $AllowedExitCodes
}

function Invoke-OpenSsl([string]$Label, [string[]]$Arguments) {
  [void](Invoke-Captured -Label $Label -FilePath $OpenSsl -Arguments $Arguments)
}

function New-Ca([string]$Name, [string]$CommonName) {
  Invoke-OpenSsl "certificate-$Name-ca" @(
    'req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '2',
    '-keyout', (Join-Path $SecretDirectory "$Name-key.pem"),
    '-out', (Join-Path $SecretDirectory "$Name.pem"),
    '-subj', "/CN=$CommonName",
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign'
  )
}

function New-Leaf(
  [string]$Name,
  [string]$CommonName,
  [string]$SubjectAlternativeName,
  [string]$ExtendedKeyUsage,
  [string]$CaName,
  [int]$Days = 2
) {
  Invoke-OpenSsl "certificate-$Name-request" @(
    'req', '-new', '-newkey', 'rsa:3072', '-nodes', '-sha256',
    '-keyout', (Join-Path $SecretDirectory "$Name-key.pem"),
    '-out', (Join-Path $SecretDirectory "$Name.csr"),
    '-subj', "/CN=$CommonName",
    '-addext', "subjectAltName=$SubjectAlternativeName",
    '-addext', "extendedKeyUsage=$ExtendedKeyUsage",
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment'
  )
  Invoke-OpenSsl "certificate-$Name-sign" @(
    'x509', '-req', '-sha256', '-days', "$Days", '-copy_extensions', 'copy',
    '-in', (Join-Path $SecretDirectory "$Name.csr"),
    '-CA', (Join-Path $SecretDirectory "$CaName.pem"),
    '-CAkey', (Join-Path $SecretDirectory "$CaName-key.pem"),
    '-CAcreateserial', '-out', (Join-Path $SecretDirectory "$Name.pem")
  )
}

function Get-CertificateMetadata([string]$Name) {
  $path = Join-Path $SecretDirectory "$Name.pem"
  $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem(
    [IO.File]::ReadAllText($path)
  )
  try {
    $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($certificate)
    try {
      $spki = [Convert]::ToBase64String([Security.Cryptography.SHA256]::HashData($rsa.ExportSubjectPublicKeyInfo()))
    }
    finally { $rsa.Dispose() }
    return [ordered]@{
      certificateSha256 = $certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()
      notAfter = $certificate.NotAfter.ToUniversalTime().ToString('O')
      notBefore = $certificate.NotBefore.ToUniversalTime().ToString('O')
      spkiSha256 = $spki
      subject = $certificate.Subject
    }
  }
  finally { $certificate.Dispose() }
}

$ComposeEnvironment = @{
  KORA_C3_API_CERT_SHA256 = ''
  KORA_C3_BFF_CERT_SHA256 = ''
  KORA_C3_CAMPAIGN_ID = $CampaignId
  KORA_C3_HTTPS_PORT = "$HttpsPort"
  KORA_C3_POSTGRES_DB = $DatabaseName
  KORA_C3_POSTGRES_OWNER = $OwnerName
  KORA_C3_PRIVATE_DIR = $PrivateDirectory
  KORA_C3_PROJECT_NAME = $ProjectName
  KORA_C3_SECRETS_DIR = $SecretDirectory
  KORA_C3_SOURCE_ROOT = $RepositoryRoot
}

$ForeignInventoryBefore = $null
$ForeignInventoryBeforeByLabel = @{}
$QualifiedCampaignImageReferences = @(Get-QualifiedComposeImageReferences $ComposeFile)
$PrimaryFailure = $null
$CleanupFailure = $null
$BrowserFailures = [Collections.Generic.List[Exception]]::new()
$SensitiveValues = [Collections.Generic.List[string]]::new()
try {
  if ($null -ne $QualifiedFirefoxBrowser) {
    Write-NewText (Join-Path $EvidenceDirectory 'firefox-browser-inventory.manifest.txt') $QualifiedFirefoxBrowser.InventoryText
    Write-NewText (Join-Path $EvidenceDirectory 'firefox-browser-identity.json') (([ordered]@{
      browserVersion = $QualifiedFirefoxBrowser.BrowserVersion
      cacheRoot = $QualifiedFirefoxBrowser.CacheRoot
      executablePath = $QualifiedFirefoxBrowser.ExecutablePath
      executableSha256 = $QualifiedFirefoxBrowser.ExecutableSha256
      firefoxDirectory = $QualifiedFirefoxBrowser.FirefoxDirectory
      inventoryCount = $QualifiedFirefoxBrowser.InventoryCount
      inventorySha256 = $QualifiedFirefoxBrowser.InventorySha256
      mozgluePath = $QualifiedFirefoxBrowser.MozgluePath
      mozglueSha256 = $QualifiedFirefoxBrowser.MozglueSha256
      playwrightCoreVersion = $QualifiedFirefoxBrowser.PlaywrightCoreVersion
      revision = $QualifiedFirefoxBrowser.Revision
    } | ConvertTo-Json -Depth 4) + "`n")
  }
  New-Item -ItemType Directory -Path $CampaignRoot | Out-Null
  if ($IsWindows) {
    [void](Invoke-Captured -Label 'restrict-campaign-root-permissions' -FilePath $PermissionTool -Arguments @(
      $CampaignRoot,
      '/inheritance:r',
      '/grant:r',
      "$($env:USERNAME):(OI)(CI)F"
    ))
  } else {
    [void](Invoke-Captured -Label 'restrict-campaign-root-permissions' -FilePath $PermissionTool -Arguments @(
      '700',
      $CampaignRoot
    ))
  }
  foreach ($path in @($SecretDirectory, $PrivateDirectory)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
  foreach ($path in @('commands', 'deliveries', 'processing', 'responses', 'sentinels')) {
    New-Item -ItemType Directory -Path (Join-Path $PrivateDirectory $path) | Out-Null
  }
  foreach ($path in @($PublicCertificateDirectory, $PlaywrightOutputDirectory, $VisualPlaywrightOutputDirectory, $VisualOutputDirectory)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
  if ($IsWindows) {
    [void](Invoke-Captured -Label 'verify-campaign-permissions' -FilePath $PermissionTool -Arguments @(
      $CampaignRoot,
      '/T',
      '/C'
    ))
  } else {
    [void](Invoke-Captured -Label 'restrict-campaign-tree-permissions' -FilePath $PermissionTool -Arguments @(
      '-R',
      'u=rwX,go=',
      $CampaignRoot
    ))
    $unixMode = [IO.File]::GetUnixFileMode($CampaignRoot)
    if (($unixMode -band [IO.UnixFileMode]::GroupRead) -ne 0 -or
      ($unixMode -band [IO.UnixFileMode]::GroupWrite) -ne 0 -or
      ($unixMode -band [IO.UnixFileMode]::GroupExecute) -ne 0 -or
      ($unixMode -band [IO.UnixFileMode]::OtherRead) -ne 0 -or
      ($unixMode -band [IO.UnixFileMode]::OtherWrite) -ne 0 -or
      ($unixMode -band [IO.UnixFileMode]::OtherExecute) -ne 0) {
      throw 'Campaign directory permissions are not private.'
    }
  }

  $collectorSelfTestKnownSentinel = New-SecretValue
  $collectorSelfTestDynamicSentinel = New-SecretValue
  $SensitiveValues.Add($collectorSelfTestKnownSentinel)
  $SensitiveValues.Add($collectorSelfTestDynamicSentinel)
  $collectorSelfTest = Invoke-Captured `
    -Label 'collector-prewrite-redaction-self-test' `
    -FilePath ([Environment]::ProcessPath) `
    -Arguments @(
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '$record = @{ value = $env:KORA_C3_CAPTURE_SELF_TEST_DYNAMIC; version = 1 } | ConvertTo-Json -Compress; $target = Join-Path $env:KORA_C3_CAPTURE_SELF_TEST_DIRECTORY (([guid]::NewGuid().ToString()) + ''.sentinel.json''); [IO.File]::WriteAllText($target, $record + [Environment]::NewLine, [Text.UTF8Encoding]::new($false)); [Console]::Out.WriteLine($env:KORA_C3_CAPTURE_SELF_TEST_KNOWN); [Console]::Out.WriteLine($env:KORA_C3_CAPTURE_SELF_TEST_DYNAMIC); [Console]::Error.WriteLine($env:KORA_C3_CAPTURE_SELF_TEST_KNOWN); [Console]::Error.WriteLine($env:KORA_C3_CAPTURE_SELF_TEST_DYNAMIC); exit 7'
    ) `
    -Environment @{
      KORA_C3_CAPTURE_SELF_TEST_DIRECTORY = (Join-Path $PrivateDirectory 'sentinels')
      KORA_C3_CAPTURE_SELF_TEST_DYNAMIC = $collectorSelfTestDynamicSentinel
      KORA_C3_CAPTURE_SELF_TEST_KNOWN = $collectorSelfTestKnownSentinel
    } `
    -DynamicSentinelDirectory (Join-Path $PrivateDirectory 'sentinels') `
    -SensitiveRedactions @($collectorSelfTestKnownSentinel) `
    -AllowedExitCodes @(7)
  $collectorSelfTestExpectedStream = @(
    '[REDACTED_C3_SENTINEL]',
    '[REDACTED_C3_SENTINEL]'
  ) -join [Environment]::NewLine
  if (
    $collectorSelfTest.PreWriteRedactionsApplied -ne 4 -or
    $collectorSelfTest.Stdout.Trim() -cne $collectorSelfTestExpectedStream -or
    $collectorSelfTest.Stderr.Trim() -cne $collectorSelfTestExpectedStream
  ) { throw 'Pre-write evidence redaction self-test failed.' }

  [void](Invoke-Docker 'docker-version' @('version'))
  $dockerInfo = Invoke-Docker 'docker-info' @('info', '--format', '{{json .}}')
  $info = $dockerInfo.Stdout | ConvertFrom-Json
  if ($info.OSType -ne 'linux') { throw 'The Docker engine is not Linux.' }

  $portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $HttpsPort)
  try { $portProbe.Start() }
  catch { throw "The isolated HTTPS port is unavailable: $HttpsPort" }
  finally { $portProbe.Stop() }
  Write-NewText (Join-Path $EvidenceDirectory 'https-port-preflight.json') (([ordered]@{
    address = '127.0.0.1'
    checkedAt = [DateTimeOffset]::UtcNow.ToString('O')
    port = $HttpsPort
    status = 'AVAILABLE'
  } | ConvertTo-Json) + "`n")
  Write-NewText (Join-Path $EvidenceDirectory 'qualified-campaign-image-references.txt') (($QualifiedCampaignImageReferences -join "`n") + "`n")

  $inventoryParts = @()
  foreach ($entry in @(
    @{ Label = 'containers'; Arguments = @('ps', '-a', '--no-trunc', '--format', '{{json .}}') },
    @{ Label = 'volumes'; Arguments = @('volume', 'ls', '--format', '{{json .}}') },
    @{ Label = 'networks'; Arguments = @('network', 'ls', '--no-trunc', '--format', '{{json .}}') },
    @{ Label = 'images'; Arguments = @('image', 'ls', '--no-trunc', '--digests', '--format', '{{json .}}') }
  )) {
    $result = Invoke-Docker ("inventory-before-" + $entry.Label) $entry.Arguments
    $canonical = ConvertTo-CanonicalDockerInventory $entry.Label $result.Stdout
    $ForeignInventoryBeforeByLabel[$entry.Label] = $canonical
    $inventoryParts += $canonical
  }
  $ForeignInventoryBefore = ($inventoryParts -join "`n")
  Write-NewText (Join-Path $EvidenceDirectory 'foreign-inventory-before.canonical.txt') ($ForeignInventoryBefore + "`n")

  foreach ($kind in @('ps', 'volume', 'network')) {
    $arguments = if ($kind -eq 'ps') {
      @('ps', '-aq', '--filter', "label=com.kora-plus.project=$ProjectName")
    } else {
      @($kind, 'ls', '-q', '--filter', "label=com.kora-plus.project=$ProjectName")
    }
    if ((Invoke-Docker "absence-$kind" $arguments).Stdout.Trim().Length -ne 0) {
      throw 'A target campaign resource already exists.'
    }
  }

  Invoke-OpenSsl 'certificate-openssl-version' @('version', '-a')
  New-Ca 'entry-ca' 'KORA C3 entry campaign CA'
  New-Ca 'api-ca' 'KORA C3 API campaign CA'
  New-Ca 'client-ca' 'KORA C3 client campaign CA'
  New-Ca 'foreign-client-ca' 'KORA C3 foreign client campaign CA'
  New-Leaf 'entry-cert' 'admin.c3.invalid' 'DNS:admin.c3.invalid' 'serverAuth' 'entry-ca'
  New-Leaf 'api-cert' 'api.c3.internal' 'DNS:api.c3.internal' 'serverAuth' 'api-ca'
  New-Leaf 'api-other' 'other.c3.internal' 'DNS:other.c3.internal' 'serverAuth' 'api-ca'
  New-Leaf 'api-wildcard' 'wildcard.c3.internal' 'DNS:*.c3.internal' 'serverAuth' 'api-ca'
  New-Leaf 'bff-cert' 'KORA C3 admin BFF' 'URI:spiffe://kora.local/c3/admin-bff' 'clientAuth' 'client-ca'
  New-Leaf 'bff-other' 'KORA C3 other workload' 'URI:spiffe://kora.local/c3/other' 'clientAuth' 'client-ca'
  New-Leaf 'bff-expired' 'KORA C3 expired BFF' 'URI:spiffe://kora.local/c3/admin-bff' 'clientAuth' 'client-ca' 0
  New-Leaf 'bff-foreign' 'KORA C3 foreign BFF' 'URI:spiffe://kora.local/c3/admin-bff' 'clientAuth' 'foreign-client-ca'

  $publicNames = @('entry-ca', 'entry-cert', 'api-ca', 'api-cert', 'api-other', 'api-wildcard', 'client-ca', 'bff-cert', 'bff-other', 'bff-expired', 'foreign-client-ca', 'bff-foreign')
  $certificateMetadata = [ordered]@{}
  foreach ($name in $publicNames) {
    Copy-Item -LiteralPath (Join-Path $SecretDirectory "$name.pem") -Destination $PublicCertificateDirectory
    $certificateMetadata[$name] = Get-CertificateMetadata $name
  }
  Write-NewText (Join-Path $PublicCertificateDirectory 'metadata.json') (($certificateMetadata | ConvertTo-Json -Depth 6) + "`n")
  $ComposeEnvironment.KORA_C3_API_CERT_SHA256 = $certificateMetadata['api-cert'].certificateSha256
  $ComposeEnvironment.KORA_C3_BFF_CERT_SHA256 = $certificateMetadata['bff-cert'].certificateSha256

  foreach ($name in @(
    'postgres_password',
    'postgres_runtime_password',
    'postgres_admin_writer_password',
    'postgres_admin_c2a_bootstrap_password',
    'postgres_admin_c2a_expiration_worker_password',
    'postgres_admin_c2a_notification_worker_password',
    'postgres_admin_c2a_writer_password',
    'redis_password',
    'c3_harness_capability'
  )) { $SensitiveValues.Add((Write-Secret $name)) }
  $BootstrapEmail = "c3-$Instance@example.test"
  $BootstrapPassword = New-SecretValue
  $SensitiveValues.Add($BootstrapEmail)
  $SensitiveValues.Add($BootstrapPassword)
  Write-NewText (Join-Path $SecretDirectory 'c3_bootstrap_input.json') (([ordered]@{ email = $BootstrapEmail; password = $BootstrapPassword } | ConvertTo-Json -Compress) + "`n")
  Write-NewText (Join-Path $PrivateDirectory 'campaign.json') (([ordered]@{ version = 1; campaignId = $CampaignId; projectName = $ProjectName } | ConvertTo-Json -Compress) + "`n")
  $config = Invoke-Docker 'compose-config' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'build', '--profile', 'migrate', '--profile', 'fixtures', '--profile', 'runtime', 'config')
  if ($config.Stdout -notmatch [regex]::Escape("name: $ProjectName") -or $config.Stdout -match 'kora-plus-local') {
    throw 'Resolved Compose configuration is not isolated.'
  }
  [void](Invoke-Docker 'compose-build-workspace' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'build', 'run', '--rm', 'build'))
  [void](Invoke-Docker 'compose-data-up' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, 'up', '-d', 'postgres', 'redis'))
  [void](Invoke-Docker 'compose-migrate' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'migrate', 'run', '--rm', 'migrate'))
  [void](Invoke-Docker 'compose-provision' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, 'exec', '-T', 'postgres', 'sh', '/usr/local/bin/kora-provision-postgresql-runtime.sh'))
  $bootstrapContainerName = "$ProjectName-bootstrap-once"
  $bootstrap = Invoke-Docker 'compose-bootstrap' @(
    'compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'fixtures',
    'run', '--no-TTY', '--name', $bootstrapContainerName, 'bootstrap'
  ) (0..255)
  [void](Invoke-Docker 'compose-bootstrap-inspect' @(
    'container', 'inspect', '--format', '{{json .State}}', $bootstrapContainerName
  ) @(0, 1))
  [void](Invoke-Docker 'compose-bootstrap-logs' @('container', 'logs', $bootstrapContainerName) @(0, 1))
  [void](Invoke-Docker 'compose-bootstrap-remove' @('container', 'rm', $bootstrapContainerName))
  if ($bootstrap.ExitCode -ne 0) {
    throw "Bootstrap failed with exit code $($bootstrap.ExitCode)."
  }
  [void](Invoke-Docker 'compose-runtime-up' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'runtime', 'up', '-d', 'api', 'notification', 'admin', 'nginx'))

  $ready = $false
  $readyDeadline = [DateTimeOffset]::UtcNow.AddSeconds(90)
  while ([DateTimeOffset]::UtcNow -lt $readyDeadline) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
      $connect = $client.ConnectAsync('127.0.0.1', $HttpsPort)
      if ($connect.Wait(1000) -and $client.Connected) { $ready = $true; break }
    }
    catch { }
    finally { $client.Dispose() }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    [void](Invoke-Docker 'compose-runtime-timeout-ps' @(
      'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
      '--profile', 'runtime', 'ps', '--all', '--format', 'json'
    ) @(0, 1))
    foreach ($service in @('api', 'notification', 'admin', 'nginx')) {
      [void](Invoke-Docker "compose-runtime-timeout-$service-logs" @(
        'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
        '--profile', 'runtime', 'logs', '--no-color', '--tail', '200', $service
      ) @(0, 1))
    }
    throw 'The isolated HTTPS entry did not become reachable.'
  }

  $BrowserEnvironment = $ComposeEnvironment.Clone()
  $BrowserEnvironment['KORA_C3_BASE_URL'] = "https://admin.c3.invalid:$HttpsPort"
  $BrowserEnvironment['KORA_C3_BOOTSTRAP_EMAIL'] = $BootstrapEmail
  $BrowserEnvironment['KORA_C3_BOOTSTRAP_PASSWORD'] = $BootstrapPassword
  $BrowserEnvironment['KORA_C3_CAPABILITY_PATH'] = Join-Path $SecretDirectory 'c3_harness_capability'
  $BrowserEnvironment['KORA_C3_ENTRY_SPKI_SHA256'] = $certificateMetadata['entry-cert'].spkiSha256
  $BrowserEnvironment['KORA_C3_PLAYWRIGHT_OUTPUT_DIR'] = $PlaywrightOutputDirectory
  if ($null -ne $QualifiedFirefoxBrowser) {
    $BrowserEnvironment['KORA_C3_FIREFOX_EXECUTABLE_PATH'] = $QualifiedFirefoxBrowser.ExecutablePath
  }
  $browser = Invoke-Captured -Label 'playwright-c3-secret' -FilePath $Npm -Arguments $BrowserTestArguments -Environment $BrowserEnvironment -RemoveEnvironment @(
    'KORA_C3_ARTIFACT_REDACTION_PROBE',
    'KORA_C3_ARTIFACT_REDACTION_PROBE_SENTINEL',
    'KORA_C3_VISUAL_FIXTURE_MODE',
    'KORA_C3_VISUAL_OUTPUT_DIR'
  ) -DynamicSentinelDirectory (Join-Path $PrivateDirectory 'sentinels') -SensitiveRedactions @($SensitiveValues) -AllowedExitCodes (0..255)
  if ($browser.PreWriteRedactionsApplied -ne 0) {
    $BrowserFailures.Add([Exception]::new('Secret-bearing browser transcript required defensive pre-write redaction.'))
  }
  if ($browser.ExitCode -ne 0) {
    [void](Invoke-Docker 'compose-browser-failure-ps' @(
      'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
      '--profile', 'runtime', 'ps', '--all', '--format', 'json'
    ) @(0, 1))
    foreach ($service in @('api', 'notification', 'admin', 'nginx')) {
      [void](Invoke-Docker "compose-browser-failure-$service-logs" @(
        'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
        '--profile', 'runtime', 'logs', '--no-color', '--tail', '200', $service
      ) @(0, 1))
    }
    $BrowserFailures.Add([Exception]::new("Secret-bearing browser qualification failed with exit code $($browser.ExitCode)."))
  }

  $ArtifactRedactionProbeSentinel = New-SecretValue
  $SensitiveValues.Add($ArtifactRedactionProbeSentinel)
  $RedactionProbeEnvironment = $BrowserEnvironment.Clone()
  [void]$RedactionProbeEnvironment.Remove('KORA_C3_FIREFOX_EXECUTABLE_PATH')
  $RedactionProbeEnvironment['KORA_C3_ARTIFACT_REDACTION_PROBE'] = '1'
  $RedactionProbeEnvironment['KORA_C3_ARTIFACT_REDACTION_PROBE_SENTINEL'] = $ArtifactRedactionProbeSentinel
  $RedactionProbeEnvironment['KORA_C3_PLAYWRIGHT_OUTPUT_DIR'] = $RedactionProbePlaywrightOutputDirectory
  $redactionProbe = Invoke-Captured -Label 'playwright-c3-artifact-redaction-probe' -FilePath $Npm -Arguments @('run', 'test:e2e', '--workspace', '@kora-plus/admin') -Environment $RedactionProbeEnvironment -RemoveEnvironment @(
    'KORA_C3_VISUAL_FIXTURE_MODE',
    'KORA_C3_VISUAL_OUTPUT_DIR'
  ) -DynamicSentinelDirectory (Join-Path $PrivateDirectory 'sentinels') -SensitiveRedactions @($SensitiveValues) -AllowedExitCodes (0..255)
  try {
    $probeTranscript = $redactionProbe.Stdout + "`n" + $redactionProbe.Stderr
    if (
      $redactionProbe.ExitCode -ne 1 -or
      $probeTranscript -notmatch '@artifact-redaction-probe sanitizes the final Playwright error artifact' -or
      $probeTranscript -notmatch 'EXPECTED_REDACTED_PROBE_VALUE'
    ) { throw 'Artifact redaction probe did not produce its single expected assertion failure.' }
    if ($redactionProbe.PreWriteRedactionsApplied -ne 0) {
      throw 'Artifact redaction probe required defensive pre-write redaction.'
    }
    $probeErrorContexts = @(Get-ChildItem -LiteralPath $RedactionProbePlaywrightOutputDirectory -Recurse -File -Filter 'error-context.md')
    if ($probeErrorContexts.Count -ne 1) { throw 'Artifact redaction probe did not produce exactly one error context.' }
    $probeErrorContext = [IO.File]::ReadAllText($probeErrorContexts[0].FullName)
    if (
      -not $probeErrorContext.Contains('[C3_ERROR_CONTEXT_REDACTED]', [StringComparison]::Ordinal) -or
      $probeErrorContext.Contains('# Page snapshot', [StringComparison]::Ordinal)
    ) { throw 'Artifact redaction probe error context is not safely neutralized.' }
  }
  catch { $BrowserFailures.Add($_.Exception) }

  $VisualEnvironment = @{
    KORA_C3_BASE_URL = "https://admin.c3.invalid:$HttpsPort"
    KORA_C3_ENTRY_SPKI_SHA256 = $certificateMetadata['entry-cert'].spkiSha256
    KORA_C3_PLAYWRIGHT_OUTPUT_DIR = $VisualPlaywrightOutputDirectory
    KORA_C3_VISUAL_FIXTURE_MODE = '1'
    KORA_C3_VISUAL_OUTPUT_DIR = $VisualOutputDirectory
  }
  $visual = Invoke-Captured -Label 'playwright-c3-visual' -FilePath $Npm -Arguments @('run', 'test:e2e', '--workspace', '@kora-plus/admin') -Environment $VisualEnvironment -RemoveEnvironment @(
    'KORA_C3_BOOTSTRAP_EMAIL',
    'KORA_C3_BOOTSTRAP_PASSWORD',
    'KORA_C3_ARTIFACT_REDACTION_PROBE',
    'KORA_C3_ARTIFACT_REDACTION_PROBE_SENTINEL',
    'KORA_C3_CAMPAIGN_ID',
    'KORA_C3_CAPABILITY_PATH',
    'KORA_C3_PRIVATE_DIR',
    'KORA_C3_PROJECT_NAME',
    'KORA_C3_SECRETS_DIR'
  ) -AllowedExitCodes (0..255)
  if ($visual.ExitCode -ne 0) {
    $BrowserFailures.Add([Exception]::new("Synthetic visual browser qualification failed with exit code $($visual.ExitCode)."))
  }
  if ($BrowserFailures.Count -eq 1) { throw $BrowserFailures[0] }
  if ($BrowserFailures.Count -gt 1) {
    throw [AggregateException]::new(
      'One or more C3 browser qualifications failed.',
      [Exception[]]$BrowserFailures
    )
  }
}
catch {
  $PrimaryFailure = $_
}
finally {
  try {
    [void](Invoke-Docker 'compose-cleanup' @('compose', '-f', $ComposeFile, '--project-name', $ProjectName, '--profile', 'build', '--profile', 'migrate', '--profile', 'fixtures', '--profile', 'runtime', 'down', '--volumes', '--timeout', '20'))
  }
  catch { $CleanupFailure = $_ }

  try {
    $inventoryParts = @()
    $foreignInventoryAfterByLabel = @{}
    foreach ($entry in @(
      @{ Label = 'containers'; Arguments = @('ps', '-a', '--no-trunc', '--format', '{{json .}}') },
      @{ Label = 'volumes'; Arguments = @('volume', 'ls', '--format', '{{json .}}') },
      @{ Label = 'networks'; Arguments = @('network', 'ls', '--no-trunc', '--format', '{{json .}}') },
      @{ Label = 'images'; Arguments = @('image', 'ls', '--no-trunc', '--digests', '--format', '{{json .}}') }
    )) {
      $result = Invoke-Docker ("inventory-after-" + $entry.Label) $entry.Arguments
      $canonical = ConvertTo-CanonicalDockerInventory $entry.Label $result.Stdout
      $foreignInventoryAfterByLabel[$entry.Label] = $canonical
      $inventoryParts += $canonical
    }
    $after = ($inventoryParts -join "`n")
    Write-NewText (Join-Path $EvidenceDirectory 'foreign-inventory-after.canonical.txt') ($after + "`n")
    $comparison = Compare-CanonicalDockerInventories `
      $ForeignInventoryBeforeByLabel `
      $foreignInventoryAfterByLabel `
      $QualifiedCampaignImageReferences
    Write-NewText (Join-Path $EvidenceDirectory 'campaign-acquired-images.canonical.txt') (($comparison.AcquiredImageRows -join "`n") + "`n")
    if ($null -ne $ForeignInventoryBefore -and $comparison.Status -ceq 'SEMANTIC_DIFFERENT') {
      Write-NewText (Join-Path $EvidenceDirectory 'foreign-inventory-comparison.txt') ($comparison.Status + "`n")
      if ($null -eq $PrimaryFailure) { $PrimaryFailure = [Exception]::new('Foreign Docker inventory changed during the campaign.') }
    }
    else { Write-NewText (Join-Path $EvidenceDirectory 'foreign-inventory-comparison.txt') ($comparison.Status + "`n") }
  }
  catch {
    if ($null -eq $PrimaryFailure) { $PrimaryFailure = $_ }
  }

  try { Invoke-EvidenceSecretScan $SensitiveValues }
  catch {
    if ($null -eq $PrimaryFailure) { $PrimaryFailure = $_ }
    else {
      $existingException = if ($PrimaryFailure -is [Management.Automation.ErrorRecord]) {
        $PrimaryFailure.Exception
      } elseif ($PrimaryFailure -is [Exception]) {
        $PrimaryFailure
      } else {
        [Exception]::new([string]$PrimaryFailure)
      }
      $PrimaryFailure = [AggregateException]::new(
        'The C3 campaign failed and its evidence scan also failed.',
        [Exception[]]@($existingException, $_.Exception)
      )
    }
  }

  if (Test-Path -LiteralPath $CampaignRoot) {
    $resolvedCampaignRoot = (Resolve-Path -LiteralPath $CampaignRoot).Path
    $resolvedTempRoot = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path
    if (-not $resolvedCampaignRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase) -or $resolvedCampaignRoot -notmatch 'kora-c3-') {
      if ($null -eq $PrimaryFailure) { $PrimaryFailure = [Exception]::new('Refusing unsafe campaign-directory cleanup.') }
    }
    else { Remove-Item -LiteralPath $resolvedCampaignRoot -Recurse -Force }
  }
}

if ($null -ne $CleanupFailure -and $null -eq $PrimaryFailure) { $PrimaryFailure = $CleanupFailure }
if ($null -ne $PrimaryFailure) { throw $PrimaryFailure }
Write-Output 'C3 browser runtime validation PASS.'
