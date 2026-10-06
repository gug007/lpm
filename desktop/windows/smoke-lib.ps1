# Pure helpers for smoke.ps1: check accounting, the lesson socket protocol and
# quoting. Kept apart so smoke-selftest.ps1 can test them on any OS.

$script:LessonRequestId = 0

# --- results ---------------------------------------------------------------

function Add-SmokeResult {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Results,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('PASS', 'FAIL', 'SKIP', 'WARN')][string]$Status,
        [string]$Detail = ''
    )
    $Results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail })
    $line = "$Status $Name"
    if ($Detail) { $line += " -- $Detail" }
    Write-Host $line
}

# What a check's scriptblock produced, as a status: $true/$false, a dictionary
# with Pass (+ Detail) or Skip, or an error. An optional check that fails is
# a WARN, which never fails the run.
function ConvertTo-SmokeOutcome {
    param([AllowNull()][object]$Value, [switch]$Optional)
    $failed = if ($Optional) { 'WARN' } else { 'FAIL' }
    if ($Value -is [System.Management.Automation.ErrorRecord]) {
        return [pscustomobject]@{ Status = $failed; Detail = $Value.Exception.Message }
    }
    if ($Value -is [System.Exception]) {
        return [pscustomobject]@{ Status = $failed; Detail = $Value.Message }
    }
    if ($Value -is [bool]) {
        $status = if ($Value) { 'PASS' } else { $failed }
        return [pscustomobject]@{ Status = $status; Detail = '' }
    }
    if ($Value -is [System.Collections.IDictionary]) {
        if ($Value.Contains('Skip')) {
            return [pscustomobject]@{ Status = 'SKIP'; Detail = [string]$Value['Skip'] }
        }
        $status = if ([bool]$Value['Pass']) { 'PASS' } else { $failed }
        return [pscustomobject]@{ Status = $status; Detail = [string]$Value['Detail'] }
    }
    if ($null -eq $Value) {
        return [pscustomobject]@{ Status = $failed; Detail = 'the check returned nothing' }
    }
    [pscustomobject]@{ Status = $failed; Detail = "unexpected check result: $Value" }
}

# Runs one check and records it. Returns whether it passed, so the caller can
# gate later checks on it. The scriptblock's last output is its result.
function Invoke-SmokeCheck {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Results,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Test,
        [string]$SkipReason,
        [switch]$Optional
    )
    if ($SkipReason) {
        Add-SmokeResult -Results $Results -Name $Name -Status SKIP -Detail $SkipReason
        return $false
    }
    try {
        $produced = @(& $Test)
        $last = if ($produced.Count -gt 0) { $produced[-1] } else { $null }
        $outcome = ConvertTo-SmokeOutcome -Value $last -Optional:$Optional
    } catch {
        $outcome = ConvertTo-SmokeOutcome -Value $_ -Optional:$Optional
    }
    Add-SmokeResult -Results $Results -Name $Name -Status $outcome.Status -Detail $outcome.Detail
    $outcome.Status -eq 'PASS'
}

# A run with no PASS at all proved nothing, so it fails too.
function Get-SmokeSummary {
    param([AllowNull()][AllowEmptyCollection()][object[]]$Results)
    $tally = [ordered]@{ PASS = 0; FAIL = 0; SKIP = 0; WARN = 0 }
    foreach ($result in @($Results)) {
        if ($null -ne $result -and $tally.Contains($result.Status)) {
            $tally[$result.Status] += 1
        }
    }
    $exitCode = 0
    if ($tally.FAIL -gt 0 -or $tally.PASS -eq 0) { $exitCode = 1 }
    [pscustomobject]@{
        Pass     = $tally.PASS
        Fail     = $tally.FAIL
        Skip     = $tally.SKIP
        Warn     = $tally.WARN
        ExitCode = $exitCode
        Line     = "RESULT pass=$($tally.PASS) fail=$($tally.FAIL) skip=$($tally.SKIP) warn=$($tally.WARN)"
    }
}

# --- lesson control socket ---------------------------------------------------

function Format-LessonRequest {
    param(
        [Parameter(Mandatory)][long]$Id,
        [Parameter(Mandatory)][string]$Op,
        [System.Collections.IDictionary]$Fields
    )
    $request = [ordered]@{ id = $Id; op = $Op }
    if ($Fields) {
        foreach ($key in $Fields.Keys) { $request[$key] = $Fields[$key] }
    }
    (ConvertTo-Json -InputObject $request -Compress -Depth 10) + "`n"
}

# The first complete line of what the socket sent, parsed; $null until one
# has arrived.
function Read-LessonReply {
    param([AllowEmptyString()][string]$Text)
    $end = $Text.IndexOf("`n")
    if ($end -lt 0) { return $null }
    $line = $Text.Substring(0, $end).TrimEnd("`r")
    ConvertFrom-Json -InputObject $line
}

# Most ops carry their result as JSON; eval carries the page's JSON.stringify
# output as a string, so it is parsed once more.
function Get-LessonValue {
    param([Parameter(Mandatory)][object]$Reply, [switch]$Eval)
    if (-not $Reply.ok) { throw "the app answered with an error: $($Reply.value)" }
    if (-not $Eval) { return $Reply.value }
    if ($null -eq $Reply.value) { return $null }
    ConvertFrom-Json -InputObject ([string]$Reply.value) -NoEnumerate
}

function Invoke-LessonRequest {
    param(
        [Parameter(Mandatory)][string]$SocketPath,
        [Parameter(Mandatory)][string]$Op,
        [System.Collections.IDictionary]$Fields,
        [int]$TimeoutSec = 30
    )
    $script:LessonRequestId += 1
    $payload = Format-LessonRequest -Id $script:LessonRequestId -Op $Op -Fields $Fields
    $socket = [System.Net.Sockets.Socket]::new(
        [System.Net.Sockets.AddressFamily]::Unix,
        [System.Net.Sockets.SocketType]::Stream,
        [System.Net.Sockets.ProtocolType]::Unspecified)
    try {
        $socket.SendTimeout = $TimeoutSec * 1000
        $socket.ReceiveTimeout = $TimeoutSec * 1000
        $socket.Connect([System.Net.Sockets.UnixDomainSocketEndPoint]::new($SocketPath))
        [void]$socket.Send([System.Text.Encoding]::UTF8.GetBytes($payload))
        $received = [System.IO.MemoryStream]::new()
        $chunk = [byte[]]::new(65536)
        while ($true) {
            $count = $socket.Receive($chunk)
            if ($count -le 0) { break }
            $received.Write($chunk, 0, $count)
            if ($chunk[$count - 1] -eq 10) { break }
        }
        $reply = Read-LessonReply -Text ([System.Text.Encoding]::UTF8.GetString($received.ToArray()))
        if ($null -eq $reply) { throw "the lesson socket closed without answering '$Op'" }
        $reply
    } finally {
        $socket.Dispose()
    }
}

function Format-TauriInvokeJs {
    param([Parameter(Mandatory)][string]$Command, [System.Collections.IDictionary]$Arguments)
    if ($null -eq $Arguments) { $Arguments = @{} }
    $name = ConvertTo-Json -InputObject $Command -Compress
    $payload = ConvertTo-Json -InputObject $Arguments -Compress -Depth 10
    "return await window.__TAURI_INTERNALS__.invoke($name, $payload);"
}

# --- text and quoting --------------------------------------------------------

function ConvertTo-YamlQuoted {
    param([AllowEmptyString()][string]$Text)
    "'" + $Text.Replace("'", "''") + "'"
}

function ConvertTo-BashQuoted {
    param([AllowEmptyString()][string]$Text)
    "'" + $Text.Replace("'", "'\''") + "'"
}

# Git Bash runs the scripts the smoke writes, and CRLF breaks them.
function Write-SmokeText {
    param([Parameter(Mandatory)][string]$Path, [AllowEmptyString()][string]$Text)
    [System.IO.File]::WriteAllText($Path, ($Text -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
}

function New-SmokeProjectYaml {
    param(
        [Parameter(Mandatory)][string]$ProjectName,
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$Python,
        [Parameter(Mandatory)][int]$Port
    )
    $web = '{0} -m http.server {1} --bind 127.0.0.1' -f (ConvertTo-BashQuoted ($Python -replace '\\', '/')), $Port
    @(
        "name: $(ConvertTo-YamlQuoted $ProjectName)"
        "root: $(ConvertTo-YamlQuoted $Root)"
        'services:'
        '  web:'
        "    cmd: $(ConvertTo-YamlQuoted $web)"
        '  graceful:'
        "    cmd: $(ConvertTo-YamlQuoted 'bash ./svc.sh')"
        'actions:'
        '  hello:'
        '    label: Hello'
        "    cmd: $(ConvertTo-YamlQuoted 'echo hello-from-action > action.out')"
        '    display: header'
        ''
    ) -join "`n"
}
