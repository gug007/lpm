#Requires -Version 7.2
# Parses the smoke scripts and tests their helpers that need no app, on any OS,
# so a mistake in them fails in seconds instead of after the app build.
$ErrorActionPreference = 'Stop'
$failures = [System.Collections.Generic.List[string]]::new()
$checks = 0

foreach ($file in 'smoke.ps1', 'smoke-lib.ps1', 'smoke-system.ps1', 'smoke-app.ps1', 'smoke-window.ps1', 'smoke-selftest.ps1') {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file), [ref]$tokens, [ref]$parseErrors)
    $checks++
    foreach ($parseError in $parseErrors) {
        $failures.Add("${file}:$($parseError.Extent.StartLineNumber): $($parseError.Message)")
    }
}
if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Host "FAIL $failure" }
    exit 1
}

. (Join-Path $PSScriptRoot 'smoke-lib.ps1')
. (Join-Path $PSScriptRoot 'smoke-system.ps1')

function Assert-That {
    param([object]$Condition, [string]$Label)
    $script:checks++
    if (-not $Condition) { $failures.Add($Label) }
}

# --- lesson socket framing ---

$line = Format-LessonRequest -Id 7 -Op 'eval' -Fields ([ordered]@{ js = "return 1;`nreturn 2" })
Assert-That ($line.EndsWith("`n") -and $line.IndexOf("`n") -eq $line.Length - 1) 'a request is one line ending in a newline'
$parsed = ConvertFrom-Json -InputObject $line
Assert-That ($parsed.id -eq 7 -and $parsed.op -eq 'eval' -and $parsed.js -eq "return 1;`nreturn 2") 'a request carries id, op and a multi-line script'
Assert-That ((Format-LessonRequest -Id 1 -Op 'ping') -eq ('{"id":1,"op":"ping"}' + "`n")) 'a bare op sends only id and op'

$reply = Read-LessonReply -Text ('{"id":1,"ok":true,"value":"\"windows\""}' + "`r`n")
Assert-That ($reply.ok -eq $true -and (Get-LessonValue -Reply $reply -Eval) -eq 'windows') 'an eval reply unwraps the page value'
Assert-That ($null -eq (Read-LessonReply -Text '{"id":1,"ok":tr')) 'a partial line is not a reply yet'
$pong = Read-LessonReply -Text ('{"id":2,"ok":true,"value":"pong"}' + "`n" + '{"id":3}')
Assert-That ((Get-LessonValue -Reply $pong) -eq 'pong') 'a non-eval reply carries its value as is'
$object = Get-LessonValue -Eval -Reply (Read-LessonReply -Text ('{"id":4,"ok":true,"value":"{\"running\":true,\"services\":2}"}' + "`n"))
Assert-That ($object.running -eq $true -and $object.services -eq 2) 'an eval reply can carry an object'
Assert-That ($null -eq (Get-LessonValue -Eval -Reply (Read-LessonReply -Text ('{"id":5,"ok":true,"value":"null"}' + "`n")))) 'undefined in the page comes back as null'
$threw = $false
try {
    $null = Get-LessonValue -Eval -Reply (Read-LessonReply -Text ('{"id":6,"ok":false,"value":"TypeError: boom"}' + "`n"))
} catch {
    $threw = $_.Exception.Message -match 'boom'
}
Assert-That $threw 'a failed eval throws with the page error'

Assert-That ((Format-TauriInvokeJs -Command 'list_projects') -eq 'return await window.__TAURI_INTERNALS__.invoke("list_projects", {});') 'a command without arguments sends {}'
$js = Format-TauriInvokeJs -Command 'run_action' -Arguments ([ordered]@{ projectName = 'p'; actionName = 'a'; inputValues = @{} })
Assert-That ($js -eq 'return await window.__TAURI_INTERNALS__.invoke("run_action", {"projectName":"p","actionName":"a","inputValues":{}});') 'command arguments serialize as camelCase JSON'
$js = Format-TauriInvokeJs -Command 'write_terminal' -Arguments ([ordered]@{ id = 't1'; data = "x`r" + [char]3 })
Assert-That ($js.Contains('"data":"x\r\u0003"')) 'terminal input escapes CR and ^C'

# --- outcomes and accounting ---

Assert-That ((ConvertTo-SmokeOutcome -Value $true).Status -eq 'PASS') '$true passes'
Assert-That ((ConvertTo-SmokeOutcome -Value $false).Status -eq 'FAIL') '$false fails'
Assert-That ((ConvertTo-SmokeOutcome -Value $false -Optional).Status -eq 'WARN') 'an optional failure warns'
$outcome = ConvertTo-SmokeOutcome -Value @{ Skip = 'why' }
Assert-That ($outcome.Status -eq 'SKIP' -and $outcome.Detail -eq 'why') 'a Skip entry skips with its reason'
$outcome = ConvertTo-SmokeOutcome -Value @{ Pass = $true; Detail = 'd' }
Assert-That ($outcome.Status -eq 'PASS' -and $outcome.Detail -eq 'd') 'a Pass entry keeps its detail'
Assert-That ((ConvertTo-SmokeOutcome -Value $null).Status -eq 'FAIL') 'no result fails'
Assert-That ((ConvertTo-SmokeOutcome -Value 'text').Status -eq 'FAIL') 'an unexpected result fails'

$recorded = [System.Collections.Generic.List[object]]::new()
$passed = Invoke-SmokeCheck -Results $recorded -Name 'passes' -Test { 'noise'; $true } 6>$null
$failedCheck = Invoke-SmokeCheck -Results $recorded -Name 'fails' -Test { @{ Pass = $false; Detail = 'why' } } 6>$null
$thrown = Invoke-SmokeCheck -Results $recorded -Name 'throws' -Test { throw 'kaput' } 6>$null
$skipped = Invoke-SmokeCheck -Results $recorded -Name 'skipped' -SkipReason 'not now' -Test { $true } 6>$null
$warned = Invoke-SmokeCheck -Results $recorded -Name 'optional' -Optional -Test { $false } 6>$null
Assert-That ($passed -and -not $failedCheck -and -not $thrown -and -not $skipped -and -not $warned) 'a check returns whether it passed'
Assert-That ((($recorded | ForEach-Object Status) -join ',') -eq 'PASS,FAIL,FAIL,SKIP,WARN') 'checks record PASS, FAIL, FAIL on a throw, SKIP and WARN'
Assert-That ($recorded[2].Detail -eq 'kaput') 'a throwing check records its message'

$summary = Get-SmokeSummary -Results $recorded.ToArray()
Assert-That ($summary.Pass -eq 1 -and $summary.Fail -eq 2 -and $summary.Skip -eq 1 -and $summary.Warn -eq 1 -and $summary.ExitCode -eq 1) 'a FAIL exits 1'
$mild = @([pscustomobject]@{ Status = 'PASS' }, [pscustomobject]@{ Status = 'WARN' }, [pscustomobject]@{ Status = 'SKIP' })
Assert-That ((Get-SmokeSummary -Results $mild).ExitCode -eq 0) 'PASS beside WARN and SKIP exits 0'
Assert-That ((Get-SmokeSummary -Results @()).ExitCode -eq 1) 'a run without a PASS exits 1'
Assert-That ((Get-SmokeSummary -Results $mild).Line -eq 'RESULT pass=1 fail=0 skip=1 warn=1') 'the summary line counts each status'

# --- processes, quoting, files, waiting ---

$table = @(
    [pscustomobject]@{ ProcessId = 10; ParentProcessId = 1 }
    [pscustomobject]@{ ProcessId = 11; ParentProcessId = 10 }
    [pscustomobject]@{ ProcessId = 12; ParentProcessId = 11 }
    [pscustomobject]@{ ProcessId = 20; ParentProcessId = 1 }
    [pscustomobject]@{ ProcessId = 0; ParentProcessId = 0 }
)
Assert-That ((@(Get-SmokeDescendants -Table $table -Roots 10) -join ',') -eq '10,11,12') 'a tree walk takes every descendant and nothing else'
Assert-That ((@(Get-SmokeDescendants -Table $table -Roots 10, 20, 99) -join ',') -eq '10,11,12,20,99') 'a tree walk takes several roots'

Assert-That ((ConvertTo-YamlQuoted "it's") -eq "'it''s'") 'YAML quoting doubles single quotes'
Assert-That ((ConvertTo-BashQuoted "a'b") -eq "'a'\''b'") 'bash quoting closes, escapes and reopens'
$yaml = New-SmokeProjectYaml -ProjectName 'smoke' -Root 'C:\Users\o''neil\proj' -Python 'C:\Python 3\python.exe' -Port 5000
$yamlLines = $yaml -split "`n"
Assert-That ($yamlLines -contains "root: 'C:\Users\o''neil\proj'") 'the project root survives YAML quoting'
Assert-That ($yamlLines -contains "    cmd: '''C:/Python 3/python.exe'' -m http.server 5000 --bind 127.0.0.1'") 'the web service quotes python for bash, then for YAML'
Assert-That (-not $yaml.Contains("`r")) 'the project YAML is LF only'

$script:attempts = 0
Assert-That (Wait-SmokeCondition -TimeoutSec 5 -IntervalMs 10 -Until { $script:attempts++; $script:attempts -ge 3 }) 'a wait returns once its condition holds'
$started = [DateTime]::UtcNow
$never = Wait-SmokeCondition -TimeoutSec 0.3 -IntervalMs 50 -Until { $false }
Assert-That (-not $never -and ([DateTime]::UtcNow - $started).TotalSeconds -lt 3) 'a wait gives up at its timeout'
Assert-That (-not (Wait-SmokeCondition -TimeoutSec 0.2 -IntervalMs 50 -Until { throw 'x' })) 'a condition that throws counts as not met'

$port = Get-SmokeFreePort
Assert-That ($port -gt 0) 'a free port is found'
Assert-That ((Get-SmokeHttpStatus -Url "http://127.0.0.1:$port/" -TimeoutSec 2) -eq 0) 'a closed port answers no status'

$pwshPath = (Get-Process -Id $PID).Path
$echo = Invoke-SmokeNative -FilePath $pwshPath -ArgumentList '-NoProfile', '-NonInteractive', '-Command', '[Console]::In.ReadToEnd().ToUpper(); $env:SMOKE_PROBE; exit 3' -StdinText 'abc' -Environment @{ SMOKE_PROBE = 'probe-value' }
Assert-That ($echo.ExitCode -eq 3 -and $echo.Stdout -match 'ABC' -and $echo.Stdout -match 'probe-value') 'a native call gets stdin and its own environment, and reports its exit code'
$slow = Invoke-SmokeNative -FilePath $pwshPath -ArgumentList '-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30' -TimeoutSec 2
Assert-That ($slow.TimedOut -and $slow.ExitCode -eq -1) 'a native call that runs too long is ended'

try {
    Initialize-SmokeNative
    Assert-That ([bool]('LpmSmoke.Native' -as [type])) 'the Win32 helper compiles'
} catch {
    $failures.Add("the Win32 helper compiles: $($_.Exception.Message)")
}

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('lpm-selftest-' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
    $shFile = Join-Path $scratch 'a.sh'
    Write-SmokeText -Path $shFile -Text "a`r`nb`n"
    Assert-That (([System.IO.File]::ReadAllBytes($shFile) -join ',') -eq '97,10,98,10') 'scripts are written as UTF-8 without a BOM, with LF'

    # A stand-in for the app's lesson socket, so the AF_UNIX client is proven
    # on this machine before any app exists.
    $socketPath = Join-Path $scratch 'l.sock'
    $shared = [hashtable]::Synchronized(@{})
    $server = Start-ThreadJob -ArgumentList $socketPath, $shared -ScriptBlock {
        param($path, $shared)
        $listener = [System.Net.Sockets.Socket]::new(
            [System.Net.Sockets.AddressFamily]::Unix,
            [System.Net.Sockets.SocketType]::Stream,
            [System.Net.Sockets.ProtocolType]::Unspecified)
        $shared.Listener = $listener
        try {
            $listener.Bind([System.Net.Sockets.UnixDomainSocketEndPoint]::new($path))
            $listener.Listen(1)
            $shared.Listening = $true
            $connection = $listener.Accept()
            try {
                $stream = [System.Net.Sockets.NetworkStream]::new($connection)
                $request = ConvertFrom-Json -InputObject ([System.IO.StreamReader]::new($stream).ReadLine())
                $value = ConvertTo-Json -InputObject ('echo:' + $request.js) -Compress
                $answer = (ConvertTo-Json -InputObject ([ordered]@{ id = $request.id; ok = $true; value = $value }) -Compress) + "`n"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($answer)
                $stream.Write($bytes, 0, $bytes.Length)
                $stream.Flush()
            } finally {
                $connection.Dispose()
            }
        } finally {
            $listener.Dispose()
        }
    }
    try {
        $listening = Wait-SmokeCondition -TimeoutSec 10 -IntervalMs 50 -Until { $shared.Listening -eq $true }
        Assert-That $listening 'the stand-in lesson socket listens'
        if ($listening) {
            $answer = Invoke-LessonRequest -SocketPath $socketPath -Op 'eval' -Fields @{ js = 'ping' } -TimeoutSec 10
            Assert-That ((Get-LessonValue -Reply $answer -Eval) -eq 'echo:ping') 'a request and its reply cross an AF_UNIX socket'
        }
        $null = Wait-Job -Job $server -Timeout 10
        $null = Receive-Job -Job $server -ErrorAction Stop
    } catch {
        $failures.Add("lesson socket round trip: $($_.Exception.Message)")
    } finally {
        if ($server.State -eq 'Running' -and $shared.Listener) { $shared.Listener.Dispose() }
        $null = Wait-Job -Job $server -Timeout 5
        Remove-Job -Job $server -Force -ErrorAction SilentlyContinue
    }
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) { Write-Host "FAIL $failure" }
    Write-Host "selftest: $($failures.Count) of $checks checks failed"
    exit 1
}
Write-Host "selftest: all $checks checks passed"
exit 0
