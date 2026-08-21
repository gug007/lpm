#!/bin/sh
# Functional test for hostctl.sh — the supervisor that runs lpm on a machine with
# no service manager. Everything else on a host is covered by the Rust tests;
# this is a shell script standing in for systemd, so it gets its own.
#
#     sh desktop/linux/tests/hostctl-test.sh
#
# The real stack is Xvfb + matchbox + lpm-desktop. None of those exist on the Mac
# this is usually written on, and none of them are what is being tested: the
# subject is the supervisor's own logic — detaching, pid file identity,
# restart-on-failure, and stopping its three processes without touching the ones
# that deliberately escaped it. So each is replaced with a script that does
# exactly the observable part, and the test runs anywhere.
set -u

HOSTCTL=${HOSTCTL:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/hostctl.sh}
[ -f "$HOSTCTL" ] || { echo "no hostctl.sh at $HOSTCTL" >&2; exit 1; }
ROOT=$(mktemp -d)
BIN=$ROOT/bin
STATE=$ROOT/state
mkdir -p "$BIN" "$STATE" "$ROOT/home" "$ROOT/run" "$ROOT/x11"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (want '$3', got '$2')"; fi; }

# ---- fakes -----------------------------------------------------------------
# Xvfb: creates the socket the display probe looks for, then blocks.
cat > "$BIN/Xvfb" <<EOF
#!/bin/sh
echo "\$\$" > "$STATE/xvfb.pid"
touch "$STATE/x11-unix/X\${1#:}" 2>/dev/null || true
trap 'rm -f "$STATE/x11-unix/X\${1#:}"; exit 0' TERM INT
while :; do sleep 0.2; done
EOF

cat > "$BIN/xdpyinfo" <<EOF
#!/bin/sh
# usage: xdpyinfo -display :N
[ -e "$STATE/x11-unix/X\${2#:}" ]
EOF

cat > "$BIN/matchbox-window-manager" <<EOF
#!/bin/sh
echo "\$\$" > "$STATE/wm.pid"
trap 'exit 0' TERM INT
while :; do sleep 0.2; done
EOF

# The app: records the environment it was handed, spawns an untracked child that
# stands in for the session daemon, then behaves as $STATE/app-mode says.
cat > "$BIN/lpm-desktop" <<EOF
#!/bin/sh
echo "\$\$" >> "$STATE/app.pids"
{ echo "HOME=\$HOME"; echo "DISPLAY=\$DISPLAY"; echo "SHELL=\${SHELL:-}";
  echo "PWD=\$PWD"; echo "DMABUF=\${WEBKIT_DISABLE_DMABUF_RENDERER:-}";
  echo "A11Y=\${NO_AT_BRIDGE:-}"; echo "MARK=\${LPM_TEST_MARK:-}"; } > "$STATE/app.env"
if [ ! -f "$STATE/escapee.pid" ]; then
    # Stands in for the session daemon: started by the app, not tracked by the
    # supervisor, and expected to outlive the stop.
    sh -c 'echo \$\$ > "'"$STATE"'/escapee.pid"; while :; do sleep 0.2; done' &
fi
mode=\$(cat "$STATE/app-mode" 2>/dev/null || echo stay)
case "\$mode" in
    stay) trap 'exit 143' TERM INT; while :; do sleep 0.2; done ;;
    crash) sleep 0.2; exit 7 ;;
    clean) sleep 0.2; exit 0 ;;
esac
EOF

chmod +x "$BIN"/*
mkdir -p "$STATE/x11-unix"

# ---- harness ---------------------------------------------------------------
PATH="$BIN:$PATH"
export PATH
printf 'SHELL=/bin/from-env-file\nLPM_TEST_MARK=env-file\n' > "$ROOT/host.env"

ctl() {
    LPM_PREFIX="$BIN" LPM_HOME="$ROOT/home" LPM_APP="$BIN/lpm-desktop" \
        LPM_RUN_DIR="$ROOT/run" LPM_LOG_DIR="$ROOT/logs" \
        LPM_ENV_FILE="$ROOT/host.env" LPM_DISPLAY=77 LPM_RESTART_SEC=1 \
        LPM_STOP_WAIT=5 LPM_XVFB=Xvfb LPM_WM=matchbox-window-manager \
        sh "$HOSTCTL" "$@"
}
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
pidof_file() { cat "$1" 2>/dev/null; }
# The fake Xvfb writes its socket under $STATE, so point the probe there too.
STATE_X=$STATE/x11-unix

# The app rewrites app.env on every start, so which display it was handed is
# waited for rather than read once.
on_display() { wait_for 'grep -qx "DISPLAY=:'"$1"'" "'"$STATE"'/app.env" 2>/dev/null' 10; }

wait_for() { # predicate-command, seconds
    i=0
    while [ "$i" -lt $((${2} * 10)) ]; do
        eval "$1" && return 0
        sleep 0.1
        i=$((i + 1))
    done
    return 1
}

echo "== start =="
ctl start > "$ROOT/out" 2>&1
grep -q "is starting here" "$ROOT/out" && ok "start reports the pid" || no "start output: $(cat "$ROOT/out")"
wait_for '[ -s "$ROOT/run/host.pid" ]' 5 && ok "pid file written" || no "no pid file"
SUP=$(sed -n 1p "$ROOT/run/host.pid")
alive "$SUP" && ok "supervisor is alive" || no "supervisor died"
wait_for '[ -s "$STATE/app.pids" ]' 10 && ok "app started" || no "app never started"
APP=$(sed -n 1p "$STATE/app.pids")
XVFB=$(pidof_file "$STATE/xvfb.pid")
WM=$(pidof_file "$STATE/wm.pid")
alive "$XVFB" && ok "display is up" || no "no display"
alive "$WM" && ok "window manager is up" || no "no window manager"

echo "== environment handed to the app =="
val() { sed -n "s/^$1=//p" "$STATE/app.env"; }
check "HOME is the service home" "$(val HOME)" "$ROOT/home"
check "DISPLAY follows LPM_DISPLAY" "$(val DISPLAY)" ":77"
check "host.env is exported, not just sourced" "$(val SHELL)" "/bin/from-env-file"
check "extra host.env keys reach the app" "$(val MARK)" "env-file"
check "working directory is the service home" "$(val PWD)" "$ROOT/home"
check "dmabuf renderer is off" "$(val DMABUF)" "1"
check "a11y bridge is off" "$(val A11Y)" "1"

echo "== status / double start =="
ctl status > "$ROOT/out" 2>&1
check "status exit code while running" "$?" "0"
grep -q "is running here" "$ROOT/out" && ok "status says running" || no "status: $(cat "$ROOT/out")"
ctl start > "$ROOT/out" 2>&1
grep -q "already running" "$ROOT/out" && ok "second start is a no-op" || no "start twice: $(cat "$ROOT/out")"
check "still one supervisor" "$(sed -n 1p "$ROOT/run/host.pid")" "$SUP"

echo "== restart on failure =="
echo crash > "$STATE/app-mode"
kill -TERM "$APP" 2>/dev/null
wait_for '[ "$(wc -l < "$STATE/app.pids" | tr -d " ")" -ge 3 ]' 20 &&
    ok "a crashing app is restarted, repeatedly" || no "no restart loop ($(wc -l < "$STATE/app.pids") starts)"
alive "$SUP" && ok "supervisor survives the crash loop" || no "supervisor died with the app"

echo "== stop =="
echo stay > "$STATE/app-mode"
wait_for '[ -s "$STATE/app.pids" ] && kill -0 $(tail -n 1 "$STATE/app.pids") 2>/dev/null' 10
APP=$(tail -n 1 "$STATE/app.pids")
XVFB=$(pidof_file "$STATE/xvfb.pid")
WM=$(pidof_file "$STATE/wm.pid")
ESCAPEE=$(pidof_file "$STATE/escapee.pid")
ctl stop > "$ROOT/out" 2>&1
grep -q "stopped here" "$ROOT/out" && ok "stop reports it stopped" || no "stop: $(cat "$ROOT/out")"
alive "$SUP" && no "supervisor still alive after stop" || ok "supervisor is gone"
alive "$APP" && no "app still alive after stop" || ok "app is gone"
alive "$XVFB" && no "display still alive after stop" || ok "display is gone"
alive "$WM" && no "window manager still alive after stop" || ok "window manager is gone"
alive "$ESCAPEE" && ok "a process the app detached survives (session daemon, agents)" ||
    no "stop killed a detached process it does not own"
[ -f "$ROOT/run/host.pid" ] && no "pid file left behind" || ok "pid file removed"
ctl status > "$ROOT/out" 2>&1
check "status exit code while stopped" "$?" "3"
ctl stop > "$ROOT/out" 2>&1
grep -q "not running" "$ROOT/out" && ok "stopping twice is safe" || no "second stop: $(cat "$ROOT/out")"
kill -KILL "$ESCAPEE" 2>/dev/null

echo "== clean exit is not restarted =="
echo clean > "$STATE/app-mode"
: > "$STATE/app.pids"
ctl start > /dev/null 2>&1
SUP=$(sed -n 1p "$ROOT/run/host.pid" 2>/dev/null)
wait_for '! kill -0 '"$SUP"' 2>/dev/null' 10 && ok "supervisor exits when the app exits 0" ||
    no "supervisor kept restarting a clean exit"
[ -f "$ROOT/run/host.pid" ] && no "pid file left behind after a clean exit" || ok "pid file removed on clean exit"
check "exactly one app start" "$(wc -l < "$STATE/app.pids" | tr -d ' ')" "1"

echo "== a pid file naming somebody else =="
echo stay > "$STATE/app-mode"
sh -c 'trap "" TERM; while :; do sleep 5; done' &
STRANGER=$!
printf '%s\n%s\n' "$STRANGER" "/bin/sh $HOSTCTL supervise" > "$ROOT/run/host.pid"
ctl status > "$ROOT/out" 2>&1
grep -q "not running" "$ROOT/out" && ok "a pid whose command line differs is not ours" ||
    no "status trusted a stale pid file: $(cat "$ROOT/out")"
ctl stop > "$ROOT/out" 2>&1
alive "$STRANGER" && ok "stop leaves a stranger alone" || no "stop killed an unrelated process"
kill -KILL "$STRANGER" 2>/dev/null

echo "== the display belongs to something else =="
# An image that runs its own X server on the configured display. Refusing to
# start there is what left a host un-updatable from the Mac: the installer runs
# `restart` on every upgrade, and its advice — set LPM_DISPLAY — is not something
# the Mac can carry out.
echo stay > "$STATE/app-mode"
: > "$STATE/app.pids"
rm -f "$STATE/app.env"
touch "$STATE/x11-unix/X77"
ctl start > "$ROOT/out" 2>&1
check "start succeeds anyway" "$?" "0"
wait_for '[ -s "$STATE/app.pids" ]' 10 && ok "the app still comes up" || no "start said: $(cat "$ROOT/out")"
on_display 78 && ok "on the first free display" || no "app DISPLAY=$(val DISPLAY)"
grep -q "belongs to something else — using :78" "$ROOT/logs/host.log" &&
    ok "and the move is in the log, not silent" ||
    no "log: $(tail -n 5 "$ROOT/logs/host.log" 2>/dev/null)"
ctl status > "$ROOT/out" 2>&1
grep -q "display :78" "$ROOT/out" && ok "status names the display it settled on" ||
    no "status: $(cat "$ROOT/out")"
ctl stop > /dev/null 2>&1
[ -e "$STATE/x11-unix/X77" ] && ok "the other server is left alone" || no "stop took down :77"
rm -f "$STATE/x11-unix/X77"

echo "== an lpm nothing is supervising =="
# The supervisor killed outright, which is how a container ends up with the app,
# the window manager and the display running and nothing on the machine naming
# them. Every start then found :77 taken and gave up.
echo stay > "$STATE/app-mode"
: > "$STATE/app.pids"
ctl start > /dev/null 2>&1
wait_for '[ -s "$STATE/app.pids" ]' 10
SUP=$(sed -n 1p "$ROOT/run/host.pid")
ORPHAN=$(tail -n 1 "$STATE/app.pids")
OXVFB=$(pidof_file "$STATE/xvfb.pid")
kill -KILL "$SUP" 2>/dev/null
rm -f "$STATE/app.env"
ctl start > "$ROOT/out" 2>&1
check "start exit code with an orphaned stack" "$?" "0"
wait_for '! kill -0 '"$ORPHAN"' 2>/dev/null' 15 && ok "the unsupervised app is stopped" ||
    no "a second app was started alongside the first"
alive "$OXVFB" && no "its display is still up" || ok "and its display with it"
wait_for '[ "$(wc -l < "$STATE/app.pids" | tr -d " ")" -ge 2 ]' 10 &&
    ok "a supervised app takes its place" || no "nothing came back: $(cat "$ROOT/out")"
on_display 77 && ok "on the display it was configured for" || no "app DISPLAY=$(val DISPLAY)"
grep -q "unsupervised" "$ROOT/logs/host.log" && ok "the log says what it found" ||
    no "log: $(tail -n 5 "$ROOT/logs/host.log" 2>/dev/null)"
ctl stop > /dev/null 2>&1

echo "== stop reaches one too =="
: > "$STATE/app.pids"
ctl start > /dev/null 2>&1
wait_for '[ -s "$STATE/app.pids" ]' 10
SUP=$(sed -n 1p "$ROOT/run/host.pid")
ORPHAN=$(tail -n 1 "$STATE/app.pids")
kill -KILL "$SUP" 2>/dev/null
ctl stop > "$ROOT/out" 2>&1
grep -q "unsupervised" "$ROOT/out" && ok "stop says what it actually found" ||
    no "stop: $(cat "$ROOT/out")"
wait_for '! kill -0 '"$ORPHAN"' 2>/dev/null' 15 && ok "and stops it" ||
    no "stop reported an lpm it did not stop"
ctl stop > "$ROOT/out" 2>&1
grep -q "not running" "$ROOT/out" && ok "with nothing left, it says so" || no "stop: $(cat "$ROOT/out")"

echo "== a missing app binary =="
LPM_PREFIX="$BIN" LPM_HOME="$ROOT/home" LPM_APP="$BIN/not-installed" \
    LPM_RUN_DIR="$ROOT/run" LPM_LOG_DIR="$ROOT/logs" sh "$HOSTCTL" start > "$ROOT/out" 2>&1
check "start fails when the app is not installed" "$?" "1"
grep -q "not there" "$ROOT/out" && ok "and says which file is missing" || no "out: $(cat "$ROOT/out")"

echo "== restart (what the installer runs on every upgrade) =="
echo stay > "$STATE/app-mode"
: > "$STATE/app.pids"
ctl start > /dev/null 2>&1
wait_for '[ -s "$STATE/app.pids" ]' 10
SUP1=$(sed -n 1p "$ROOT/run/host.pid")
APP1=$(tail -n 1 "$STATE/app.pids")
ctl restart > "$ROOT/out" 2>&1
check "restart exit code" "$?" "0"
wait_for '[ "$(wc -l < "$STATE/app.pids" | tr -d " ")" -ge 2 ]' 10 &&
    ok "restart starts the app again" || no "app never came back: $(cat "$ROOT/out")"
SUP2=$(sed -n 1p "$ROOT/run/host.pid")
[ "$SUP2" != "$SUP1" ] && ok "restart replaces the supervisor" || no "same supervisor after restart"
alive "$SUP1" && no "the old supervisor is still running" || ok "the old supervisor is gone"
alive "$APP1" && no "the old app is still running" || ok "the old app is gone"
ctl restart > "$ROOT/out" 2>&1
check "restart from stopped is also fine" "$?" "0"
ctl stop > /dev/null 2>&1

echo "== host.env configures the supervisor itself =="
# The file is read before the settings are worked out, so it can move the pid
# file — and every later command has to agree about where that is. Read it only
# inside the supervisor and `stop` would look in one place while `start` wrote to
# another, on a host where nobody can see either.
printf 'LPM_RUN_DIR=%s\n' "$ROOT/run2" >> "$ROOT/host.env"
echo stay > "$STATE/app-mode"
ctl start > "$ROOT/out" 2>&1
check "start exit code with a relocated pid file" "$?" "0"
[ -s "$ROOT/run2/host.pid" ] && ok "host.env wins over the caller's environment" ||
    no "pid file is not where host.env put it"
[ -f "$ROOT/run/host.pid" ] && no "a second pid file was left in the old place" || ok "and only there"
ctl status > /dev/null 2>&1
check "status agrees where to look" "$?" "0"
ctl stop > "$ROOT/out" 2>&1
grep -q "stopped here" "$ROOT/out" && ok "stop agrees too" || no "stop: $(cat "$ROOT/out")"
sed -i.bak '/LPM_RUN_DIR/d' "$ROOT/host.env"

echo "== usage =="
ctl > "$ROOT/out" 2>&1
check "no command is a usage error" "$?" "2"
ctl bogus > "$ROOT/out" 2>&1
check "an unknown command is a usage error" "$?" "2"

pkill -P $$ >/dev/null 2>&1
rm -rf "$ROOT"
echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
