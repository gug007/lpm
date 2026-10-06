#Requires -Version 7.2
<#
Runtime smoke test of the Windows desktop app. Starts a debug build that embeds
the frontend (cd desktop/frontend; npx tauri build --debug --no-bundle) on a
throwaway data directory, drives it through its lesson control socket (debug
builds only), the lpm CLI and, where the desktop allows, real keystrokes, and
prints PASS/FAIL/SKIP/WARN lines. Exits 1 on any FAIL; WARN is an optional
check that failed. Screenshots, app logs and results.json go to -ArtifactsDir.

  pwsh desktop/windows/smoke.ps1 [-App <lpm-desktop.exe>] [-Cli <lpm-cli.exe>]
      [-ArtifactsDir <dir>] [-Python <python.exe>] [-UseRealHome]
      [-SkipSingleInstance] [-SkipKeyboard] [-RequireKeyboard]

The single-instance checks need the default data directory (~\.lpm), since a
separate one is a separate instance by design. They run on CI, when ~\.lpm does
not exist yet (it is removed afterwards), or with -UseRealHome.
#>
[CmdletBinding()]
param(
    [string]$App,
    [string]$Cli,
    [string]$ArtifactsDir = (Join-Path (Get-Location) 'smoke-artifacts'),
    [string]$Python,
    [int]$BootTimeoutSec = 180,
    [switch]$UseRealHome,
    [switch]$SkipSingleInstance,
    [switch]$SkipKeyboard,
    [switch]$RequireKeyboard
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSNativeCommandUseErrorActionPreference = $false

. (Join-Path $PSScriptRoot 'smoke-lib.ps1')
. (Join-Path $PSScriptRoot 'smoke-system.ps1')
. (Join-Path $PSScriptRoot 'smoke-app.ps1')
. (Join-Path $PSScriptRoot 'smoke-window.ps1')

function Invoke-IsolatedPhase {
    $envA = [ordered]@{ LPM_DIR = $Cfg.Data; LPM_LESSON_SOCKET = $Cfg.Lesson; WEBVIEW2_USER_DATA_FOLDER = $Cfg.WebViewA }
    $State.Lesson = $Cfg.Lesson
    $app = Start-App -Environment $envA -Label 'first'
    $bootError = Wait-AppReady -Process $app -Socket $Cfg.Lesson -Seconds $BootTimeoutSec

    $State.AppUp = Invoke-SmokeCheck -Results $Results -Name 'app boots with data-platform=windows' -Test {
        if ($bootError) { throw $bootError }
        $seen = Wait-SmokeCondition -TimeoutSec 60 -Until {
            $State.Platform = Invoke-Page -Js 'return document.documentElement.dataset.platform || null' -Seconds 5
            $State.Platform -eq 'windows'
        }
        @{ Pass = $seen; Detail = "data-platform=$($State.Platform)" }
    }
    $null = Invoke-SmokeCheck -Results $Results -Name 'the UI renders (Add project button)' -SkipReason (Get-Skip 'AppUp') -Test {
        Wait-SmokeCondition -TimeoutSec 60 -Until {
            Invoke-Page -Js 'return !!document.querySelector(''button[title="Add project"]'')' -Seconds 5
        }
    }
    Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts '01-booted.png')

    $State.Project = Invoke-SmokeCheck -Results $Results -Name 'create_project adopts a temp git repo and reads its YAML' -SkipReason (Get-Skip 'AppUp') -Test {
        New-SmokeRepo
        $created = Invoke-App -Command 'create_project' -Arguments @{ name = 'smoke'; root = $Cfg.Project }
        $State.Name = [string]$created.name
        if (-not $State.Name) { throw "create_project returned no name: $(ConvertTo-Json -InputObject $created -Compress)" }
        $yaml = Join-Path $Cfg.Data "projects\$($State.Name).yml"
        if (-not (Test-Path -LiteralPath $yaml)) { throw "create_project wrote no $yaml" }
        $python = if ($Cfg.Python) { $Cfg.Python } else { 'python' }
        Write-SmokeText -Path $yaml -Text (New-SmokeProjectYaml -ProjectName $State.Name -Root $Cfg.Project -Python $python -Port $Cfg.Port)
        $info = Get-ProjectState
        @{
            Pass   = ($null -ne $info -and $info.services -eq 2 -and -not $info.error)
            Detail = "project $($State.Name): $(ConvertTo-Json -InputObject $info -Compress)"
        }
    }

    $State.Serving = Invoke-SmokeCheck -Results $Results -Name 'a service (python -m http.server) answers HTTP 200' -SkipReason (Get-Skip 'Project') -Test {
        $null = Invoke-App -Command 'start_project' -Arguments @{ name = $State.Name; profile = '' } -Seconds 120
        $State.Started = $true
        if (-not $Cfg.Python) { throw 'no Python found (python, py -3, python3); pass -Python <python.exe>' }
        $up = Wait-SmokeCondition -TimeoutSec 60 -Until { (Get-SmokeHttpStatus -Url $Cfg.Url) -eq 200 }
        $State.GracefulUp = Wait-SmokeCondition -TimeoutSec 20 -Until { (Read-GracefulPid) -gt 0 }
        @{ Pass = $up; Detail = "GET $($Cfg.Url) -> $(Get-SmokeHttpStatus -Url $Cfg.Url)" }
    }
    Save-ServiceLogs -Label 'started'

    $null = Invoke-SmokeCheck -Results $Results -Name 'an action runs and writes a file' -SkipReason (Get-Skip 'Project') -Test {
        $out = Join-Path $Cfg.Project 'action.out'
        $null = Invoke-App -Command 'run_action' -Arguments @{ projectName = $State.Name; actionName = 'hello'; inputValues = @{} }
        $written = Wait-SmokeCondition -TimeoutSec 30 -Until {
            (Test-Path -LiteralPath $out) -and "$(Get-Content -LiteralPath $out -Raw)" -match 'hello-from-action'
        }
        @{ Pass = $written; Detail = $out }
    }

    $State.Terminal = Invoke-SmokeCheck -Results $Results -Name 'a terminal runs Git Bash and a command written to it' -SkipReason (Get-Skip 'Project') -Test {
        $State.TerminalId = [string](Invoke-App -Command 'start_terminal' -Arguments @{ projectName = $State.Name })
        if (-not $State.TerminalId) { throw 'start_terminal returned no id' }
        $out = Join-Path $Cfg.Project 'term.out'
        $line = 'echo "bash=$BASH_VERSION msystem=$MSYSTEM shell=$SHELL uname=$(uname -s)" > term.out' + "`r"
        $wrote = { (Test-Path -LiteralPath $out) -and "$(Get-Content -LiteralPath $out -Raw)" -match 'uname=' }
        Start-Sleep -Seconds 2
        Send-Terminal -Data $line
        $written = Wait-SmokeCondition -TimeoutSec 20 -Until $wrote
        if (-not $written) {
            Send-Terminal -Data $line
            $written = Wait-SmokeCondition -TimeoutSec 20 -Until $wrote
        }
        $text = if ($written) { "$(Get-Content -LiteralPath $out -Raw)".Trim() } else { 'no term.out' }
        @{ Pass = ($text -match 'bash=\d' -and $text -match 'uname=\S+_NT'); Detail = $text }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name 'a ^C written to the terminal interrupts its foreground job' -SkipReason (Get-Skip 'Terminal') -Test {
        $intr = Join-Path $Cfg.Project 'intr.out'
        Send-Terminal -Data ('sleep 30; echo late > late.out' + "`r")
        Start-Sleep -Seconds 2
        Send-Terminal -Data ([string][char]3)
        Start-Sleep -Milliseconds 1500
        Send-Terminal -Data ('echo intr > intr.out' + "`r")
        $interrupted = Wait-SmokeCondition -TimeoutSec 15 -Until { Test-Path -LiteralPath $intr }
        Start-Sleep -Seconds 1
        $ranOn = Test-Path -LiteralPath (Join-Path $Cfg.Project 'late.out')
        @{ Pass = ($interrupted -and -not $ranOn); Detail = "intr.out=$interrupted late.out=$ranOn" }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name 'lpm status and list reach the app and the session daemon' -SkipReason (Get-Skip 'Started') -Test {
        $status = Invoke-Cli -CliArgs 'status', '--json'
        $reachable = $status.ExitCode -eq 0 -and [bool](ConvertFrom-Json -InputObject $status.Stdout).appReachable
        $list = Invoke-Cli -CliArgs 'list', '--json'
        $row = $null
        if ($list.ExitCode -eq 0) {
            $row = (ConvertFrom-Json -InputObject $list.Stdout).projects | Where-Object { $_.name -eq $State.Name } | Select-Object -First 1
        }
        $running = $null -ne $row -and [bool]$row.running
        @{
            Pass   = ($reachable -and $running)
            Detail = "status exit $($status.ExitCode) appReachable=$reachable; list exit $($list.ExitCode) running=$running $($status.Stderr.Trim()) $($list.Stderr.Trim())"
        }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name 'lpm set-status round-trips through the app' -SkipReason (Get-Skip 'Project') -Test {
        $set = Invoke-Cli -CliArgs 'set-status', 'smoke-check', 'Running', '-p', $State.Name
        $seen = Wait-SmokeCondition -TimeoutSec 10 -Until { Test-StatusSeen -Key 'smoke-check' -Value 'Running' }
        $clear = Invoke-Cli -CliArgs 'clear-status', 'smoke-check', '-p', $State.Name
        @{
            Pass   = ($set.ExitCode -eq 0 -and $seen -and $clear.ExitCode -eq 0)
            Detail = "set exit $($set.ExitCode), listed=$seen, clear exit $($clear.ExitCode) $($set.Stderr.Trim())"
        }
    }

    $State.Hooked = Invoke-SmokeCheck -Results $Results -Name 'lpm hook takes a Claude Stop payload on stdin and exits 0 silently' -SkipReason (Get-Skip 'Project') -Test {
        $pane = if ($State.TerminalId) { $State.TerminalId } else { 'smoke-pane' }
        $payload = '{"session_id":"smoke-hook","hook_event_name":"Stop","stop_hook_active":false}'
        $hook = Invoke-Cli -CliArgs 'hook', 'claude', 'Stop' -Stdin $payload -Extra @{ LPM_PROJECT_NAME = $State.Name; LPM_PANE_ID = $pane }
        @{ Pass = ($hook.ExitCode -eq 0 -and -not $hook.Stdout.Trim()); Detail = "exit $($hook.ExitCode), stdout [$($hook.Stdout.Trim())]" }
    }
    $null = Invoke-SmokeCheck -Results $Results -Name 'the hook''s Done status reaches the app' -SkipReason (Get-Skip 'Hooked', 'Terminal') -Test {
        Wait-SmokeCondition -TimeoutSec 10 -Until { Test-StatusSeen -Key 'claude_code_smoke-hook' -Value 'Done' }
    }

    Save-ServiceLogs -Label 'before-stop'
    if ($State.Started) {
        try { $State.FirstStop = Stop-AndVerify } catch { $State.FirstStopError = $_.Exception.Message }
    }
    $null = Invoke-SmokeCheck -Results $Results -Name 'stopping types ^C first: the service''s bash INT trap ran' -SkipReason (Get-Skip 'Started') -Test {
        if ($State.FirstStopError) { throw $State.FirstStopError }
        if (-not $State.GracefulUp) { throw 'the graceful service never started (no svc.winpid)' }
        @{ Pass = $State.FirstStop.Trapped; Detail = "svc.marker written=$($State.FirstStop.Trapped), bash pid $($State.FirstStop.Before.Graceful)" }
    }
    $null = Invoke-SmokeCheck -Results $Results -Name 'stopped services are gone (port closed, processes exited)' -SkipReason (Get-Skip 'Started') -Test {
        if ($State.FirstStopError) { throw $State.FirstStopError }
        $stop = $State.FirstStop
        @{
            Pass   = ($stop.Down -and $stop.Gone -and $stop.Before.Web -gt 0)
            Detail = "port closed=$($stop.Down), python pid $($stop.Before.Web) and bash pid $($stop.Before.Graceful) gone=$($stop.Gone)"
        }
    }

    $State.Restarted = Invoke-SmokeCheck -Results $Results -Name 'the project starts again after a stop' -SkipReason (Get-Skip 'Serving') -Test {
        Remove-Item -LiteralPath (Join-Path $Cfg.Project 'svc.winpid') -Force -ErrorAction SilentlyContinue
        $null = Invoke-App -Command 'start_project' -Arguments @{ name = $State.Name; profile = '' } -Seconds 120
        $up = Wait-SmokeCondition -TimeoutSec 60 -Until { (Get-SmokeHttpStatus -Url $Cfg.Url) -eq 200 }
        $graceful = Wait-SmokeCondition -TimeoutSec 20 -Until { (Read-GracefulPid) -gt 0 }
        @{ Pass = ($up -and $graceful); Detail = "http=$up graceful=$graceful" }
    }

    $State.Quit = Invoke-SmokeCheck -Results $Results -Name 'the lesson quit op exits the app' -SkipReason (Get-Skip 'AppUp') -Test {
        $null = Invoke-LessonRequest -SocketPath $Cfg.Lesson -Op 'quit' -TimeoutSec 10
        $app.WaitForExit(30000)
    }
    if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }

    $null = Invoke-SmokeCheck -Results $Results -Name 'a running service outlives the app (session daemon)' -SkipReason (Get-Skip 'Quit', 'Restarted') -Test {
        Start-Sleep -Seconds 2
        $code = Get-SmokeHttpStatus -Url $Cfg.Url
        @{ Pass = ($code -eq 200); Detail = "GET $($Cfg.Url) -> $code with lpm gone" }
    }

    if (-not $State.AppUp) { return }
    # A WebView2 browser process of the first instance may still be exiting.
    $envA.WEBVIEW2_USER_DATA_FOLDER = $Cfg.WebViewRelaunch
    $relaunched = Start-App -Environment $envA -Label 'relaunch'
    $relaunchError = Wait-AppReady -Process $relaunched -Socket $Cfg.Lesson -Seconds $BootTimeoutSec
    $State.Relaunched = Invoke-SmokeCheck -Results $Results -Name 'a relaunched app finds the project still running' -SkipReason (Get-Skip 'Restarted') -Test {
        if ($relaunchError) { throw $relaunchError }
        $running = Wait-SmokeCondition -TimeoutSec 30 -Until {
            $State.Info = Get-ProjectState
            [bool]$State.Info.running
        }
        @{ Pass = $running; Detail = ConvertTo-Json -InputObject $State.Info -Compress }
    }

    if (-not $relaunchError) { Invoke-KeyboardChecks -AppProcess $relaunched }

    $null = Invoke-SmokeCheck -Results $Results -Name 'stopping from the relaunched app ends the services' -SkipReason (Get-Skip 'Relaunched') -Test {
        $stop = Stop-AndVerify
        @{
            Pass   = ($stop.Trapped -and $stop.Down -and $stop.Gone -and $stop.Before.Web -gt 0)
            Detail = "bash INT trap ran=$($stop.Trapped), port closed=$($stop.Down), processes gone=$($stop.Gone)"
        }
    }
    Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts '02-relaunched.png')

    if (-not $relaunched.HasExited) {
        try { $null = Invoke-LessonRequest -SocketPath $Cfg.Lesson -Op 'quit' -TimeoutSec 10 } catch { }
        if (-not $relaunched.WaitForExit(30000)) { Stop-Process -Id $relaunched.Id -Force -ErrorAction SilentlyContinue }
    }
}

# The session daemon and its panes are not the app's to end when it quits, so
# they are found by what they run from (the data directory) and by port.
function Invoke-Cleanup {
    foreach ($id in $State.Launched) {
        if (Test-SmokeProcessAlive $id) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    }
    if (Test-Path -LiteralPath $Cfg.Data) {
        try {
            $stop = Invoke-SmokeNative -FilePath $Cfg.App -ArgumentList '--stop-sessions' -Environment @{ LPM_DIR = $Cfg.Data } -TimeoutSec 60
            Write-Host "lpm-desktop --stop-sessions: exit $($stop.ExitCode) $($stop.Stderr.Trim())"
        } catch {
            Write-Host "lpm-desktop --stop-sessions failed: $($_.Exception.Message)"
        }
    }
    $roots = [System.Collections.Generic.List[int]]::new()
    foreach ($row in @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ExecutablePath, CommandLine -ErrorAction SilentlyContinue)) {
        if ("$($row.ExecutablePath) $($row.CommandLine)" -like "*$($Cfg.Tag)*") { $roots.Add([int]$row.ProcessId) }
    }
    foreach ($id in $State.Launched) { $roots.Add($id) }
    $owner = Get-SmokePortOwner -Port $Cfg.Port
    if ($owner -gt 0) { $roots.Add($owner) }
    Stop-SmokeProcessTree -Roots $roots.ToArray()
}

if (-not $IsWindows) { throw 'smoke.ps1 drives the Windows build of lpm; run it on Windows.' }

$ArtifactsDir = [System.IO.Path]::GetFullPath($ArtifactsDir, (Get-Location).Path)
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if (-not $App) { $App = Join-Path $repoRoot 'desktop\frontend\src-tauri\target\debug\lpm-desktop.exe' }
$App = (Resolve-Path -LiteralPath $App).Path
if (-not $Cli) { $Cli = Find-SmokeCli -AppPath $App -RepoRoot $repoRoot }
$Cli = (Resolve-Path -LiteralPath $Cli).Path
if (-not $Python) { $Python = Find-SmokePython }

# RUNNER_TEMP before %TEMP%, which a runner spells with an 8.3 short name. The
# tag names every path the run creates, so cleanup can find what runs there.
$tempBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$tag = 'lpm-smoke-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
$tempRoot = Join-Path $tempBase $tag
$port = Get-SmokeFreePort
$Cfg = @{
    App             = $App
    Cli             = $Cli
    Python          = $Python
    Tag             = $tag
    Root            = $tempRoot
    Data            = Join-Path $tempRoot 'data'
    Project         = Join-Path $tempRoot 'proj'
    Lesson          = Join-Path $tempRoot 'lesson.sock'
    LessonB         = Join-Path $tempRoot 'lesson-b.sock'
    LessonC         = Join-Path $tempRoot 'lesson-c.sock'
    WebViewA        = Join-Path $tempRoot 'webview-a'
    WebViewRelaunch = Join-Path $tempRoot 'webview-relaunch'
    WebViewB        = Join-Path $tempRoot 'webview-b'
    Artifacts       = $ArtifactsDir
    Port            = $port
    Url             = "http://127.0.0.1:$port/"
    RealHomeDir     = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.lpm'
}
$Cfg.Socket = Join-Path $Cfg.Data 'lpm-dev.sock'
$Results = [System.Collections.Generic.List[object]]::new()
$State = @{ Launched = [System.Collections.Generic.List[int]]::new() }

New-Item -ItemType Directory -Force -Path $ArtifactsDir, $Cfg.Data | Out-Null
Initialize-SmokeNative
$screen = [LpmSmoke.Native]::VirtualScreen()
Write-Host "app      $($Cfg.App)"
Write-Host "cli      $($Cfg.Cli)"
Write-Host "python   $(if ($Python) { $Python } else { 'not found' })"
Write-Host "data     $($Cfg.Data)"
Write-Host "screen   $($screen[2])x$($screen[3]); $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription) $([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture); pwsh $($PSVersionTable.PSVersion)"

try {
    Invoke-IsolatedPhase
    Invoke-SingleInstancePhase
} catch {
    Add-SmokeResult -Results $Results -Name 'smoke harness' -Status FAIL -Detail "$($_.Exception.Message) $($_.ScriptStackTrace)"
} finally {
    Invoke-Cleanup
}

$summary = Get-SmokeSummary -Results $Results.ToArray()
ConvertTo-Json -InputObject $Results.ToArray() -Depth 4 | Set-Content -LiteralPath (Join-Path $ArtifactsDir 'results.json')
Copy-Item -LiteralPath (Join-Path $Cfg.Data 'logs') -Destination (Join-Path $ArtifactsDir 'lpm-logs') -Recurse -Force -ErrorAction SilentlyContinue
if ($summary.ExitCode -ne 0) {
    Get-ChildItem -LiteralPath $ArtifactsDir -Filter 'app-*.log' | ForEach-Object { Show-SmokeLog -Path $_.FullName }
    Get-ChildItem -LiteralPath (Join-Path $ArtifactsDir 'lpm-logs') -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { Show-SmokeLog -Path $_.FullName }
    Write-Host "kept $tempRoot for inspection"
} else {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ''
foreach ($result in $Results) { Write-Host "$($result.Status) $($result.Name)" }
Write-Host $summary.Line
exit $summary.ExitCode
