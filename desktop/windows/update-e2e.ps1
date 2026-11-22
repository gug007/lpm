#Requires -Version 7.2
<#
End-to-end test of lpm updating itself on Windows. Installs -Installer, a
release build stamped as an old version, for this user, then checks that:

  1. a No to the installer's usage-data question turns the daily usage count
     and crash reports off before lpm's first start sends either, and that
     start still gets the first-launch defaults;
  2. the same installer, run again as a silent upgrade, ends the running lpm
     and replaces it (the running-app check in packaging/windows/hooks.nsh);
  3. `lpm update --now` downloads the latest release's installer, quits lpm,
     installs it and opens lpm again, as the Update button does;
  4. lpm is back on that release, from the install folder, and a service
     started before the update is still running and still listed.

Meant for a throwaway machine (CI): it uses the default data directory, since
the installer reopens lpm without this script's environment, and it leaves
lpm installed.

  pwsh desktop/windows/update-e2e.ps1 -Installer <setup.exe> [-ArtifactsDir <dir>]
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Installer,
    [string]$ArtifactsDir = (Join-Path (Get-Location) 'update-e2e-artifacts'),
    [int]$TimeoutSec = 300
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSNativeCommandUseErrorActionPreference = $false

. (Join-Path $PSScriptRoot 'smoke-lib.ps1')
. (Join-Path $PSScriptRoot 'smoke-system.ps1')
. (Join-Path $PSScriptRoot 'smoke-app.ps1')

function Find-Install {
    $uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    foreach ($key in @(Get-ChildItem -LiteralPath $uninstall -ErrorAction SilentlyContinue)) {
        $entry = Get-ItemProperty -LiteralPath $key.PSPath
        if ($entry.DisplayName -eq 'lpm' -and $entry.UninstallString) {
            return [pscustomobject]@{
                Dir     = Split-Path -Parent ($entry.UninstallString.Trim('"'))
                Version = [string]$entry.DisplayVersion
            }
        }
    }
    $null
}

function Invoke-Installer {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $process = Start-Process -FilePath $Cfg.Installer -ArgumentList $Arguments -PassThru
    $null = $process.Handle
    if (-not $process.WaitForExit($TimeoutSec * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "the installer didn't finish within $TimeoutSec seconds"
    }
    $process.ExitCode
}

function Get-AppPids {
    @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'lpm-desktop.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $State.Exe } |
        ForEach-Object { [int]$_.ProcessId })
}

function Start-Lpm {
    param([Parameter(Mandatory)][string]$Label)
    $process = Start-SmokeApp -App $State.Exe -Environment @{ LPM_UPDATE_E2E = '1' } -LogBase (Join-Path $Cfg.Artifacts "app-$Label")
    Write-Host "started lpm ($Label) as pid $($process.Id)"
    $process
}

# The CLI the test drives lpm with is a copy outside the install folder, like
# the one on PATH: Windows can't replace a running exe, and `lpm update` keeps
# running until lpm is back.
function Invoke-Lpm {
    param([Parameter(Mandatory)][string[]]$CliArgs, [int]$Seconds = 60)
    Invoke-SmokeNative -FilePath $Cfg.Cli -ArgumentList $CliArgs -TimeoutSec $Seconds
}

function Read-LpmJson {
    param([Parameter(Mandatory)][string[]]$CliArgs, [int]$Seconds = 60)
    $run = Invoke-Lpm -CliArgs $CliArgs -Seconds $Seconds
    if ($run.ExitCode -ne 0) {
        throw "lpm $($CliArgs -join ' ') exited $($run.ExitCode): $($run.Stderr.Trim()) $($run.Stdout.Trim())"
    }
    ConvertFrom-Json -InputObject $run.Stdout
}

# `update --check` needs the app, so it answers only once lpm is up, and its
# currentVersion is the version running. A release check GitHub refused still
# prints it, with a non-zero exit.
function Wait-LpmVersion {
    param([int]$Seconds = 180)
    $script:Running = ''
    $up = Wait-SmokeCondition -TimeoutSec $Seconds -IntervalMs 2000 -Until {
        $run = Invoke-Lpm -CliArgs 'update', '--check', '--json' -Seconds 30
        $script:Running = [string](ConvertFrom-Json -InputObject $run.Stdout).currentVersion
        [bool]$script:Running
    }
    if ($up) { $script:Running } else { '' }
}

function Get-E2eProject {
    @((Read-LpmJson -CliArgs 'list', '--json').projects) | Where-Object { $_.name -eq 'e2e' } | Select-Object -First 1
}

function Invoke-Cleanup {
    $roots = [System.Collections.Generic.List[int]]::new()
    foreach ($id in @(Get-AppPids)) { $roots.Add($id) }
    $service = Read-GracefulPid
    if ($service -gt 0) { $roots.Add($service) }
    $daemons = Join-Path $Cfg.DataDir 'bin'
    foreach ($row in @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)) {
        if ($row.ExecutablePath -and $row.ExecutablePath.StartsWith($daemons, [StringComparison]::OrdinalIgnoreCase)) {
            $roots.Add([int]$row.ProcessId)
        }
    }
    Stop-SmokeProcessTree -Roots $roots.ToArray()
}

if (-not $IsWindows) { throw 'update-e2e.ps1 installs the Windows build of lpm; run it on Windows.' }

$ArtifactsDir = [System.IO.Path]::GetFullPath($ArtifactsDir, (Get-Location).Path)
$tempBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$tempRoot = Join-Path $tempBase ('lpm-update-e2e-' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
$Cfg = @{
    Installer = (Resolve-Path -LiteralPath $Installer).Path
    Root      = $tempRoot
    Project   = Join-Path $tempRoot 'proj'
    Artifacts = $ArtifactsDir
    DataDir   = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.lpm'
    ChoiceKey = 'HKCU:\Software\lpm'
    Cli       = ''
}
$Results = [System.Collections.Generic.List[object]]::new()
$State = @{}
New-Item -ItemType Directory -Force -Path $ArtifactsDir, $tempRoot | Out-Null
Write-Host "installer $($Cfg.Installer)"

try {
    $State.Installed = Invoke-SmokeCheck -Results $Results -Name 'the installer puts lpm in place silently' -Test {
        $code = Invoke-Installer -Arguments '/S'
        $install = Find-Install
        if (-not $install) { throw "exit code $code, and no lpm entry under the user's installed apps" }
        $State.Dir = $install.Dir
        $State.Exe = Join-Path $install.Dir 'lpm-desktop.exe'
        $State.OldVersion = $install.Version
        @{
            Pass   = ($code -eq 0 -and (Test-Path -LiteralPath $State.Exe) -and (Test-Path -LiteralPath (Join-Path $install.Dir 'uninstall.exe')))
            Detail = "exit $code, $($install.Dir), version $($install.Version)"
        }
    }

    if ($State.Installed) {
        $Cfg.Cli = Join-Path $tempRoot 'lpm.exe'
        Copy-Item -LiteralPath (Join-Path $State.Dir 'lpm-cli.exe') -Destination $Cfg.Cli -Force
        # What the installer leaves when its usage-data question is answered No
        # (hooks.nsh); a silent install never asks.
        New-Item -Path $Cfg.ChoiceKey -Force | Out-Null
        New-ItemProperty -Path $Cfg.ChoiceKey -Name 'SendUsageData' -PropertyType DWord -Value 0 -Force | Out-Null
    }

    $State.Up = Invoke-SmokeCheck -Results $Results -Name 'lpm starts and answers the CLI' -SkipReason (Get-Skip 'Installed') -Test {
        $null = Start-Lpm -Label 'first'
        $version = Wait-LpmVersion
        @{ Pass = ($version -eq $State.OldVersion); Detail = "running $version" }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name "the installer's No turns usage data off and keeps the first-launch defaults" -SkipReason (Get-Skip 'Up') -Test {
        $settingsPath = Join-Path $Cfg.DataDir 'settings.json'
        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        $left = Get-ItemProperty -Path $Cfg.ChoiceKey -Name 'SendUsageData' -ErrorAction SilentlyContinue
        $global = Join-Path $Cfg.DataDir 'global.yml'
        $seeded = (Test-Path -LiteralPath $global) -and ((Get-Content -LiteralPath $global -Raw) -match '(?m)^\s+claude:')
        $dated = (Get-Item -LiteralPath $settingsPath).LastWriteTimeUtc.Year -lt 2001
        @{
            Pass   = ($settings.dailyPing -eq $false -and $settings.crashReports -eq $false -and -not $left -and $seeded)
            Detail = "dailyPing=$($settings.dailyPing) crashReports=$($settings.crashReports) registry value left: $([bool]$left) global.yml seeded: $seeded settings.json backdated: $dated"
        }
    }

    $State.Replaced = Invoke-SmokeCheck -Results $Results -Name 'a silent upgrade ends the running lpm and replaces it' -SkipReason (Get-Skip 'Up') -Test {
        # A running lpm-desktop.exe can't be overwritten, so a check that misses
        # it leaves this lpm running and the installer failing.
        $before = @(Get-AppPids)
        if ($before.Count -eq 0) { throw 'no lpm running from the install folder' }
        $code = Invoke-Installer -Arguments '/S', '/UPDATE'
        $ended = Wait-SmokeCondition -TimeoutSec 30 -Until {
            @($before | Where-Object { Test-SmokeProcessAlive $_ }).Count -eq 0
        }
        @{
            Pass   = ($code -eq 0 -and $ended)
            Detail = "exit $code; lpm $($before -join ',') ended: $ended"
        }
    }

    $State.Serving = Invoke-SmokeCheck -Results $Results -Name 'lpm starts again and runs a service' -SkipReason (Get-Skip 'Replaced') -Test {
        $null = Start-Lpm -Label 'second'
        if (-not (Wait-LpmVersion)) { throw 'lpm did not answer after the upgrade' }
        New-SmokeRepo
        $yaml = @(
            'name: e2e'
            "root: $(ConvertTo-YamlQuoted $Cfg.Project)"
            'services:'
            '  sleeper:'
            "    cmd: $(ConvertTo-YamlQuoted 'bash ./svc.sh')"
            ''
        ) -join "`n"
        New-Item -ItemType Directory -Force -Path (Join-Path $Cfg.DataDir 'projects') | Out-Null
        Write-SmokeText -Path (Join-Path $Cfg.DataDir 'projects\e2e.yml') -Text $yaml
        $start = Invoke-Lpm -CliArgs 'start', 'e2e' -Seconds 120
        if ($start.ExitCode -ne 0) { throw "lpm start e2e exited $($start.ExitCode): $($start.Stderr.Trim())" }
        $running = Wait-SmokeCondition -TimeoutSec 60 -Until { Test-SmokeProcessAlive (Read-GracefulPid) }
        $State.ServicePid = Read-GracefulPid
        @{ Pass = $running; Detail = "service pid $($State.ServicePid)" }
    }

    $State.Updated = Invoke-SmokeCheck -Results $Results -Name 'lpm update --now installs the latest release and lpm comes back' -SkipReason (Get-Skip 'Serving') -Test {
        $State.AppBefore = @(Get-AppPids)
        $update = Invoke-Lpm -CliArgs 'update', '--now', '--json' -Seconds $TimeoutSec
        Write-SmokeText -Path (Join-Path $Cfg.Artifacts 'update.out.log') -Text ($update.Stdout + "`n" + $update.Stderr)
        if ($update.ExitCode -ne 0) { throw "exit $($update.ExitCode): $($update.Stderr.Trim()) $($update.Stdout.Trim())" }
        $reply = ConvertFrom-Json -InputObject $update.Stdout
        $State.NewVersion = [string]$reply.version
        @{ Pass = ($reply.state -eq 'installed' -and $State.NewVersion -and $State.NewVersion -ne $State.OldVersion); Detail = "$($update.Stdout.Trim())" }
    }
    Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts 'after-update.png')

    $null = Invoke-SmokeCheck -Results $Results -Name 'the new release runs from the install folder' -SkipReason (Get-Skip 'Updated') -Test {
        $running = Wait-LpmVersion -Seconds 60
        $after = @(Get-AppPids)
        $fresh = @($after | Where-Object { $State.AppBefore -notcontains $_ })
        $listed = (Find-Install).Version
        @{
            Pass   = ($running -eq $State.NewVersion -and $listed -eq $State.NewVersion -and $fresh.Count -ge 1)
            Detail = "running $running, installed apps list $listed, lpm pids before $($State.AppBefore -join ',') after $($after -join ',')"
        }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name 'the service kept running through the update' -SkipReason (Get-Skip 'Updated') -Test {
        $project = Get-E2eProject
        $alive = Test-SmokeProcessAlive $State.ServicePid
        @{
            Pass   = ($alive -and $project -and $project.running -and $project.servicesRunning -ge 1)
            Detail = "pid $($State.ServicePid) alive: $alive; lpm list: $(ConvertTo-Json -InputObject $project -Compress)"
        }
    }

    $null = Invoke-SmokeCheck -Results $Results -Name 'the downloaded installer is in the temp folder' -Optional -SkipReason (Get-Skip 'Updated') -Test {
        $found = @(Get-ChildItem -LiteralPath ([System.IO.Path]::GetTempPath()) -Filter 'lpm-update-*-setup.exe' -ErrorAction SilentlyContinue)
        @{ Pass = ($found.Count -ge 1); Detail = ($found.Name -join ', ') }
    }
} catch {
    Add-SmokeResult -Results $Results -Name 'update e2e harness' -Status FAIL -Detail "$($_.Exception.Message) $($_.ScriptStackTrace)"
} finally {
    Copy-Item -LiteralPath (Join-Path $Cfg.DataDir 'logs') -Destination (Join-Path $ArtifactsDir 'lpm-logs') -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-Cleanup
}

$summary = Get-SmokeSummary -Results $Results.ToArray()
ConvertTo-Json -InputObject $Results.ToArray() -Depth 4 | Set-Content -LiteralPath (Join-Path $ArtifactsDir 'results.json')
if ($summary.ExitCode -ne 0) {
    Get-ChildItem -LiteralPath $ArtifactsDir -Filter '*.log' -ErrorAction SilentlyContinue | ForEach-Object { Show-SmokeLog -Path $_.FullName }
    Get-ChildItem -LiteralPath (Join-Path $ArtifactsDir 'lpm-logs') -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { Show-SmokeLog -Path $_.FullName }
}
Write-Host ''
foreach ($result in $Results) { Write-Host "$($result.Status) $($result.Name)" }
Write-Host $summary.Line
exit $summary.ExitCode
