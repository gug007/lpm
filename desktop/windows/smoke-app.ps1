# What smoke.ps1 drives the app with: launching it, its lesson socket, its
# Tauri commands, the lpm CLI, and the throwaway project the checks run on.
# They read $Cfg and $State from smoke.ps1.

$SvcScript = @'
#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
cat "/proc/$$/winpid" > svc.winpid 2>/dev/null
trap 'echo interrupted > svc.marker; exit 0' INT
while :; do sleep 300; done
'@

function Find-SmokeCli {
    param([string]$AppPath, [string]$RepoRoot)
    $beside = Join-Path (Split-Path -Parent $AppPath) 'lpm-cli.exe'
    if (Test-Path -LiteralPath $beside) { return $beside }
    $staged = Get-ChildItem -Path (Join-Path $RepoRoot 'desktop\frontend\src-tauri\binaries') -Filter 'lpm-cli-*.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($staged) { return $staged.FullName }
    throw "no lpm CLI beside $AppPath or in src-tauri\binaries; pass -Cli"
}

# `python` can be the Microsoft Store stub, which exits 9009 instead of running.
function Find-SmokePython {
    foreach ($candidate in 'python', 'py -3', 'python3') {
        $parts = $candidate -split ' '
        $probeArgs = @($parts | Select-Object -Skip 1) + @('-c', 'import sys; print(sys.executable)')
        try {
            $probe = Invoke-SmokeNative -FilePath $parts[0] -ArgumentList $probeArgs -TimeoutSec 30
        } catch {
            continue
        }
        $exe = $probe.Stdout.Trim()
        if ($probe.ExitCode -eq 0 -and $exe -and (Test-Path -LiteralPath $exe)) { return $exe }
    }
    ''
}

function Get-Skip {
    param([string[]]$Needs)
    foreach ($flag in $Needs) {
        if (-not $State[$flag]) { return "an earlier step did not pass ($flag)" }
    }
    ''
}

function Start-App {
    param([Parameter(Mandatory)][System.Collections.IDictionary]$Environment, [Parameter(Mandatory)][string]$Label)
    $process = Start-SmokeApp -App $Cfg.App -Environment $Environment -LogBase (Join-Path $Cfg.Artifacts "app-$Label")
    $State.Launched.Add($process.Id)
    Write-Host "started lpm ($Label) as pid $($process.Id)"
    $process
}

function Wait-AppReady {
    param([System.Diagnostics.Process]$Process, [string]$Socket, [int]$Seconds)
    $giveUp = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $giveUp) {
        if ($Process.HasExited) { return "lpm exited with code $($Process.ExitCode) before answering" }
        try {
            if ((Invoke-LessonRequest -SocketPath $Socket -Op 'ping' -TimeoutSec 3).value -eq 'pong') { return '' }
        } catch {
        }
        Start-Sleep -Seconds 1
    }
    "no answer on the lesson socket within $Seconds seconds"
}

function Invoke-Page {
    param([Parameter(Mandatory)][string]$Js, [int]$Seconds = 30)
    $reply = Invoke-LessonRequest -SocketPath $State.Lesson -Op 'eval' -Fields @{ js = $Js } -TimeoutSec $Seconds
    Get-LessonValue -Reply $reply -Eval
}

function Invoke-App {
    param([Parameter(Mandatory)][string]$Command, [System.Collections.IDictionary]$Arguments, [int]$Seconds = 60)
    Invoke-Page -Js (Format-TauriInvokeJs -Command $Command -Arguments $Arguments) -Seconds $Seconds
}

function Send-Terminal {
    param([Parameter(Mandatory)][string]$Data)
    $null = Invoke-App -Command 'write_terminal' -Arguments @{ id = $State.TerminalId; data = $Data }
}

function Invoke-Cli {
    param([string[]]$CliArgs, [string]$Stdin, [System.Collections.IDictionary]$Extra)
    $environment = @{ LPM_DIR = $Cfg.Data; LPM_SOCKET_PATH = $Cfg.Socket }
    if ($Extra) {
        foreach ($key in $Extra.Keys) { $environment[$key] = $Extra[$key] }
    }
    Invoke-SmokeNative -FilePath $Cfg.Cli -ArgumentList $CliArgs -StdinText $Stdin -Environment $environment -TimeoutSec 60
}

function Get-ProjectState {
    $name = ConvertTo-Json -InputObject $State.Name -Compress
    $js = 'const p = (await window.__TAURI_INTERNALS__.invoke("list_projects")).find(x => x.name === {0}); return p ? {{ running: !!p.running, services: (p.allServices || []).length, error: p.configError || "" }} : null;' -f $name
    Invoke-Page -Js $js
}

function Test-StatusSeen {
    param([string]$Key, [string]$Value)
    $status = Invoke-Cli -CliArgs 'status', $State.Name, '--json'
    if ($status.ExitCode -ne 0) { return $false }
    $project = (ConvertFrom-Json -InputObject $status.Stdout).projects | Where-Object { $_.name -eq $State.Name } | Select-Object -First 1
    [bool](@($project.statuses) | Where-Object { $_.key -eq $Key -and $_.value -eq $Value })
}

function Read-GracefulPid {
    $file = Join-Path $Cfg.Project 'svc.winpid'
    if (-not (Test-Path -LiteralPath $file)) { return 0 }
    $text = "$(Get-Content -LiteralPath $file -Raw)".Trim()
    if ($text -match '^\d+$') { [int]$text } else { 0 }
}

function Save-ServiceLogs {
    param([string]$Label)
    foreach ($service in 'web', 'graceful') {
        try {
            $logs = Invoke-Cli -CliArgs 'logs', $service, '-p', $State.Name, '-n', '80'
            Write-SmokeText -Path (Join-Path $Cfg.Artifacts "service-$service-$Label.log") -Text ($logs.Stdout + $logs.Stderr)
        } catch {
        }
    }
}

# stop_project returns once the daemon has ^C'd the panes and reaped what was
# left, so the trap's marker is already written when it is checked.
function Stop-AndVerify {
    $before = [pscustomobject]@{ Web = (Get-SmokePortOwner -Port $Cfg.Port); Graceful = (Read-GracefulPid) }
    $marker = Join-Path $Cfg.Project 'svc.marker'
    Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
    $null = Invoke-App -Command 'stop_project' -Arguments @{ name = $State.Name } -Seconds 120
    $trapped = Wait-SmokeCondition -TimeoutSec 10 -Until { Test-Path -LiteralPath $marker }
    $down = Wait-SmokeCondition -TimeoutSec 20 -Until { (Get-SmokeHttpStatus -Url $Cfg.Url) -ne 200 }
    $gone = Wait-SmokeCondition -TimeoutSec 15 -Until {
        -not (Test-SmokeProcessAlive $before.Web) -and -not (Test-SmokeProcessAlive $before.Graceful)
    }
    [pscustomobject]@{ Before = $before; Trapped = $trapped; Down = $down; Gone = $gone }
}

function New-SmokeRepo {
    New-Item -ItemType Directory -Force -Path $Cfg.Project | Out-Null
    Write-SmokeText -Path (Join-Path $Cfg.Project 'index.html') -Text "<h1>lpm smoke</h1>`n"
    Write-SmokeText -Path (Join-Path $Cfg.Project 'svc.sh') -Text $SvcScript
    $identity = @('-c', 'user.name=lpm smoke', '-c', 'user.email=smoke@example.invalid', '-c', 'core.autocrlf=false')
    foreach ($gitArgs in @(@('init', '-q'), @('add', '-A'), @('commit', '-q', '-m', 'init'))) {
        $git = Invoke-SmokeNative -FilePath 'git' -ArgumentList ($identity + $gitArgs) -WorkingDirectory $Cfg.Project
        if ($git.ExitCode -ne 0) { throw "git $($gitArgs -join ' '): $($git.Stderr.Trim())" }
    }
}
