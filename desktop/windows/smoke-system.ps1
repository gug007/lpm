# Process, network and Win32 helpers for smoke.ps1. smoke-selftest.ps1 tests
# the parts that run on any OS.

# --- waiting, processes, network ---------------------------------------------

function Wait-SmokeCondition {
    param([Parameter(Mandatory)][scriptblock]$Until, [double]$TimeoutSec = 30, [int]$IntervalMs = 500)
    $giveUpAt = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    while ($true) {
        $met = $false
        try { $met = [bool](& $Until) } catch { $met = $false }
        if ($met) { return $true }
        if ([DateTime]::UtcNow -ge $giveUpAt) { return $false }
        Start-Sleep -Milliseconds $IntervalMs
    }
}

# Every pid at or under the roots, from rows carrying ProcessId and
# ParentProcessId (Win32_Process).
function Get-SmokeDescendants {
    param([AllowEmptyCollection()][object[]]$Table, [int[]]$Roots)
    $children = @{}
    foreach ($row in @($Table)) {
        $parent = [int]$row.ParentProcessId
        if (-not $children.ContainsKey($parent)) {
            $children[$parent] = [System.Collections.Generic.List[int]]::new()
        }
        $children[$parent].Add([int]$row.ProcessId)
    }
    $seen = [System.Collections.Generic.HashSet[int]]::new()
    $queue = [System.Collections.Generic.Queue[int]]::new()
    foreach ($root in @($Roots)) {
        if ($root -gt 0 -and $seen.Add($root)) { $queue.Enqueue($root) }
    }
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        if (-not $children.ContainsKey($current)) { continue }
        foreach ($child in $children[$current]) {
            if ($seen.Add($child)) { $queue.Enqueue($child) }
        }
    }
    [int[]]@($seen | Sort-Object)
}

function Test-SmokeProcessAlive {
    param([int]$ProcessId)
    $ProcessId -gt 0 -and $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

# Snapshot the whole tree first: once a parent dies its children's parent pid
# names nothing, and they would drop out of a walk taken afterwards.
function Stop-SmokeProcessTree {
    param([int[]]$Roots)
    $wanted = @($Roots | Where-Object { $_ -gt 0 })
    if ($wanted.Count -eq 0) { return }
    $table = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId -ErrorAction SilentlyContinue)
    foreach ($id in @(Get-SmokeDescendants -Table $table -Roots $wanted)) {
        if ($id -ne $PID -and $id -gt 4) {
            Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
    }
}

# Like a native call, with the environment overridden for this child only
# ($null removes a variable) and a timeout that ends the whole tree.
function Invoke-SmokeNative {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [AllowNull()][string]$StdinText,
        [System.Collections.IDictionary]$Environment,
        [string]$WorkingDirectory,
        [int]$TimeoutSec = 60
    )
    $info = [System.Diagnostics.ProcessStartInfo]::new($FilePath)
    foreach ($argument in $ArgumentList) { $info.ArgumentList.Add($argument) }
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    if ($WorkingDirectory) { $info.WorkingDirectory = $WorkingDirectory }
    if ($Environment) {
        foreach ($key in $Environment.Keys) {
            if ($null -eq $Environment[$key]) { [void]$info.Environment.Remove($key) }
            else { $info.Environment[$key] = [string]$Environment[$key] }
        }
    }
    $process = [System.Diagnostics.Process]::Start($info)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if ($StdinText) { $process.StandardInput.Write($StdinText) }
        $process.StandardInput.Close()
        $exited = $process.WaitForExit($TimeoutSec * 1000)
        if (-not $exited) {
            $process.Kill($true)
            [void]$process.WaitForExit(5000)
        }
        $exitCode = if ($exited) { $process.ExitCode } else { -1 }
        $out = if ($stdout.Wait(5000)) { $stdout.Result } else { '' }
        $err = if ($stderr.Wait(5000)) { $stderr.Result } else { '' }
        [pscustomobject]@{ ExitCode = $exitCode; Stdout = $out; Stderr = $err; TimedOut = -not $exited }
    } finally {
        $process.Dispose()
    }
}

# Starts the app with its output in files. The environment is changed only
# around Start-Process (before 7.4 it takes none of its own) and put back.
# Our own std handles are kept from it: the app hands what it inherits on to
# the session daemon and the services, which outlive it, and a CI runner waits
# for the pipe behind this step's output to close.
function Start-SmokeApp {
    param(
        [Parameter(Mandatory)][string]$App,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Environment,
        [Parameter(Mandatory)][string]$LogBase,
        [string[]]$ArgumentList
    )
    $saved = @{}
    foreach ($key in $Environment.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key)
        [Environment]::SetEnvironmentVariable($key, $Environment[$key])
    }
    $inherited = $null
    if ($IsWindows) {
        Initialize-SmokeNative
        $inherited = [LpmSmoke.Native]::StopStdInheritance()
    }
    try {
        $start = @{
            FilePath               = $App
            PassThru               = $true
            NoNewWindow            = $true
            RedirectStandardOutput = "$LogBase.out.log"
            RedirectStandardError  = "$LogBase.err.log"
        }
        if ($ArgumentList) { $start.ArgumentList = $ArgumentList }
        $process = Start-Process @start
        # ExitCode stays empty for a process whose handle was never opened.
        $null = $process.Handle
        $process
    } finally {
        if ($inherited) { [LpmSmoke.Native]::RestoreStdInheritance($inherited) }
        foreach ($key in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($key, $saved[$key])
        }
    }
}

function Get-SmokeHttpStatus {
    param([Parameter(Mandatory)][string]$Url, [int]$TimeoutSec = 3)
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -NoProxy -SkipHttpErrorCheck -ErrorAction Stop
        [int]$response.StatusCode
    } catch {
        0
    }
}

function Get-SmokeFreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { $listener.LocalEndpoint.Port } finally { $listener.Stop() }
}

function Get-SmokePortOwner {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) { [int]$connection.OwningProcess } else { 0 }
}

function Show-SmokeLog {
    param([string]$Path, [int]$Tail = 200)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Write-Host "----- $Path (last $Tail lines) -----"
    Get-Content -LiteralPath $Path -Tail $Tail -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
}

# --- Win32: windows, input, screen (SmokeNative.cs) ---------------------------

$script:SmokeNativePath = Join-Path $PSScriptRoot 'SmokeNative.cs'

function Initialize-SmokeNative {
    if ('LpmSmoke.Native' -as [type]) { return }
    Add-Type -Path $script:SmokeNativePath -IgnoreWarnings
}

# Best effort: a runner without an interactive desktop has no screen to copy.
function Save-SmokeScreenshot {
    param([Parameter(Mandatory)][string]$Path)
    if (-not $IsWindows) { return }
    $bitmap = $null
    $graphics = $null
    try {
        Initialize-SmokeNative
        Add-Type -AssemblyName System.Drawing
        $screen = [LpmSmoke.Native]::VirtualScreen()
        $bitmap = [System.Drawing.Bitmap]::new($screen[2], $screen[3])
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen[0], $screen[1], 0, 0, $bitmap.Size)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Host "screenshot $Path ($($screen[2])x$($screen[3]))"
    } catch {
        Write-Host "note: no screenshot ${Path}: $($_.Exception.Message)"
    } finally {
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
    }
}
