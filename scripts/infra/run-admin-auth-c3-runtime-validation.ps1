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

# BEGIN C3 APPLICATION RESOLUTION FUNCTIONS
function Select-C3Application([string]$Name, [object[]]$Commands) {
  $commands = @($Commands)
  if ($commands.Count -eq 0) {
    throw "The required application is unavailable: $Name"
  }

  $selected = $commands[0]
  if ($selected -isnot [Management.Automation.ApplicationInfo]) {
    throw "The resolved application has an invalid type: $Name"
  }
  $selectedPath = [string]$selected.Path
  if (
    [string]::IsNullOrWhiteSpace($selectedPath) -or
    -not [IO.Path]::IsPathFullyQualified($selectedPath) -or
    -not (Test-Path -LiteralPath $selectedPath -PathType Leaf)
  ) {
    throw "The resolved application path is invalid: $Name"
  }

  return [pscustomobject]@{
    CandidateCount = $commands.Count
    Candidates = @($commands | ForEach-Object {
        [pscustomobject]@{
          CommandType = [string]$_.CommandType
          Path = [string]$_.Path
          Source = [string]$_.Source
        }
      })
    Name = $Name
    SelectedPath = $selectedPath
  }
}

function Resolve-C3Application([string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Name)) {
    throw 'The application name is empty.'
  }
  try {
    $commands = @(
      Microsoft.PowerShell.Core\Get-Command `
        -Name $Name `
        -CommandType Application `
        -All `
        -ErrorAction Stop
    )
  }
  catch {
    throw [InvalidOperationException]::new("The required application is unavailable: $Name", $_.Exception)
  }
  return Select-C3Application $Name $commands
}

function Resolve-C3ApplicationSet(
  [bool]$WindowsPlatform,
  [string]$WindowsOpenSslPath = 'C:\Program Files\Git\mingw64\bin\openssl.exe',
  [string]$OpenSslName = 'openssl',
  [string]$DockerName = 'docker',
  [string]$NpmName = 'npm',
  [string]$WindowsPermissionName = 'icacls.exe',
  [string]$PosixPermissionName = 'chmod'
) {
  $openSsl = Resolve-C3Application $(if ($WindowsPlatform) { $WindowsOpenSslPath } else { $OpenSslName })
  $docker = Resolve-C3Application $(if ($WindowsPlatform -and $DockerName -eq 'docker') { 'docker.exe' } else { $DockerName })
  $npm = Resolve-C3Application $(if ($WindowsPlatform -and $NpmName -eq 'npm') { 'npm.cmd' } else { $NpmName })
  $permission = Resolve-C3Application $(if ($WindowsPlatform) { $WindowsPermissionName } else { $PosixPermissionName })
  return [pscustomobject]@{
    Docker = $docker
    Npm = $npm
    OpenSsl = $openSsl
    Permission = $permission
  }
}
# END C3 APPLICATION RESOLUTION FUNCTIONS

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

# BEGIN C3 SAFE BROWSER SUMMARY FUNCTIONS
function New-C3SafeBrowserCounts() {
  return [ordered]@{
    began = 0
    discovered = 0
    failed = 0
    interrupted = 0
    notRun = 0
    passed = 0
    skipped = 0
    timedOut = 0
  }
}

function New-C3SafeBrowserGenericSummary([string]$Phase, [string]$Status) {
  return [ordered]@{
    counts = New-C3SafeBrowserCounts
    diagnostic = [ordered]@{
      cleanup = 'NOT_APPLICABLE'
      delivery = 'NOT_APPLICABLE'
      firstFailedInvariant = 'NONE'
      lastConfirmedMilestone = 'NONE'
      mismatchFields = @()
      origin = 'UNKNOWN'
    }
    engine = 'NONE'
    phase = $Phase
    scenario = 'NONE'
    status = $Status
    version = 3
  }
}

function Test-C3ExactPropertySet([object]$Value, [string[]]$Expected) {
  if ($null -eq $Value) { return $false }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object -CaseSensitive)
  $expectedNames = @($Expected | Sort-Object -CaseSensitive)
  return ($actual -join "`n") -ceq ($expectedNames -join "`n")
}

function Test-C3SafeBrowserCounter([object]$Value) {
  return (
    ($Value -is [int] -or $Value -is [long]) -and
    [long]$Value -ge 0 -and
    [long]$Value -le 24
  )
}

function Test-C3SafeBrowserIdentity([string]$Engine, [string]$Scenario) {
  $allowedByEngine = @{
    NONE = @('NONE')
    CHROMIUM = @(
      'CHROMIUM_RETRY_AFTER_BOUNDARIES',
      'CHROMIUM_FIRST_LOGIN_TOTP_RECOVERY',
      'CHROMIUM_ENROLLMENT_SESSION_LOGOUT',
      'CHROMIUM_RESET_UNICODE_PASSWORD',
      'CHROMIUM_RESET_HIBP_FAIL_CLOSED',
      'CHROMIUM_LOGIN_INVITATION_POST_COMMIT',
      'CHROMIUM_RECOVERY_FRESH_ENROLLMENT',
      'CHROMIUM_RECOVERY_ROTATION_LOGOUT',
      'CHROMIUM_REFRESH_EXPIRY',
      'CHROMIUM_MULTITAB_REFRESH',
      'CHROMIUM_REFRESH_429_RECOVERY',
      'CHROMIUM_CROSS_TAB_CANCEL',
      'CHROMIUM_REFRESH_429_COOKIES',
      'CHROMIUM_UNCERTAIN_LOGOUT',
      'CHROMIUM_EXPIRED_PREAUTH',
      'CHROMIUM_LOGIN_RATE_LIMIT',
      'CHROMIUM_CROSS_SITE_LOGIN',
      'CHROMIUM_PUBLIC_AXE'
    )
    FIREFOX = @(
      'FIREFOX_PUBLIC_SHELL',
      'FIREFOX_MOBILE_BOUNDS',
      'FIREFOX_WEB_LOCKS_FAIL_CLOSED'
    )
    WEBKIT = @(
      'WEBKIT_PUBLIC_SHELL',
      'WEBKIT_MOBILE_BOUNDS',
      'WEBKIT_WEB_LOCKS_FAIL_CLOSED'
    )
  }
  return $allowedByEngine.ContainsKey($Engine) -and $allowedByEngine[$Engine] -ccontains $Scenario
}

function Initialize-C3SafeBrowserSummary([string]$Path) {
  if (Test-Path -LiteralPath $Path) { throw 'C3 safe browser summary already exists.' }
  $initial = New-C3SafeBrowserGenericSummary 'NO_EVENT_OBSERVED' 'NO_EVENT_OBSERVED'
  [IO.File]::WriteAllText(
    $Path,
    ($initial | ConvertTo-Json -Compress -Depth 4) + "`n",
    [Text.UTF8Encoding]::new($false)
  )
}

function Get-C3SafeBrowserPublicSummary(
  [string]$Path,
  [Nullable[int]]$ProcessExitCode = $null,
  [bool]$LaunchFailed = $false
) {
  $invalid = [pscustomobject]@{
    Public = New-C3SafeBrowserGenericSummary 'INVALID' 'INVALID'
    Valid = $false
  }
  try {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $invalid }
    $file = Get-Item -LiteralPath $Path
    if ($file.Length -le 0 -or $file.Length -gt 4096) { return $invalid }
    $record = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if (-not (Test-C3ExactPropertySet $record @('counts', 'diagnostic', 'engine', 'phase', 'scenario', 'status', 'version'))) {
      return $invalid
    }
    if (-not (Test-C3ExactPropertySet $record.counts @('began', 'discovered', 'failed', 'interrupted', 'notRun', 'passed', 'skipped', 'timedOut'))) {
      return $invalid
    }
    if (-not (Test-C3ExactPropertySet $record.diagnostic @('cleanup', 'delivery', 'firstFailedInvariant', 'lastConfirmedMilestone', 'mismatchFields', 'origin'))) {
      return $invalid
    }
    if (($record.version -isnot [int] -and $record.version -isnot [long]) -or [long]$record.version -ne 3) {
      return $invalid
    }
    foreach ($name in @('began', 'discovered', 'failed', 'interrupted', 'notRun', 'passed', 'skipped', 'timedOut')) {
      if (-not (Test-C3SafeBrowserCounter $record.counts.$name)) { return $invalid }
    }
    $allowedPhases = @('NO_EVENT_OBSERVED', 'REPORTER_READY', 'NO_TEST_STARTED', 'DISCOVERED', 'TEST_STARTED', 'TEST_FINISHED', 'TERMINAL')
    $allowedStatuses = @('NO_EVENT_OBSERVED', 'NO_TEST_STARTED', 'RUNNING', 'PASSED', 'FAILED', 'TIMED_OUT', 'SKIPPED', 'INTERRUPTED')
    if (
      $record.phase -isnot [string] -or $allowedPhases -cnotcontains $record.phase -or
      $record.status -isnot [string] -or $allowedStatuses -cnotcontains $record.status -or
      $record.engine -isnot [string] -or $record.scenario -isnot [string] -or
      -not (Test-C3SafeBrowserIdentity $record.engine $record.scenario)
    ) { return $invalid }

    $allowedCleanups = @('FAILED', 'NOT_APPLICABLE', 'NOT_REQUIRED', 'NOT_RUN', 'PASSED')
    $allowedDeliveries = @(
      'ABSENT',
      'INVALID',
      'LATE',
      'MATCHED',
      'NOT_APPLICABLE',
      'RECIPIENT_MISMATCH',
      'SENTINEL_REGISTRATION_FAILED',
      'UNKNOWN',
      'UNREADABLE'
    )
    $allowedInvariants = @(
      'COMPROMISED_DIAGNOSTICS',
      'COMPROMISED_REFUSAL',
      'DELIVERY_RECIPIENT',
      'FIXTURE_PREPARATION',
      'FORM_CONFIRMATION_FOCUS',
      'GENERIC_REQUEST_RESPONSE',
      'NONE',
      'SUCCESS_CONFIRMATION',
      'UNICODE_POLICY_PREPARATION',
      'UNICODE_SUBMISSION',
      'UNKNOWN'
    )
    $allowedMilestones = @(
      'COMPROMISED_DIAGNOSTICS_CONFIRMED',
      'COMPROMISED_REFUSAL_RECEIVED',
      'DELIVERY_RECIPIENT_CONFIRMED',
      'FIXTURES_PREPARED',
      'FORM_CONFIRMATION_FOCUS_CONFIRMED',
      'GENERIC_REQUEST_RESPONSE_CONFIRMED',
      'NONE',
      'SUCCESS_CONFIRMED',
      'UNICODE_POLICY_READY',
      'UNICODE_SUBMITTED'
    )
    $allowedMismatchFields = @(
      'RESPONSE_ERROR_CODE',
      'RESPONSE_STATUS',
      'RESPONSE_ORIGIN',
      'DIAGNOSTICS_HIBP_CHECKS',
      'DIAGNOSTICS_HIBP_COMPROMISED_RESULTS',
      'DIAGNOSTICS_LAST_CONSTRAINT',
      'DIAGNOSTICS_LAST_PRIMARY_CODE',
      'DIAGNOSTICS_LAST_RATE_LIMIT_FAILURE',
      'DIAGNOSTICS_LAST_RATE_LIMIT_STAGE',
      'DIAGNOSTICS_LAST_TRANSACTION_CODE',
      'DIAGNOSTICS_RATE_LIMIT_CALLS',
      'DIAGNOSTICS_RATE_LIMIT_FAILURES',
      'DIAGNOSTICS_TRANSACTION_CALLS',
      'DIAGNOSTICS_TRANSACTION_FAILURES'
    )
    if (
      $record.diagnostic.cleanup -isnot [string] -or
      $allowedCleanups -cnotcontains $record.diagnostic.cleanup -or
      $record.diagnostic.delivery -isnot [string] -or
      $allowedDeliveries -cnotcontains $record.diagnostic.delivery -or
      $record.diagnostic.firstFailedInvariant -isnot [string] -or
      $allowedInvariants -cnotcontains $record.diagnostic.firstFailedInvariant -or
      $record.diagnostic.lastConfirmedMilestone -isnot [string] -or
      $allowedMilestones -cnotcontains $record.diagnostic.lastConfirmedMilestone -or
      $record.diagnostic.origin -isnot [string] -or
      @('API', 'BFF', 'UNKNOWN') -cnotcontains $record.diagnostic.origin -or
      $record.diagnostic.mismatchFields -isnot [Array]
    ) { return $invalid }
    $mismatchFields = @($record.diagnostic.mismatchFields)
    $lastMismatchIndex = -1
    foreach ($field in $mismatchFields) {
      if ($field -isnot [string]) { return $invalid }
      $index = [Array]::IndexOf([object[]]$allowedMismatchFields, [object]$field)
      if ($index -lt 0 -or $index -le $lastMismatchIndex) { return $invalid }
      $lastMismatchIndex = $index
    }
    $diagnostic = [ordered]@{
      cleanup = [string]$record.diagnostic.cleanup
      delivery = [string]$record.diagnostic.delivery
      firstFailedInvariant = [string]$record.diagnostic.firstFailedInvariant
      lastConfirmedMilestone = [string]$record.diagnostic.lastConfirmedMilestone
      mismatchFields = [object[]]$mismatchFields
      origin = [string]$record.diagnostic.origin
    }

    $counts = [ordered]@{}
    foreach ($name in @('began', 'discovered', 'failed', 'interrupted', 'notRun', 'passed', 'skipped', 'timedOut')) {
      $counts[$name] = [int]$record.counts.$name
    }
    $completed = $counts.failed + $counts.interrupted + $counts.passed + $counts.skipped + $counts.timedOut
    if (
      $counts.began -gt $counts.discovered -or
      $completed -gt $counts.discovered -or
      $counts.notRun -gt $counts.discovered -or
      ($counts.failed + $counts.interrupted + $counts.passed + $counts.timedOut) -gt $counts.began
    ) { return $invalid }

    if ($record.phase -eq 'NO_EVENT_OBSERVED') {
      if (
        $record.status -cne 'NO_EVENT_OBSERVED' -or
        $record.engine -cne 'NONE' -or
        $record.scenario -cne 'NONE' -or
        ($counts.Values | Measure-Object -Sum).Sum -ne 0
      ) { return $invalid }
    }
    elseif ($record.phase -eq 'REPORTER_READY') {
      if ($record.status -cne 'NO_TEST_STARTED' -or ($counts.Values | Measure-Object -Sum).Sum -ne 0) {
        return $invalid
      }
    }
    elseif ($record.phase -in @('DISCOVERED', 'TEST_STARTED', 'TEST_FINISHED', 'TERMINAL')) {
      if ($counts.discovered -ne 24) { return $invalid }
    }

    if ($record.phase -eq 'TERMINAL') {
      if (
        $completed + $counts.notRun -ne $counts.discovered -or
        $record.status -cnotin @('PASSED', 'FAILED', 'TIMED_OUT', 'INTERRUPTED') -or
        $null -eq $ProcessExitCode -or
        (($record.status -ceq 'PASSED') -ne ($ProcessExitCode -eq 0))
      ) { return $invalid }
      if (
        $record.status -ceq 'PASSED' -and (
          $counts.began -ne 24 -or
          $counts.passed -ne 24 -or
          $counts.failed -ne 0 -or
          $counts.interrupted -ne 0 -or
          $counts.notRun -ne 0 -or
          $counts.skipped -ne 0 -or
          $counts.timedOut -ne 0
        )
      ) { return $invalid }
    }

    $diagnosticIsNeutral = (
      $diagnostic.cleanup -ceq 'NOT_APPLICABLE' -and
      $diagnostic.delivery -ceq 'NOT_APPLICABLE' -and
      $diagnostic.firstFailedInvariant -ceq 'NONE' -and
      $diagnostic.lastConfirmedMilestone -ceq 'NONE' -and
      $diagnostic.mismatchFields.Count -eq 0 -and
      $diagnostic.origin -ceq 'UNKNOWN'
    )
    if ($record.scenario -cne 'CHROMIUM_RESET_UNICODE_PASSWORD') {
      if (-not $diagnosticIsNeutral) { return $invalid }
    }
    elseif ($record.phase -notin @('TEST_FINISHED', 'TERMINAL')) {
      if (-not $diagnosticIsNeutral) { return $invalid }
    }
    elseif ($record.status -ceq 'PASSED') {
      if (
        $diagnostic.cleanup -cne 'NOT_REQUIRED' -or
        $diagnostic.delivery -cne 'MATCHED' -or
        $diagnostic.firstFailedInvariant -cne 'NONE' -or
        $diagnostic.lastConfirmedMilestone -cne 'SUCCESS_CONFIRMED' -or
        $diagnostic.mismatchFields.Count -ne 0 -or
        $diagnostic.origin -cne 'API'
      ) { return $invalid }
    }
    elseif ($record.status -in @('FAILED', 'INTERRUPTED', 'TIMED_OUT')) {
      if (
        $diagnostic.cleanup -notin @('FAILED', 'NOT_RUN', 'PASSED') -or
        $diagnostic.firstFailedInvariant -ceq 'NONE' -or
        ($diagnostic.mismatchFields.Count -gt 0 -and
          $diagnostic.firstFailedInvariant -cne 'COMPROMISED_DIAGNOSTICS') -or
        ($diagnostic.firstFailedInvariant -cne 'COMPROMISED_DIAGNOSTICS' -and
          $diagnostic.mismatchFields.Count -ne 0)
      ) { return $invalid }
      $milestoneRank = @{
        NONE = 0
        FIXTURES_PREPARED = 1
        GENERIC_REQUEST_RESPONSE_CONFIRMED = 2
        DELIVERY_RECIPIENT_CONFIRMED = 3
        FORM_CONFIRMATION_FOCUS_CONFIRMED = 4
        COMPROMISED_REFUSAL_RECEIVED = 5
        COMPROMISED_DIAGNOSTICS_CONFIRMED = 6
        UNICODE_POLICY_READY = 7
        UNICODE_SUBMITTED = 8
        SUCCESS_CONFIRMED = 9
      }
      $invariantRank = @{
        FIXTURE_PREPARATION = 1
        GENERIC_REQUEST_RESPONSE = 2
        DELIVERY_RECIPIENT = 3
        FORM_CONFIRMATION_FOCUS = 4
        COMPROMISED_REFUSAL = 5
        COMPROMISED_DIAGNOSTICS = 6
        UNICODE_POLICY_PREPARATION = 7
        UNICODE_SUBMISSION = 8
        SUCCESS_CONFIRMATION = 9
        UNKNOWN = 10
      }
      if ($milestoneRank[$diagnostic.lastConfirmedMilestone] -ge $invariantRank[$diagnostic.firstFailedInvariant]) {
        return $invalid
      }
      $deliveryFailed = $diagnostic.firstFailedInvariant -ceq 'DELIVERY_RECIPIENT'
      $deliveryConfirmed = $milestoneRank[$diagnostic.lastConfirmedMilestone] -ge 3
      if (
        ($deliveryFailed -and $diagnostic.delivery -in @('MATCHED', 'NOT_APPLICABLE')) -or
        ($deliveryConfirmed -and $diagnostic.delivery -cne 'MATCHED') -or
        (-not $deliveryFailed -and -not $deliveryConfirmed -and $diagnostic.delivery -cne 'NOT_APPLICABLE')
      ) { return $invalid }
    }
    if (
      $null -ne $ProcessExitCode -and
      $ProcessExitCode -eq 0 -and
      ($record.phase -cne 'TERMINAL' -or $record.status -cne 'PASSED')
    ) {
      return $invalid
    }

    $publicPhase = [string]$record.phase
    $publicStatus = [string]$record.status
    if ($LaunchFailed) {
      if ($record.phase -cne 'NO_EVENT_OBSERVED') { return $invalid }
      $publicPhase = 'NO_EVENT_OBSERVED'
      $publicStatus = 'NO_EVENT_OBSERVED'
    }
    elseif ($null -ne $ProcessExitCode -and $record.phase -cne 'TERMINAL') {
      if ($counts.began -eq 0 -and $record.phase -in @('REPORTER_READY', 'NO_TEST_STARTED', 'DISCOVERED')) {
        $publicPhase = 'NO_TEST_STARTED'
        $publicStatus = 'NO_TEST_STARTED'
      } else {
        $publicPhase = 'INCOMPLETE'
        $publicStatus = 'INCOMPLETE'
      }
    }

    return [pscustomobject]@{
      Public = [ordered]@{
        counts = $counts
        diagnostic = $diagnostic
        engine = [string]$record.engine
        phase = $publicPhase
        scenario = [string]$record.scenario
        status = $publicStatus
        version = 3
      }
      Valid = $true
    }
  }
  catch { return $invalid }
}

function Write-C3SafeBrowserPublicSummary([object]$Result) {
  [Console]::Out.WriteLine(
    'C3_SAFE_BROWSER_SUMMARY ' + ($Result.Public | ConvertTo-Json -Compress -Depth 4)
  )
}
# END C3 SAFE BROWSER SUMMARY FUNCTIONS

# BEGIN C3 SAFE DELIVERY PIPELINE SUMMARY FUNCTIONS
function New-C3UnavailableDeliveryMarkerSnapshot() {
  return [ordered]@{
    bullmq = 'UNAVAILABLE'
    delivery = 'UNAVAILABLE'
    directoryMode = 'UNAVAILABLE'
    file = 'UNAVAILABLE'
    fileCount = 'UNAVAILABLE'
    fileMode = 'UNAVAILABLE'
    producer = 'UNAVAILABLE'
    worker = 'UNAVAILABLE'
  }
}

function Test-C3DeliveryExactPropertySet([object]$Value, [string[]]$Expected) {
  if ($null -eq $Value) { return $false }
  $actual = if ($Value -is [Collections.IDictionary]) {
    @($Value.Keys | ForEach-Object { [string]$_ } | Sort-Object -CaseSensitive)
  } else {
    @($Value.PSObject.Properties.Name | Sort-Object -CaseSensitive)
  }
  $expectedNames = @($Expected | Sort-Object -CaseSensitive)
  return ($actual -join "`n") -ceq ($expectedNames -join "`n")
}

function Test-C3DeliveryMarkerSnapshot([object]$Snapshot) {
  if (-not (Test-C3DeliveryExactPropertySet $Snapshot @(
        'bullmq', 'delivery', 'directoryMode', 'file', 'fileCount', 'fileMode',
        'producer', 'worker'
      ))) { return $false }
  return (
    $Snapshot.bullmq -is [string] -and
    @('CALLED_PENDING', 'NOT_CALLED', 'REJECTED', 'RESOLVED', 'UNAVAILABLE', 'UNCONFIRMED') -ccontains $Snapshot.bullmq -and
    $Snapshot.delivery -is [string] -and
    @('ATTEMPTED', 'NOT_OBSERVED', 'REJECTED', 'UNAVAILABLE', 'WRITTEN') -ccontains $Snapshot.delivery -and
    $Snapshot.directoryMode -is [string] -and
    @('OTHER', 'PRIVATE_0700', 'UNAVAILABLE') -ccontains $Snapshot.directoryMode -and
    $Snapshot.file -is [string] -and
    @('ABSENT', 'PRESENT_INVALID', 'PRESENT_VALID', 'UNAVAILABLE') -ccontains $Snapshot.file -and
    $Snapshot.fileCount -is [string] -and
    @('MULTIPLE', 'ONE', 'UNAVAILABLE', 'ZERO') -ccontains $Snapshot.fileCount -and
    $Snapshot.fileMode -is [string] -and
    @('NOT_APPLICABLE', 'OTHER', 'PRIVATE_0600', 'UNAVAILABLE') -ccontains $Snapshot.fileMode -and
    $Snapshot.producer -is [string] -and
    @('AMBIGUOUS', 'INELIGIBLE_RECORDED', 'OUTBOX_COMMITTED', 'STARTED', 'UNAVAILABLE') -ccontains $Snapshot.producer -and
    $Snapshot.worker -is [string] -and
    @('NOT_OBSERVED', 'READY', 'UNAVAILABLE') -ccontains $Snapshot.worker
  )
}

function Test-C3NotificationOutboxSnapshot([object]$Snapshot) {
  if (-not (Test-C3DeliveryExactPropertySet $Snapshot @('attempt', 'identity', 'state'))) {
    return $false
  }
  return (
    $Snapshot.attempt -is [string] -and
    @('MULTIPLE', 'ONE', 'UNAVAILABLE', 'ZERO') -ccontains $Snapshot.attempt -and
    $Snapshot.identity -is [string] -and
    @('EXPECTED', 'UNAVAILABLE', 'UNEXPECTED') -ccontains $Snapshot.identity -and
    $Snapshot.state -is [string] -and
    @(
      'ABSENT', 'AMBIGUOUS', 'CANCELLED', 'CLAIMED', 'DELIVERED',
      'DELIVERY_UNCERTAIN', 'FAILED', 'PENDING_UNCLAIMED', 'RETRY_PENDING', 'UNAVAILABLE'
    ) -ccontains $Snapshot.state
  )
}

function Get-C3DeliveryPipelineClassification(
  [string]$ObservedDelivery,
  [object]$Snapshot,
  [object]$Outbox,
  [string]$Stability
) {
  if ($Stability -cne 'STABLE') { return 'AMBIGUOUS' }
  switch -CaseSensitive ($ObservedDelivery) {
    'INVALID' { return 'HARNESS_RECORD_INVALID' }
    'LATE' { return 'LATE_DELIVERY' }
    'RECIPIENT_MISMATCH' { return 'RECIPIENT_MISMATCH' }
    'SENTINEL_REGISTRATION_FAILED' { return 'SENTINEL_REGISTRATION_FAILED' }
    'UNREADABLE' {
      if (
        @(
          $Snapshot.file,
          $Snapshot.fileCount,
          $Snapshot.fileMode,
          $Snapshot.directoryMode
        ) -contains 'UNAVAILABLE'
      ) { return 'DIAGNOSTIC_UNAVAILABLE' }
      if ($Snapshot.file -ceq 'PRESENT_VALID') { return 'HOST_READ_BOUNDARY' }
      return 'AMBIGUOUS'
    }
    'ABSENT' {
      if (
        @(
          $Snapshot.bullmq,
          $Snapshot.delivery,
          $Snapshot.file,
          $Snapshot.fileCount,
          $Snapshot.fileMode,
          $Snapshot.directoryMode,
          $Snapshot.producer,
          $Snapshot.worker,
          $Outbox.attempt,
          $Outbox.identity,
          $Outbox.state
        ) -contains 'UNAVAILABLE'
      ) { return 'DIAGNOSTIC_UNAVAILABLE' }
      if ($Snapshot.producer -ceq 'INELIGIBLE_RECORDED') { return 'ACCOUNT_INELIGIBLE' }
      if ($Snapshot.producer -ceq 'AMBIGUOUS') { return 'AMBIGUOUS' }
      if ($Snapshot.producer -cne 'OUTBOX_COMMITTED') { return 'PRODUCER_NOT_COMMITTED' }
      if ($Snapshot.delivery -ceq 'WRITTEN' -and $Snapshot.file -ceq 'PRESENT_VALID') {
        return 'CHANNEL_VISIBILITY_MISMATCH'
      }
      if ($Outbox.state -ceq 'CLAIMED' -or $Snapshot.delivery -ceq 'ATTEMPTED') {
        return 'WORKER_CLAIM_IN_PROGRESS'
      }
      if ($Outbox.state -ceq 'RETRY_PENDING') { return 'WORKER_RETRY_SCHEDULED' }
      if ($Outbox.state -ceq 'DELIVERY_UNCERTAIN') { return 'WORKER_DELIVERY_UNCERTAIN' }
      if ($Outbox.state -ceq 'FAILED' -or $Snapshot.delivery -ceq 'REJECTED') {
        return 'WORKER_FAILED'
      }
      if ($Outbox.state -ceq 'DELIVERED') { return 'CHANNEL_VISIBILITY_MISMATCH' }
      if ($Snapshot.worker -cne 'READY') { return 'WORKER_NOT_READY' }
      $pendingDeliveryIsPristine = (
        $Outbox.attempt -ceq 'ZERO' -and
        $Outbox.identity -ceq 'EXPECTED' -and
        $Outbox.state -ceq 'PENDING_UNCLAIMED' -and
        $Snapshot.worker -ceq 'READY' -and
        $Snapshot.directoryMode -ceq 'PRIVATE_0700' -and
        $Snapshot.delivery -ceq 'NOT_OBSERVED' -and
        $Snapshot.file -ceq 'ABSENT' -and
        $Snapshot.fileCount -ceq 'ZERO' -and
        $Snapshot.fileMode -ceq 'NOT_APPLICABLE'
      )
      if (
        $Snapshot.bullmq -in @('REJECTED', 'UNCONFIRMED') -and
        $pendingDeliveryIsPristine
      ) { return 'WAKEUP_UNCONFIRMED' }
      if ($Snapshot.bullmq -ceq 'RESOLVED' -and $pendingDeliveryIsPristine) {
        return 'WAKEUP_WAITING'
      }
      return 'AMBIGUOUS'
    }
    default { return 'AMBIGUOUS' }
  }
}

function New-C3SafeDeliveryPipelineSummary(
  [object]$BrowserSummary,
  [object]$FirstSnapshot,
  [object]$SecondSnapshot,
  [object]$FirstOutboxSnapshot,
  [object]$SecondOutboxSnapshot
) {
  $invalid = [ordered]@{
    attempt = 'UNAVAILABLE'
    bullmq = 'UNAVAILABLE'
    classification = 'DIAGNOSTIC_UNAVAILABLE'
    containerFile = 'UNAVAILABLE'
    delivery = 'UNKNOWN'
    directoryMode = 'UNAVAILABLE'
    fileCount = 'UNAVAILABLE'
    fileMode = 'UNAVAILABLE'
    outbox = 'UNAVAILABLE'
    outboxIdentity = 'UNAVAILABLE'
    producer = 'UNAVAILABLE'
    stability = 'UNAVAILABLE'
    version = 1
    worker = 'UNAVAILABLE'
  }
  if (
    $null -eq $BrowserSummary -or
    -not $BrowserSummary.Valid -or
    $BrowserSummary.Public.scenario -cne 'CHROMIUM_RESET_UNICODE_PASSWORD' -or
    $BrowserSummary.Public.diagnostic.firstFailedInvariant -cne 'DELIVERY_RECIPIENT' -or
    -not (Test-C3DeliveryMarkerSnapshot $FirstSnapshot) -or
    -not (Test-C3DeliveryMarkerSnapshot $SecondSnapshot) -or
    -not (Test-C3NotificationOutboxSnapshot $FirstOutboxSnapshot) -or
    -not (Test-C3NotificationOutboxSnapshot $SecondOutboxSnapshot)
  ) { return $invalid }
  $observedDelivery = [string]$BrowserSummary.Public.diagnostic.delivery
  if (@('ABSENT', 'INVALID', 'LATE', 'RECIPIENT_MISMATCH', 'SENTINEL_REGISTRATION_FAILED', 'UNKNOWN', 'UNREADABLE') -cnotcontains $observedDelivery) {
    return $invalid
  }
  $stability = if (
    ($FirstSnapshot | ConvertTo-Json -Compress -Depth 4) -ceq
    ($SecondSnapshot | ConvertTo-Json -Compress -Depth 4) -and
    ($FirstOutboxSnapshot | ConvertTo-Json -Compress -Depth 4) -ceq
    ($SecondOutboxSnapshot | ConvertTo-Json -Compress -Depth 4)
  ) { 'STABLE' } else { 'CHANGED' }
  return [ordered]@{
    attempt = [string]$SecondOutboxSnapshot.attempt
    bullmq = [string]$SecondSnapshot.bullmq
    classification = Get-C3DeliveryPipelineClassification $observedDelivery $SecondSnapshot $SecondOutboxSnapshot $stability
    containerFile = [string]$SecondSnapshot.file
    delivery = $observedDelivery
    directoryMode = [string]$SecondSnapshot.directoryMode
    fileCount = [string]$SecondSnapshot.fileCount
    fileMode = [string]$SecondSnapshot.fileMode
    outbox = [string]$SecondOutboxSnapshot.state
    outboxIdentity = [string]$SecondOutboxSnapshot.identity
    producer = [string]$SecondSnapshot.producer
    stability = $stability
    version = 1
    worker = [string]$SecondSnapshot.worker
  }
}

function Write-C3SafeDeliveryPipelinePublicSummary([object]$Summary) {
  [Console]::Out.WriteLine(
    'C3_SAFE_DELIVERY_PIPELINE_SUMMARY ' + ($Summary | ConvertTo-Json -Compress -Depth 4)
  )
}
# END C3 SAFE DELIVERY PIPELINE SUMMARY FUNCTIONS

# BEGIN C3 SAFE CLEANUP SUMMARY FUNCTIONS
function New-C3SafeInventoryChecks() {
  $checks = [Collections.Generic.List[object]]::new()
  foreach ($family in @('CONTAINERS', 'VOLUMES', 'NETWORKS', 'IMAGES')) {
    foreach ($phase in @('BEFORE_CAPTURE', 'AFTER_CAPTURE', 'COMPARISON')) {
      $checks.Add([ordered]@{
          added = 0
          family = $family
          missing = 0
          modified = 0
          phase = $phase
          qualifiedAcquisitions = 0
          status = 'NOT_RUN'
        })
    }
  }
  return [object[]]$checks
}

function Set-C3SafeInventoryCheckStatus(
  [object[]]$Checks,
  [string]$Family,
  [string]$Phase,
  [string]$Status,
  [int]$Added = 0,
  [int]$Missing = 0,
  [int]$Modified = 0,
  [int]$QualifiedAcquisitions = 0
) {
  $matches = @($Checks | Where-Object { $_.family -ceq $Family -and $_.phase -ceq $Phase })
  if ($matches.Count -ne 1) { throw 'C3 inventory summary target is invalid.' }
  $allowed = if ($Phase -in @('BEFORE_CAPTURE', 'AFTER_CAPTURE')) {
    @('CAPTURED', 'NOT_RUN', 'UNAVAILABLE')
  } else {
    @(
      'COMPARISON_UNAVAILABLE', 'DIFFERENCE_CONFIRMED', 'IDENTICAL', 'NOT_RUN',
      'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION'
    )
  }
  if ($allowed -cnotcontains $Status) { throw 'C3 inventory summary status is invalid.' }
  foreach ($count in @($Added, $Missing, $Modified, $QualifiedAcquisitions)) {
    if ($count -lt 0 -or $count -gt 1000000) { throw 'C3 inventory summary count is invalid.' }
  }
  if (
    $Phase -ne 'COMPARISON' -and
    ($Added -ne 0 -or $Missing -ne 0 -or $Modified -ne 0 -or $QualifiedAcquisitions -ne 0)
  ) { throw 'C3 inventory capture summary must not contain delta counts.' }
  if ($Family -cne 'IMAGES' -and $QualifiedAcquisitions -ne 0) {
    throw 'Only the image inventory may report qualified acquisitions.'
  }
  $deltaTotal = $Added + $Missing + $Modified
  if ($Phase -eq 'COMPARISON') {
    if ($Status -eq 'DIFFERENCE_CONFIRMED' -and $deltaTotal -eq 0) {
      throw 'A confirmed inventory difference requires a concrete delta.'
    }
    if ($Status -eq 'IDENTICAL' -and ($deltaTotal -ne 0 -or $QualifiedAcquisitions -ne 0)) {
      throw 'An identical inventory cannot report a delta.'
    }
    if (
      $Status -eq 'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION' -and
      ($Family -cne 'IMAGES' -or $deltaTotal -ne 0 -or $QualifiedAcquisitions -eq 0)
    ) { throw 'A preserved inventory acquisition must contain only qualified campaign images.' }
    if (
      $Status -in @('COMPARISON_UNAVAILABLE', 'NOT_RUN') -and
      ($deltaTotal -ne 0 -or $QualifiedAcquisitions -ne 0)
    ) { throw 'An unavailable inventory comparison cannot report a delta.' }
  }
  $target = $matches[0]
  $target.added = $Added
  $target.missing = $Missing
  $target.modified = $Modified
  $target.qualifiedAcquisitions = $QualifiedAcquisitions
  $target.status = $Status
}

function New-C3SafeCleanupSummary() {
  return [ordered]@{
    campaignRoot = 'NOT_RUN'
    compose = 'NOT_RUN'
    evidenceScan = 'NOT_RUN'
    inventory = 'NOT_RUN'
    inventoryChecks = New-C3SafeInventoryChecks
    status = 'NOT_RUN'
    version = 2
  }
}

function Write-C3SafeCleanupPublicSummary([object]$Summary) {
  $validStages = @('FAILED', 'NOT_RUN', 'PASSED')
  $valid = (
    $null -ne $Summary -and
    $validStages -ccontains $Summary.campaignRoot -and
    $validStages -ccontains $Summary.compose -and
    $validStages -ccontains $Summary.evidenceScan -and
    $validStages -ccontains $Summary.inventory -and
    $validStages -ccontains $Summary.status -and
    $Summary.version -eq 2 -and
    @($Summary.inventoryChecks).Count -eq 12
  )
  $projectedChecks = [Collections.Generic.List[object]]::new()
  if ($valid) {
    $expectedIndex = 0
    foreach ($family in @('CONTAINERS', 'VOLUMES', 'NETWORKS', 'IMAGES')) {
      foreach ($phase in @('BEFORE_CAPTURE', 'AFTER_CAPTURE', 'COMPARISON')) {
        $check = @($Summary.inventoryChecks)[$expectedIndex]
        $expectedIndex += 1
        if (
          -not (Test-C3DeliveryExactPropertySet $check @(
              'added', 'family', 'missing', 'modified', 'phase', 'qualifiedAcquisitions', 'status'
            )) -or
          $check.family -cne $family -or
          $check.phase -cne $phase
        ) { $valid = $false; break }
        $allowed = if ($phase -in @('BEFORE_CAPTURE', 'AFTER_CAPTURE')) {
          @('CAPTURED', 'NOT_RUN', 'UNAVAILABLE')
        } else {
          @(
            'COMPARISON_UNAVAILABLE', 'DIFFERENCE_CONFIRMED', 'IDENTICAL', 'NOT_RUN',
            'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION'
          )
        }
        $counts = @($check.added, $check.missing, $check.modified, $check.qualifiedAcquisitions)
        if (
          $allowed -cnotcontains $check.status -or
          @($counts | Where-Object { ($_ -isnot [int] -and $_ -isnot [long]) -or $_ -lt 0 -or $_ -gt 1000000 }).Count -ne 0 -or
          ($phase -ne 'COMPARISON' -and ($counts | Measure-Object -Sum).Sum -ne 0) -or
          ($family -cne 'IMAGES' -and $check.qualifiedAcquisitions -ne 0)
        ) { $valid = $false; break }
        $deltaTotal = $check.added + $check.missing + $check.modified
        if (
          ($phase -eq 'COMPARISON' -and $check.status -eq 'DIFFERENCE_CONFIRMED' -and $deltaTotal -eq 0) -or
          ($phase -eq 'COMPARISON' -and $check.status -eq 'IDENTICAL' -and ($deltaTotal -ne 0 -or $check.qualifiedAcquisitions -ne 0)) -or
          ($phase -eq 'COMPARISON' -and $check.status -eq 'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION' -and ($family -cne 'IMAGES' -or $deltaTotal -ne 0 -or $check.qualifiedAcquisitions -eq 0)) -or
          ($phase -eq 'COMPARISON' -and $check.status -in @('COMPARISON_UNAVAILABLE', 'NOT_RUN') -and ($deltaTotal -ne 0 -or $check.qualifiedAcquisitions -ne 0))
        ) { $valid = $false; break }
        $projectedChecks.Add([ordered]@{
            added = [int]$check.added
            family = [string]$check.family
            missing = [int]$check.missing
            modified = [int]$check.modified
            phase = [string]$check.phase
            qualifiedAcquisitions = [int]$check.qualifiedAcquisitions
            status = [string]$check.status
          })
      }
      if (-not $valid) { break }
    }
  }
  if ($valid -and $Summary.inventory -eq 'PASSED') {
    $valid = @($projectedChecks | Where-Object {
        ($_.phase -in @('BEFORE_CAPTURE', 'AFTER_CAPTURE') -and $_.status -cne 'CAPTURED') -or
        ($_.phase -eq 'COMPARISON' -and $_.status -notin @('IDENTICAL', 'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION'))
      }).Count -eq 0
  }
  if (
    $valid -and
    $Summary.status -eq 'PASSED' -and
    @(@(
        $Summary.campaignRoot,
        $Summary.compose,
        $Summary.evidenceScan,
        $Summary.inventory
      ) | Where-Object { $_ -cne 'PASSED' }).Count -ne 0
  ) { $valid = $false }
  if (-not $valid) {
    $Summary = New-C3SafeCleanupSummary
    $Summary.campaignRoot = 'FAILED'
    $Summary.compose = 'FAILED'
    $Summary.evidenceScan = 'FAILED'
    $Summary.inventory = 'FAILED'
    $Summary.status = 'FAILED'
    $projectedChecks = [Collections.Generic.List[object]]::new()
    foreach ($check in $Summary.inventoryChecks) { $projectedChecks.Add($check) }
  }
  $public = [ordered]@{
    campaignRoot = [string]$Summary.campaignRoot
    compose = [string]$Summary.compose
    evidenceScan = [string]$Summary.evidenceScan
    inventory = [string]$Summary.inventory
    inventoryChecks = [object[]]$projectedChecks
    status = [string]$Summary.status
    version = 2
  }
  [Console]::Out.WriteLine(
    'C3_SAFE_CLEANUP_SUMMARY ' + ($public | ConvertTo-Json -Compress -Depth 6)
  )
}

function ConvertTo-C3Exception([object]$Failure) {
  if ($Failure -is [Management.Automation.ErrorRecord]) { return $Failure.Exception }
  if ($Failure -is [Exception]) { return $Failure }
  return [Exception]::new([string]$Failure)
}

function Add-C3SafeCleanupFailure(
  [Collections.Generic.List[Exception]]$Failures,
  [string]$Stage
) {
  $Failures.Add([Exception]::new("C3 cleanup failed at the $Stage stage."))
}

function Complete-C3RunWithFailures(
  [object]$PrimaryFailure,
  [Collections.Generic.List[Exception]]$CleanupFailures
) {
  $terminalFailures = [Collections.Generic.List[Exception]]::new()
  if ($null -ne $PrimaryFailure) {
    $terminalFailures.Add((ConvertTo-C3Exception $PrimaryFailure))
  }
  foreach ($cleanupFailure in $CleanupFailures) {
    $terminalFailures.Add($cleanupFailure)
  }
  if ($terminalFailures.Count -eq 1) { throw $terminalFailures[0] }
  if ($terminalFailures.Count -gt 1) {
    throw [AggregateException]::new(
      'The C3 campaign and one or more cleanup stages failed.',
      [Exception[]]$terminalFailures
    )
  }
}
# END C3 SAFE CLEANUP SUMMARY FUNCTIONS

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
$ResolvedApplications = Resolve-C3ApplicationSet -WindowsPlatform $IsWindows
$OpenSsl = [string]$ResolvedApplications.OpenSsl.SelectedPath
$Docker = [string]$ResolvedApplications.Docker.SelectedPath
$Npm = [string]$ResolvedApplications.Npm.SelectedPath
$PermissionTool = [string]$ResolvedApplications.Permission.SelectedPath

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
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$CampaignRoot = Join-Path ([IO.Path]::GetTempPath()) ("kora-c3-$Instance-" + [Guid]::NewGuid().ToString('N'))
$SecretDirectory = Join-Path $CampaignRoot 'secrets'
$PrivateDirectory = Join-Path $CampaignRoot 'private'
$SafeBrowserSummaryPath = Join-Path $PrivateDirectory 'c3-safe-browser-summary.json'
$PublicCertificateDirectory = Join-Path $EvidenceDirectory 'certificates'
$PlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-output'
$RedactionProbePlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-redaction-probe-output'
$VisualPlaywrightOutputDirectory = Join-Path $EvidenceDirectory 'playwright-visual-output'
$VisualOutputDirectory = Join-Path $EvidenceDirectory 'visual-fixtures'

function Write-NewText([string]$Path, [string]$Value) {
  if (Test-Path -LiteralPath $Path) { throw "Refusing to overwrite $Path" }
  [IO.File]::WriteAllText($Path, $Value, $Utf8)
}

Write-NewText (Join-Path $EvidenceDirectory 'executable-resolutions.json') (([ordered]@{
      docker = $ResolvedApplications.Docker
      npm = $ResolvedApplications.Npm
      openssl = $ResolvedApplications.OpenSsl
      permission = $ResolvedApplications.Permission
    } | ConvertTo-Json -Depth 6) + "`n")

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

function Get-CanonicalDockerInventoryIdentity([string]$Label, [string]$Row) {
  $record = $Row | ConvertFrom-Json
  $identity = switch -CaseSensitive ($Label) {
    'containers' { [string]$record.ID }
    'volumes' { [string]$record.Name }
    'networks' { [string]$record.ID }
    'images' {
      ([ordered]@{
          Repository = [string]$record.Repository
          Tag = [string]$record.Tag
        } | ConvertTo-Json -Compress)
    }
    default { throw 'Unknown Docker inventory family.' }
  }
  if ($identity.Length -eq 0) { throw 'Docker inventory identity is empty.' }
  return $identity
}

function Get-CanonicalDockerInventoryDelta(
  [string]$Label,
  [string]$Before,
  [string]$After,
  [string[]]$QualifiedImageReferences
) {
  $beforeRows = @(Get-CanonicalDockerInventoryRows $Label $Before)
  $afterRows = @(Get-CanonicalDockerInventoryRows $Label $After)
  $beforeByIdentity = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)
  $afterByIdentity = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)
  foreach ($row in $beforeRows) {
    $identity = Get-CanonicalDockerInventoryIdentity $Label $row
    if (-not $beforeByIdentity.TryAdd($identity, $row)) { throw 'Duplicate Docker inventory identity before the campaign.' }
  }
  foreach ($row in $afterRows) {
    $identity = Get-CanonicalDockerInventoryIdentity $Label $row
    if (-not $afterByIdentity.TryAdd($identity, $row)) { throw 'Duplicate Docker inventory identity after the campaign.' }
  }
  $added = 0
  $missing = 0
  $modified = 0
  $qualifiedAcquisitions = 0
  foreach ($entry in $beforeByIdentity.GetEnumerator()) {
    if (-not $afterByIdentity.ContainsKey($entry.Key)) { $missing += 1; continue }
    if ($afterByIdentity[$entry.Key] -cne $entry.Value) { $modified += 1 }
  }
  foreach ($entry in $afterByIdentity.GetEnumerator()) {
    if ($beforeByIdentity.ContainsKey($entry.Key)) { continue }
    if ($Label -ceq 'images') {
      $record = $entry.Value | ConvertFrom-Json
      $qualifiedIdentity = ConvertTo-DockerImageReferenceIdentity `
        ([string]$record.Repository) `
        ([string]$record.Tag) `
        ([string]$record.Digest)
      if ($QualifiedImageReferences -ccontains $qualifiedIdentity) {
        $qualifiedAcquisitions += 1
        continue
      }
    }
    $added += 1
  }
  $status = if ($added -ne 0 -or $missing -ne 0 -or $modified -ne 0) {
    'DIFFERENCE_CONFIRMED'
  } elseif ($qualifiedAcquisitions -ne 0) {
    'PRESERVED_WITH_QUALIFIED_CAMPAIGN_ACQUISITION'
  } else {
    'IDENTICAL'
  }
  return [ordered]@{
    Added = $added
    Missing = $missing
    Modified = $modified
    QualifiedAcquisitions = $qualifiedAcquisitions
    Status = $status
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

$C3DeliveryMarkerSnapshotScript = @'
const fs = require('node:fs');
const path = require('node:path');
const root = '/run/kora-c3-private';
const campaignId = process.env.KORA_C3_CAMPAIGN_ID;
const allowed = {
  bullmq: new Set(['CALLED_PENDING', 'NOT_CALLED', 'REJECTED', 'RESOLVED', 'UNCONFIRMED']),
  delivery: new Set(['ATTEMPTED', 'NOT_OBSERVED', 'REJECTED', 'WRITTEN']),
  producer: new Set(['AMBIGUOUS', 'INELIGIBLE_RECORDED', 'OUTBOX_COMMITTED', 'STARTED']),
  worker: new Set(['READY']),
};
const marker = (name, absent) => {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, 'diagnostics', `${name}.json`), 'utf8'));
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['state', 'version']) ||
      value.version !== 1 ||
      typeof value.state !== 'string' ||
      !allowed[name].has(value.state)
    ) return 'UNAVAILABLE';
    return value.state;
  } catch (error) {
    return error && error.code === 'ENOENT' ? absent : 'UNAVAILABLE';
  }
};
const mode = (candidate, expected, privateMode) => {
  try {
    return (fs.statSync(candidate).mode & 0o777) === expected ? privateMode : 'OTHER';
  } catch {
    return 'UNAVAILABLE';
  }
};
const result = {
  bullmq: marker('bullmq', 'UNAVAILABLE'),
  delivery: marker('delivery', 'UNAVAILABLE'),
  directoryMode: mode(path.join(root, 'deliveries'), 0o700, 'PRIVATE_0700'),
  file: 'UNAVAILABLE',
  fileCount: 'UNAVAILABLE',
  fileMode: 'UNAVAILABLE',
  producer: marker('producer', 'UNAVAILABLE'),
  worker: marker('worker', 'UNAVAILABLE'),
};
try {
  const directory = path.join(root, 'deliveries');
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.delivery.json')).sort();
  let invalid = false;
  const resetFiles = [];
  for (const name of names) {
    const logicalDeliveryId = name.slice(0, -'.delivery.json'.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(logicalDeliveryId)) {
      invalid = true;
      continue;
    }
    try {
      const encoded = fs.readFileSync(path.join(directory, name));
      if (encoded.byteLength > 8192) throw new Error('invalid');
      const record = JSON.parse(encoded.toString('utf8'));
      if (
        record === null ||
        typeof record !== 'object' ||
        Array.isArray(record) ||
        JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['acknowledgement', 'campaignId', 'logicalDeliveryId', 'payload', 'purpose', 'version']) ||
        record.version !== 1 ||
        record.campaignId !== campaignId ||
        record.logicalDeliveryId !== logicalDeliveryId ||
        record.acknowledgement !== `c3-file-${logicalDeliveryId}` ||
        !['INVITATION', 'PASSWORD_RESET'].includes(record.purpose) ||
        record.payload === null ||
        typeof record.payload !== 'object' ||
        Array.isArray(record.payload) ||
        JSON.stringify(Object.keys(record.payload).sort()) !== JSON.stringify(['code', 'email']) ||
        typeof record.payload.code !== 'string' ||
        Buffer.byteLength(record.payload.code, 'utf8') > 256 ||
        typeof record.payload.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(record.payload.email)
      ) throw new Error('invalid');
      if (record.purpose === 'PASSWORD_RESET') resetFiles.push(path.join(directory, name));
    } catch {
      invalid = true;
    }
  }
  result.fileCount = resetFiles.length === 0 ? 'ZERO' : resetFiles.length === 1 ? 'ONE' : 'MULTIPLE';
  result.file = invalid ? 'PRESENT_INVALID' : resetFiles.length === 0 ? 'ABSENT' : 'PRESENT_VALID';
  result.fileMode = resetFiles.length === 0
    ? 'NOT_APPLICABLE'
    : resetFiles.every((candidate) => (fs.statSync(candidate).mode & 0o777) === 0o600)
      ? 'PRIVATE_0600'
      : 'OTHER';
} catch {
  result.file = 'UNAVAILABLE';
  result.fileCount = 'UNAVAILABLE';
  result.fileMode = 'UNAVAILABLE';
}
process.stdout.write(`${JSON.stringify(result)}\n`);
'@

function Get-C3DeliveryMarkerSnapshot([string]$Label) {
  $result = Invoke-Docker $Label @(
    'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
    '--profile', 'runtime', 'exec', '-T', 'notification',
    'node', '-e', $C3DeliveryMarkerSnapshotScript
  )
  $lines = @($result.Stdout -split "`r?`n" | Where-Object { $_.Length -gt 0 })
  if ($lines.Count -ne 1) { throw 'C3 delivery marker snapshot output is invalid.' }
  $snapshot = $lines[0] | ConvertFrom-Json
  if (-not (Test-C3DeliveryMarkerSnapshot $snapshot)) {
    throw 'C3 delivery marker snapshot schema is invalid.'
  }
  return $snapshot
}

function Get-C3NotificationOutboxSnapshot() {
  $query = @'
WITH selected AS (
  SELECT "state"::text AS state, "attemptCount" AS attempt_count
  FROM public."AdminNotificationOutbox"
  WHERE "purpose" = 'PASSWORD_RESET'
  ORDER BY "createdAt" DESC, "id" DESC
  LIMIT 2
), summary AS (
  SELECT count(*)::int AS row_count,
         max(state) AS selected_state,
         max(attempt_count)::int AS selected_attempt
  FROM selected
)
SELECT
  (CASE WHEN session_user = 'kora_admin_c2a_notification_worker' THEN 'EXPECTED' ELSE 'UNEXPECTED' END)
  || '|' ||
  (CASE
    WHEN row_count = 0 THEN 'ABSENT'
    WHEN row_count > 1 THEN 'AMBIGUOUS'
    WHEN selected_state = 'PENDING' AND selected_attempt = 0 THEN 'PENDING_UNCLAIMED'
    WHEN selected_state = 'PENDING' THEN 'RETRY_PENDING'
    WHEN selected_state IN ('CLAIMED', 'DELIVERED', 'FAILED', 'DELIVERY_UNCERTAIN', 'CANCELLED') THEN selected_state
    ELSE 'AMBIGUOUS'
  END)
  || '|' ||
  (CASE
    WHEN row_count = 0 OR selected_attempt = 0 THEN 'ZERO'
    WHEN selected_attempt = 1 THEN 'ONE'
    ELSE 'MULTIPLE'
  END)
FROM summary;
'@
  $shell = 'export PGPASSWORD="$(tr -d ''\r\n'' </run/secrets/postgres_admin_c2a_notification_worker_password)"; export PGOPTIONS=''-c default_transaction_read_only=on''; exec psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --host=127.0.0.1 --username=kora_admin_c2a_notification_worker --dbname="$POSTGRES_DB" --command "$KORA_C3_DIAGNOSTIC_SQL"'
  $result = Invoke-Docker 'delivery-pipeline-outbox' @(
    'compose', '-f', $ComposeFile, '--project-name', $ProjectName,
    'exec', '-T', '-e', "KORA_C3_DIAGNOSTIC_SQL=$query", 'postgres', 'sh', '-euc', $shell
  )
  $line = $result.Stdout.Trim()
  if ($line -notmatch '^(EXPECTED|UNEXPECTED)\|(ABSENT|AMBIGUOUS|CANCELLED|CLAIMED|DELIVERED|DELIVERY_UNCERTAIN|FAILED|PENDING_UNCLAIMED|RETRY_PENDING)\|(MULTIPLE|ONE|ZERO)$') {
    throw 'C3 notification outbox snapshot output is invalid.'
  }
  return [ordered]@{
    attempt = $Matches[3]
    identity = $Matches[1]
    state = $Matches[2]
  }
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

$DockerInventoryEntries = @(
  [ordered]@{ Label = 'containers'; Family = 'CONTAINERS'; Arguments = @('ps', '-a', '--no-trunc', '--format', '{{json .}}') },
  [ordered]@{ Label = 'volumes'; Family = 'VOLUMES'; Arguments = @('volume', 'ls', '--format', '{{json .}}') },
  [ordered]@{ Label = 'networks'; Family = 'NETWORKS'; Arguments = @('network', 'ls', '--no-trunc', '--format', '{{json .}}') },
  [ordered]@{ Label = 'images'; Family = 'IMAGES'; Arguments = @('image', 'ls', '--no-trunc', '--digests', '--format', '{{json .}}') }
)

$ForeignInventoryBefore = $null
$ForeignInventoryBeforeByLabel = @{}
$QualifiedCampaignImageReferences = @(Get-QualifiedComposeImageReferences $ComposeFile)
$PrimaryFailure = $null
$CleanupFailures = [Collections.Generic.List[Exception]]::new()
$CleanupSummary = New-C3SafeCleanupSummary
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
  foreach ($path in @('commands', 'deliveries', 'diagnostics', 'processing', 'responses', 'sentinels')) {
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
  $inventoryBeforeUnavailable = $false
  foreach ($entry in $DockerInventoryEntries) {
    try {
      $result = Invoke-Docker ("inventory-before-" + $entry.Label) $entry.Arguments
      $canonical = ConvertTo-CanonicalDockerInventory $entry.Label $result.Stdout
      $ForeignInventoryBeforeByLabel[$entry.Label] = $canonical
      $inventoryParts += $canonical
      Write-NewText `
        (Join-Path $EvidenceDirectory ("foreign-inventory-before-" + $entry.Label + '.canonical.txt')) `
        ($canonical + "`n")
      Set-C3SafeInventoryCheckStatus $CleanupSummary.inventoryChecks $entry.Family 'BEFORE_CAPTURE' 'CAPTURED'
    }
    catch {
      $inventoryBeforeUnavailable = $true
      Set-C3SafeInventoryCheckStatus $CleanupSummary.inventoryChecks $entry.Family 'BEFORE_CAPTURE' 'UNAVAILABLE'
    }
  }
  if ($inventoryBeforeUnavailable) { throw 'The foreign Docker inventory preflight is unavailable.' }
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
  Initialize-C3SafeBrowserSummary $SafeBrowserSummaryPath
  $SecretBrowserEnvironment = $BrowserEnvironment.Clone()
  $SecretBrowserEnvironment['KORA_C3_SAFE_SUMMARY_PATH'] = $SafeBrowserSummaryPath
  $browser = $null
  try {
    $browser = Invoke-Captured -Label 'playwright-c3-secret' -FilePath $Npm -Arguments $BrowserTestArguments -Environment $SecretBrowserEnvironment -RemoveEnvironment @(
      'KORA_C3_ARTIFACT_REDACTION_PROBE',
      'KORA_C3_ARTIFACT_REDACTION_PROBE_SENTINEL',
      'KORA_C3_VISUAL_FIXTURE_MODE',
      'KORA_C3_VISUAL_OUTPUT_DIR'
    ) -DynamicSentinelDirectory (Join-Path $PrivateDirectory 'sentinels') -SensitiveRedactions @($SensitiveValues) -AllowedExitCodes (0..255)
  }
  catch {
    Write-C3SafeBrowserPublicSummary (
      Get-C3SafeBrowserPublicSummary -Path $SafeBrowserSummaryPath -LaunchFailed $true
    )
    throw
  }
  $safeBrowserSummary = Get-C3SafeBrowserPublicSummary `
    -Path $SafeBrowserSummaryPath `
    -ProcessExitCode $browser.ExitCode
  Write-C3SafeBrowserPublicSummary $safeBrowserSummary
  if (
    $browser.ExitCode -ne 0 -and
    $safeBrowserSummary.Valid -and
    $safeBrowserSummary.Public.scenario -ceq 'CHROMIUM_RESET_UNICODE_PASSWORD' -and
    $safeBrowserSummary.Public.diagnostic.firstFailedInvariant -ceq 'DELIVERY_RECIPIENT'
  ) {
    $firstDeliverySnapshot = try {
      Get-C3DeliveryMarkerSnapshot 'delivery-pipeline-first'
    } catch {
      New-C3UnavailableDeliveryMarkerSnapshot
    }
    $firstOutboxSnapshot = try {
      Get-C3NotificationOutboxSnapshot
    } catch {
      [ordered]@{ attempt = 'UNAVAILABLE'; identity = 'UNAVAILABLE'; state = 'UNAVAILABLE' }
    }
    Start-Sleep -Milliseconds 250
    $secondDeliverySnapshot = try {
      Get-C3DeliveryMarkerSnapshot 'delivery-pipeline-second'
    } catch {
      New-C3UnavailableDeliveryMarkerSnapshot
    }
    $secondOutboxSnapshot = try {
      Get-C3NotificationOutboxSnapshot
    } catch {
      [ordered]@{ attempt = 'UNAVAILABLE'; identity = 'UNAVAILABLE'; state = 'UNAVAILABLE' }
    }
    Write-C3SafeDeliveryPipelinePublicSummary (
      New-C3SafeDeliveryPipelineSummary `
        $safeBrowserSummary `
        $firstDeliverySnapshot `
        $secondDeliverySnapshot `
        $firstOutboxSnapshot `
        $secondOutboxSnapshot
    )
  }
  if (-not $safeBrowserSummary.Valid -and $browser.ExitCode -eq 0) {
    $BrowserFailures.Add([Exception]::new('C3 safe browser summary validation failed.'))
  }
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
    'KORA_C3_SAFE_SUMMARY_PATH',
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
    'KORA_C3_SAFE_SUMMARY_PATH',
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
    $CleanupSummary.compose = 'PASSED'
  }
  catch {
    $CleanupSummary.compose = 'FAILED'
    Add-C3SafeCleanupFailure $CleanupFailures 'COMPOSE'
  }

  $inventoryPassed = $true
  $inventoryParts = @()
  $foreignInventoryAfterByLabel = @{}
  foreach ($entry in $DockerInventoryEntries) {
    try {
      $result = Invoke-Docker ("inventory-after-" + $entry.Label) $entry.Arguments
      $canonical = ConvertTo-CanonicalDockerInventory $entry.Label $result.Stdout
      $foreignInventoryAfterByLabel[$entry.Label] = $canonical
      $inventoryParts += $canonical
      Write-NewText `
        (Join-Path $EvidenceDirectory ("foreign-inventory-after-" + $entry.Label + '.canonical.txt')) `
        ($canonical + "`n")
      Set-C3SafeInventoryCheckStatus $CleanupSummary.inventoryChecks $entry.Family 'AFTER_CAPTURE' 'CAPTURED'
    }
    catch {
      $inventoryPassed = $false
      Set-C3SafeInventoryCheckStatus $CleanupSummary.inventoryChecks $entry.Family 'AFTER_CAPTURE' 'UNAVAILABLE'
    }
  }
  if ($foreignInventoryAfterByLabel.Count -eq $DockerInventoryEntries.Count) {
    $after = ($inventoryParts -join "`n")
    try {
      Write-NewText (Join-Path $EvidenceDirectory 'foreign-inventory-after.canonical.txt') ($after + "`n")
    } catch { $inventoryPassed = $false }
  }
  $comparisonEvidence = [Collections.Generic.List[string]]::new()
  foreach ($entry in $DockerInventoryEntries) {
    if (
      -not $ForeignInventoryBeforeByLabel.ContainsKey($entry.Label) -or
      -not $foreignInventoryAfterByLabel.ContainsKey($entry.Label)
    ) {
      Set-C3SafeInventoryCheckStatus `
        $CleanupSummary.inventoryChecks $entry.Family 'COMPARISON' 'COMPARISON_UNAVAILABLE'
      $comparisonEvidence.Add("$($entry.Family)=COMPARISON_UNAVAILABLE")
      $inventoryPassed = $false
      continue
    }
    try {
      $delta = Get-CanonicalDockerInventoryDelta `
        $entry.Label `
        $ForeignInventoryBeforeByLabel[$entry.Label] `
        $foreignInventoryAfterByLabel[$entry.Label] `
        $QualifiedCampaignImageReferences
      Set-C3SafeInventoryCheckStatus `
        $CleanupSummary.inventoryChecks `
        $entry.Family `
        'COMPARISON' `
        $delta.Status `
        $delta.Added `
        $delta.Missing `
        $delta.Modified `
        $delta.QualifiedAcquisitions
      $comparisonEvidence.Add("$($entry.Family)=$($delta.Status)")
      if ($delta.Status -ceq 'DIFFERENCE_CONFIRMED') { $inventoryPassed = $false }
    }
    catch {
      Set-C3SafeInventoryCheckStatus `
        $CleanupSummary.inventoryChecks $entry.Family 'COMPARISON' 'COMPARISON_UNAVAILABLE'
      $comparisonEvidence.Add("$($entry.Family)=COMPARISON_UNAVAILABLE")
      $inventoryPassed = $false
    }
  }
  try {
    if (
      $ForeignInventoryBeforeByLabel.Count -eq $DockerInventoryEntries.Count -and
      $foreignInventoryAfterByLabel.Count -eq $DockerInventoryEntries.Count
    ) {
      $comparison = Compare-CanonicalDockerInventories `
        $ForeignInventoryBeforeByLabel `
        $foreignInventoryAfterByLabel `
        $QualifiedCampaignImageReferences
      Write-NewText `
        (Join-Path $EvidenceDirectory 'campaign-acquired-images.canonical.txt') `
        (($comparison.AcquiredImageRows -join "`n") + "`n")
    }
    Write-NewText `
      (Join-Path $EvidenceDirectory 'foreign-inventory-comparison.txt') `
      (($comparisonEvidence -join "`n") + "`n")
  }
  catch { $inventoryPassed = $false }
  $CleanupSummary.inventory = if ($inventoryPassed) { 'PASSED' } else { 'FAILED' }
  if (-not $inventoryPassed) { Add-C3SafeCleanupFailure $CleanupFailures 'INVENTORY' }

  try {
    Invoke-EvidenceSecretScan $SensitiveValues
    $CleanupSummary.evidenceScan = 'PASSED'
  }
  catch {
    $CleanupSummary.evidenceScan = 'FAILED'
    Add-C3SafeCleanupFailure $CleanupFailures 'EVIDENCE_SCAN'
  }

  try {
    if (Test-Path -LiteralPath $CampaignRoot) {
      $resolvedCampaignRoot = (Resolve-Path -LiteralPath $CampaignRoot).Path
      $resolvedTempRoot = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path
      if (-not $resolvedCampaignRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase) -or $resolvedCampaignRoot -notmatch 'kora-c3-') {
        throw 'Refusing unsafe campaign-directory cleanup.'
      }
      Remove-Item -LiteralPath $resolvedCampaignRoot -Recurse -Force
    }
    $CleanupSummary.campaignRoot = 'PASSED'
  }
  catch {
    $CleanupSummary.campaignRoot = 'FAILED'
    Add-C3SafeCleanupFailure $CleanupFailures 'CAMPAIGN_ROOT'
  }

  $CleanupSummary.status = if ($CleanupFailures.Count -eq 0) { 'PASSED' } else { 'FAILED' }
  Write-C3SafeCleanupPublicSummary $CleanupSummary
}

Complete-C3RunWithFailures $PrimaryFailure $CleanupFailures
Write-Output 'C3 browser runtime validation PASS.'
