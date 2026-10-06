# Checks of smoke.ps1 that need the real desktop: keystrokes sent with
# SendInput, and the single-instance hand-off seen through the main window.
# They read $Cfg, $State and $Results from smoke.ps1.

function Get-SidebarWidth {
    Invoke-Page -Js 'const a = document.querySelector("aside"); return a ? Math.round(a.getBoundingClientRect().width) : -1' -Seconds 10
}

function Confirm-Foreground {
    if ([LpmSmoke.Native]::IsForeground($State.Hwnd)) { return }
    if (-not [LpmSmoke.Native]::BringToFront($State.Hwnd)) { throw 'lpm lost the foreground' }
}

function Send-Chord {
    param([uint16[]]$Modifiers, [uint16]$Key)
    Confirm-Foreground
    [LpmSmoke.Native]::Chord($Modifiers, $Key)
}

function Test-SidebarChord {
    $control = [LpmSmoke.Native]::Control
    $shift = [LpmSmoke.Native]::Shift
    $before = Get-SidebarWidth
    Send-Chord -Modifiers $control, $shift -Key ([uint16][char]'B')
    $toggled = Wait-SmokeCondition -TimeoutSec 5 -Until {
        $State.SidebarAfter = Get-SidebarWidth
        $State.SidebarAfter -ne $before
    }
    $restored = $false
    if ($toggled) {
        Send-Chord -Modifiers $control, $shift -Key ([uint16][char]'B')
        $restored = Wait-SmokeCondition -TimeoutSec 5 -Until { (Get-SidebarWidth) -eq $before }
    }
    @{ Pass = $toggled; Detail = "aside width $before -> $($State.SidebarAfter), toggled back=$restored" }
}

function Test-TypedInterrupt {
    $control = [LpmSmoke.Native]::Control
    $shift = [LpmSmoke.Native]::Shift
    $late = Join-Path $Cfg.Project 'kblate.out'
    $intr = Join-Path $Cfg.Project 'kbintr.out'
    $row = ConvertTo-Json -InputObject ('button[data-project-row="' + $State.Name + '"]') -Compress
    if (-not (Invoke-Page -Js "const row = document.querySelector($row); if (row) row.click(); return !!row;")) {
        throw "no sidebar row for project $($State.Name)"
    }
    Start-Sleep -Milliseconds 800
    $countJs = 'return document.querySelectorAll(".xterm").length'
    $terminals = [int](Invoke-Page -Js $countJs)
    Send-Chord -Modifiers $control, $shift -Key ([uint16][char]'T')
    if (-not (Wait-SmokeCondition -TimeoutSec 10 -Until { [int](Invoke-Page -Js $countJs -Seconds 5) -gt $terminals })) {
        throw 'Ctrl+Shift+T opened no terminal'
    }
    $focusJs = 'const areas = [...document.querySelectorAll(".xterm-helper-textarea")].filter(t => { const x = t.closest(".xterm"); if (!x) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const t = areas[areas.length - 1]; if (!t) return false; t.focus(); return document.activeElement === t;'
    if (-not (Invoke-Page -Js $focusJs)) { throw 'no visible terminal took the focus' }
    Start-Sleep -Seconds 3
    Confirm-Foreground
    [LpmSmoke.Native]::TypeText('sleep 30; echo late > kblate.out')
    Send-Chord -Modifiers @() -Key ([LpmSmoke.Native]::Enter)
    Start-Sleep -Seconds 2
    Send-Chord -Modifiers $control -Key ([uint16][char]'C')
    Start-Sleep -Milliseconds 1500
    Confirm-Foreground
    [LpmSmoke.Native]::TypeText('echo intr > kbintr.out')
    Send-Chord -Modifiers @() -Key ([LpmSmoke.Native]::Enter)
    $interrupted = Wait-SmokeCondition -TimeoutSec 15 -Until { Test-Path -LiteralPath $intr }
    Start-Sleep -Seconds 1
    $ranOn = Test-Path -LiteralPath $late
    @{ Pass = ($interrupted -and -not $ranOn); Detail = "kbintr.out=$interrupted kblate.out=$ranOn" }
}

# Optional unless -RequireKeyboard: a runner's desktop may not let a window
# take the foreground, which says nothing about the app.
function Invoke-KeyboardChecks {
    param([Parameter(Mandatory)][System.Diagnostics.Process]$AppProcess)
    $names = @(
        'Ctrl+Shift+B toggles the sidebar (real keystrokes)'
        'Ctrl+C typed into a terminal interrupts its job (real keystrokes)'
    )
    $reason = ''
    if ($SkipKeyboard) { $reason = 'skipped by -SkipKeyboard' }
    if (-not $reason) {
        Initialize-SmokeNative
        $State.Hwnd = [LpmSmoke.Native]::FindTopWindow($AppProcess.Id, 'lpm')
        if ($State.Hwnd -eq [IntPtr]::Zero) { $reason = 'no top-level window titled lpm' }
    }
    if (-not $reason) {
        try { $null = Invoke-LessonRequest -SocketPath $State.Lesson -Op 'window' -Fields @{ focus = $true } -TimeoutSec 10 } catch { }
        if (-not [LpmSmoke.Native]::BringToFront($State.Hwnd)) {
            $reason = 'the window could not take the foreground (no interactive desktop?)'
        }
    }
    if ($reason -and $RequireKeyboard -and -not $SkipKeyboard) {
        foreach ($name in $names) { Add-SmokeResult -Results $Results -Name $name -Status FAIL -Detail $reason }
        return
    }
    $optional = -not $RequireKeyboard
    $null = Invoke-SmokeCheck -Results $Results -Name $names[0] -SkipReason $reason -Optional:$optional -Test { Test-SidebarChord }
    $null = Invoke-SmokeCheck -Results $Results -Name $names[1] -SkipReason $reason -Optional:$optional -Test { Test-TypedInterrupt }
    Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts '03-keyboard.png')
}

# The hand-off is skipped for a separate data directory by design, so these
# run on the default one (~\.lpm) and must not meet an lpm the user runs.
function Get-SingleInstanceSkip {
    if ($SkipSingleInstance) { return 'skipped by -SkipSingleInstance' }
    $others = @(Get-Process -Name 'lpm-desktop', 'lpm' -ErrorAction SilentlyContinue | Where-Object { $_.Path -ne $Cfg.App })
    if ($others.Count -gt 0) { return "another lpm is running (pid $($others[0].Id)) and would take the hand-off" }
    if ((Test-Path -LiteralPath $Cfg.RealHomeDir) -and -not ($UseRealHome -or $env:GITHUB_ACTIONS -eq 'true')) {
        return "$($Cfg.RealHomeDir) exists; pass -UseRealHome to let these checks use it"
    }
    ''
}

function Invoke-SingleInstancePhase {
    $hide = 'closing the window hides it and the app keeps running'
    $handoff = 'a second launch exits 0 and shows the first window again'
    $reason = Get-SingleInstanceSkip
    if ($reason) {
        foreach ($name in $hide, $handoff) { Add-SmokeResult -Results $Results -Name $name -Status SKIP -Detail $reason }
        return
    }
    $createdHome = -not (Test-Path -LiteralPath $Cfg.RealHomeDir)
    $State.Lesson = $Cfg.LessonB
    $first = Start-App -Label 'single' -Environment ([ordered]@{
            LPM_DIR                   = $null
            LPM_LESSON_SOCKET         = $Cfg.LessonB
            WEBVIEW2_USER_DATA_FOLDER = $Cfg.WebViewB
        })
    try {
        $bootError = Wait-AppReady -Process $first -Socket $Cfg.LessonB -Seconds $BootTimeoutSec
        Initialize-SmokeNative
        $State.Hidden = Invoke-SmokeCheck -Results $Results -Name $hide -Test {
            if ($bootError) { throw $bootError }
            $found = Wait-SmokeCondition -TimeoutSec 30 -Until {
                $State.HwndB = [LpmSmoke.Native]::FindTopWindow($first.Id, 'lpm')
                $State.HwndB -ne [IntPtr]::Zero -and [LpmSmoke.Native]::Visible($State.HwndB)
            }
            if (-not $found) { throw 'no visible top-level window titled lpm' }
            [LpmSmoke.Native]::Close($State.HwndB)
            $hidden = Wait-SmokeCondition -TimeoutSec 10 -Until { -not [LpmSmoke.Native]::Visible($State.HwndB) }
            Start-Sleep -Seconds 1
            Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts '04-closed.png')
            @{ Pass = ($hidden -and -not $first.HasExited); Detail = "hidden=$hidden still running=$(-not $first.HasExited)" }
        }
        # Its own lesson socket keeps it off the first one's, and keeps the
        # startup chores off this machine's agent setup should it not hand off.
        $null = Invoke-SmokeCheck -Results $Results -Name $handoff -SkipReason (Get-Skip 'Hidden') -Test {
            $second = Start-App -Label 'second' -Environment ([ordered]@{
                    LPM_DIR                   = $null
                    LPM_LESSON_SOCKET         = $Cfg.LessonC
                    WEBVIEW2_USER_DATA_FOLDER = $Cfg.WebViewB
                })
            $exited = $second.WaitForExit(60000)
            $code = if ($exited) { $second.ExitCode } else { 'still running' }
            $shown = Wait-SmokeCondition -TimeoutSec 15 -Until { [LpmSmoke.Native]::Visible($State.HwndB) }
            Save-SmokeScreenshot -Path (Join-Path $Cfg.Artifacts '05-shown-again.png')
            @{
                Pass   = ($exited -and $code -eq 0 -and $shown -and -not $first.HasExited)
                Detail = "second launch exit=$code, first window visible=$shown, first still running=$(-not $first.HasExited)"
            }
        }
    } finally {
        if (-not $first.HasExited) {
            try { $null = Invoke-LessonRequest -SocketPath $Cfg.LessonB -Op 'quit' -TimeoutSec 10 } catch { }
            if (-not $first.WaitForExit(30000)) { Stop-SmokeProcessTree -Roots $first.Id }
        }
        if ($createdHome) { Remove-Item -LiteralPath $Cfg.RealHomeDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
