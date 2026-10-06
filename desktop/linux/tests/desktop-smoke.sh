#!/usr/bin/env bash
# Runtime smoke test for the Linux desktop app. Launches a debug lpm-desktop on
# its own Xvfb display with a window manager and a session bus, drives it with
# real X input (xdotool) and through the lesson control socket, and prints one
# PASS/FAIL line per check. Exits 1 when any check fails.
#
#     bash desktop/linux/tests/desktop-smoke.sh [--app PATH] [--dist DIR] [--artifacts DIR]
#
#   --app        debug lpm-desktop; the lesson socket only exists in debug builds
#                (default: desktop/frontend/src-tauri/target/debug/lpm-desktop)
#   --dist       frontend dist to serve on 127.0.0.1:9245, for a build that loads
#                the dev server (a plain `cargo build`); `npx tauri build --debug`
#                embeds the frontend and needs none
#   --artifacts  screenshots and logs (default: a new directory under /tmp)
#
# Needs Xvfb, matchbox-window-manager, xdotool, wmctrl, xclip, xwininfo
# (x11-utils), import (imagemagick), dbus-run-session, python3, curl and git.
# Uses ports 9811 (the test project's service) and, with --dist, 9245.
# Checks are strings run by eval, expanded when they run.
# shellcheck disable=SC2016,SC2034,SC2329
set -u

HERE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
APP=$HERE/../../frontend/src-tauri/target/debug/lpm-desktop
DIST=
ART=
while [ $# -gt 0 ]; do
    case $1 in
        --app) APP=$2; shift 2 ;;
        --dist) DIST=$2; shift 2 ;;
        --artifacts) ART=$2; shift 2 ;;
        -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

SERVICE_PORT=9811
DEV_PORT=9245
WORK=
DISPLAY=
XVFB='' WM='' HTTP='' XCLIP='' SESSION='' MAIN=''
pass=0
fail=0
n=0

die() { echo "ERROR: $*" >&2; exit 1; }

# L '<js>' runs an async function body in the page and prints the raw reply
# line; L ping x sends a bare op. V prints just the returned value.
L() {
    if [ $# -ge 2 ]; then python3 "$WORK/lc.py" "$SOCK" "$1"; else python3 "$WORK/lc.py" "$SOCK" eval "$1"; fi
}
V() { LC_VALUE=1 python3 "$WORK/lc.py" "$SOCK" eval "$1"; }
X() { xdotool "$@"; }
shot() { import -window root "$ART/$1.png" >/dev/null 2>&1 || true; }

check() {
    n=$((n + 1))
    if eval "$2"; then
        echo "PASS $1"
        pass=$((pass + 1))
    else
        echo "FAIL $1"
        fail=$((fail + 1))
        shot "fail-$(printf %02d "$n")"
    fi
}

# Polls a condition for up to $1 seconds; the check after it decides.
wait_for() {
    local deadline=$(($(date +%s) + $1))
    until eval "$2"; do
        [ "$(date +%s)" -lt "$deadline" ] || return 1
        sleep 0.5
    done
}

port_free() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/"; [ $? = 7 ]; }
serves() { [ "$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' "http://127.0.0.1:$SERVICE_PORT/")" = 200 ]; }
window_state() { xwininfo -name lpm 2>/dev/null | grep -q "$1"; }
xterms() { V 'return document.querySelectorAll(".xterm").length' 2>/dev/null || echo 0; }

app_env() {
    env -i HOME="$H" USER="$ME" LOGNAME="$ME" PATH=/usr/local/bin:/usr/bin:/bin \
        DISPLAY="$DISPLAY" XDG_RUNTIME_DIR="$XDG" \
        WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
        LIBGL_ALWAYS_SOFTWARE=1 NO_AT_BRIDGE=1 "$@"
}

# The running app instances of this test: the binary under test with no
# arguments (the session daemon is the same binary with one) and this HOME.
app_pids() {
    local pid
    for pid in $(pgrep -x lpm-desktop); do
        [ "$(tr '\0' ' ' 2>/dev/null < "/proc/$pid/cmdline")" = "$APP " ] || continue
        tr '\0' '\n' 2>/dev/null < "/proc/$pid/environ" | grep -qxF "HOME=$H" && echo "$pid"
    done
}

# $1 names the log. Sets MAIN once the page has rendered.
launch() {
    app_env SHELL=/bin/bash LANG=C.UTF-8 LPM_LESSON_SOCKET="$SOCK" \
        dbus-run-session -- "$APP" >"$ART/app-$1.log" 2>&1 &
    SESSION=$!
    MAIN=
    local _
    for _ in $(seq 1 120); do
        kill -0 "$SESSION" 2>/dev/null || return 1
        if LC_TIMEOUT=5 L 'const r = document.getElementById("root"); return document.readyState === "complete" && !!r && r.childElementCount > 0' 2>/dev/null | grep -q '"value":"true"'; then
            MAIN=$(app_pids | head -1)
            sleep 4
            [ -n "$MAIN" ]
            return
        fi
        sleep 1
    done
    return 1
}

# Clicks the "demo" row in the sidebar, located in the page; (60, 89) is where it
# sits in a 1400x900 window should the lookup fail.
click_project() {
    local xy
    xy=$(V 'const el = [...document.querySelectorAll("aside *")].find(e => e.childElementCount === 0 && e.textContent.trim() === "demo"); if (!el) return ""; const r = el.getBoundingClientRect(); return Math.round(r.left + Math.min(r.width / 2, 40)) + " " + Math.round(r.top + r.height / 2)' 2>/dev/null)
    case $xy in
        *[0-9]" "[0-9]*) ;;
        *) xy="60 89" ;;
    esac
    # shellcheck disable=SC2086
    X mousemove --window "$(X search --name '^lpm$' | head -1)" $xy click 1
}

print_logs() {
    local f
    for f in "$ART"/app-*.log; do
        [ -f "$f" ] || continue
        [ "${GITHUB_ACTIONS:-}" = true ] && echo "::group::$(basename "$f")"
        echo "----- $f"
        cat "$f"
        [ "${GITHUB_ACTIONS:-}" = true ] && echo "::endgroup::"
    done
    return 0
}

# Everything the app started carries its HOME: the session daemon, services,
# terminal shells and the D-Bus-activated portals.
sweep() {
    local p pid
    for p in /proc/[0-9]*; do
        pid=${p#/proc/}
        [ "$pid" = "$$" ] && continue
        tr '\0' '\n' 2>/dev/null < "$p/environ" | grep -qxF "HOME=$H" && kill "-$1" "$pid" 2>/dev/null
    done
    return 0
}

cleanup() {
    local rc=$? pid
    trap - EXIT INT TERM
    if [ -n "$WORK" ]; then
        if [ -n "$MAIN" ] && kill -0 "$MAIN" 2>/dev/null; then
            LC_TIMEOUT=5 L quit x >/dev/null 2>&1
            wait_for 10 '! kill -0 "$MAIN" 2>/dev/null'
        fi
        app_env timeout 30 "$APP" --stop-sessions >"$ART/stop-sessions.log" 2>&1 \
            || echo "warning: --stop-sessions failed, see $ART/stop-sessions.log" >&2
        sweep TERM
        sleep 1
        sweep KILL
    fi
    for pid in $XCLIP $HTTP $WM $XVFB; do kill "$pid" 2>/dev/null; done
    if [ -n "$WORK" ]; then
        if mountpoint -q "$XDG/doc" 2>/dev/null; then
            fusermount3 -u "$XDG/doc" 2>/dev/null || fusermount -u "$XDG/doc" 2>/dev/null
        fi
        cd / && rm -rf "$WORK" 2>/dev/null || echo "warning: could not remove $WORK" >&2
    fi
    echo "artifacts: $ART"
    exit "$rc"
}

missing=
for tool in Xvfb matchbox-window-manager xdotool wmctrl xclip xwininfo import \
    dbus-run-session python3 curl git timeout pgrep; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
[ -z "$missing" ] || die "missing tools:$missing"
[ -x "$APP" ] || die "no executable app at $APP"
APP=$(cd -- "$(dirname -- "$APP")" && pwd)/$(basename -- "$APP")
if [ -n "$DIST" ]; then
    [ -f "$DIST/index.html" ] || die "no index.html in $DIST"
    DIST=$(cd -- "$DIST" && pwd)
fi
[ -n "$ART" ] || ART=$(mktemp -d /tmp/lpm-smoke-artifacts.XXXXXX)
mkdir -p "$ART" || die "cannot create $ART"
ART=$(cd -- "$ART" && pwd)
port_free "$SERVICE_PORT" || die "port $SERVICE_PORT is in use"
if [ -n "$DIST" ]; then port_free "$DEV_PORT" || die "port $DEV_PORT is in use"; fi

# Isolated by HOME alone, not LPM_DIR: with its own data directory the app skips
# the single-instance handoff and closing the window quits, and both are checked.
# The path is typed into a terminal and holds Unix sockets, so it stays short.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
WORK=$(mktemp -d /tmp/lpm-smoke.XXXXXX) || { WORK=; die "cannot create a work directory"; }
H=$WORK/home
XDG=$WORK/xdg
PROJ=$WORK/proj
SOCK=$H/lesson.sock
ME=${USER:-$(id -un)}
mkdir -p "$H" "$XDG" || die "cannot set up $WORK"
chmod 700 "$XDG"
cd "$WORK" || die "cannot enter $WORK"

cat > "$WORK/lc.py" <<'PY'
import json, os, socket, sys

path, op = sys.argv[1], sys.argv[2]
req = {"id": 1, "op": op}
if op == "eval":
    req["js"] = sys.argv[3]
s = socket.socket(socket.AF_UNIX)
s.settimeout(float(os.environ.get("LC_TIMEOUT", "30")))
s.connect(path)
s.sendall((json.dumps(req) + "\n").encode())
buf = b""
while not buf.endswith(b"\n"):
    chunk = s.recv(65536)
    if not chunk:
        break
    buf += chunk
line = buf.decode().strip()
if os.environ.get("LC_VALUE"):
    reply = json.loads(line)
    if not reply.get("ok"):
        sys.exit(1)
    value = json.loads(reply["value"]) if op == "eval" else reply["value"]
    print(value if isinstance(value, str) else json.dumps(value))
else:
    print(line)
PY

d=99
while [ -e "/tmp/.X$d-lock" ] || [ -e "/tmp/.X11-unix/X$d" ]; do d=$((d + 1)); done
Xvfb ":$d" -screen 0 1400x900x24 -nolisten tcp >"$ART/xvfb.log" 2>&1 &
XVFB=$!
export DISPLAY=":$d"
wait_for 15 'xwininfo -root >/dev/null 2>&1' || die "Xvfb did not start on $DISPLAY"
# Without a window manager the window maps at 10x10 and the page never runs.
matchbox-window-manager -use_titlebar no >"$ART/wm.log" 2>&1 &
WM=$!
wait_for 15 'wmctrl -m >/dev/null 2>&1' || die "the window manager did not start"
if [ -n "$DIST" ]; then
    python3 -m http.server "$DEV_PORT" --bind 127.0.0.1 --directory "$DIST" >"$ART/http.log" 2>&1 &
    HTTP=$!
    wait_for 15 '[ "$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$DEV_PORT/")" = 200 ]' \
        || die "could not serve $DIST on port $DEV_PORT"
fi

if ! launch 1; then
    shot boot
    print_logs
    die "the app never rendered its UI"
fi
check "app boots, platform-linux" '[ "$(L "return document.documentElement.dataset.platform")" = "{\"id\":1,\"ok\":true,\"value\":\"\\\"linux\\\"\"}" ]'

mkdir -p "$PROJ" && echo hi > "$PROJ/index.html"
git -C "$PROJ" init -q
git -C "$PROJ" -c user.email=t@t -c user.name=t add .
git -C "$PROJ" -c user.email=t@t -c user.name=t commit -qm init
L "return await window.__TAURI_INTERNALS__.invoke(\"create_project\", {name: \"demo\", root: \"$PROJ\"})" >/dev/null
cat > "$H/.lpm/projects/demo.yml" <<Y
name: demo
root: $PROJ
services:
  web:
    cmd: python3 -m http.server $SERVICE_PORT
actions:
  hello:
    label: Hello
    cmd: echo hello-from-action > $PROJ/action.out
    display: header
Y
sleep 2
L 'return await window.__TAURI_INTERNALS__.invoke("start_project", {name: "demo", profile: ""})' >/dev/null
wait_for 20 serves
check "service serves" 'serves'

L 'return await window.__TAURI_INTERNALS__.invoke("run_action", {projectName: "demo", actionName: "hello", inputValues: {}})' >/dev/null
wait_for 10 '[ -f "$PROJ/action.out" ]'
check "action runs" 'grep -q hello-from-action "$PROJ/action.out"'

click_project; sleep 2
t0=$(xterms)
X key --clearmodifiers ctrl+shift+t
wait_for 15 '[ "$(xterms)" -gt "$t0" ]'
sleep 2
X mousemove 800 400 click 1; sleep 0.5
X type --delay 20 "echo typed-\$((2+3)) > $PROJ/typed.out"; X key Return
wait_for 10 'grep -q typed-5 "$PROJ/typed.out" 2>/dev/null'
check "Ctrl+Shift+T terminal + typing" 'grep -q typed-5 "$PROJ/typed.out"'

X type --delay 20 "sleep 100; echo late > $PROJ/late.out"; X key Return; sleep 1; X key ctrl+c; sleep 1
X type --delay 20 "echo intr > $PROJ/intr.out"; X key Return
wait_for 10 '[ -f "$PROJ/intr.out" ]'
check "Ctrl+C interrupts the shell" '[ -f "$PROJ/intr.out" ] && [ ! -f "$PROJ/late.out" ]'

# XON/XOFF off, or the tty itself would swallow ^Q before cat -v sees it.
X type --delay 20 "stty -ixon; cat -v > $PROJ/ctrlq.out"; X key Return; sleep 0.5
X key ctrl+q; sleep 0.5; X key Return; X key ctrl+d; sleep 1
check "plain Ctrl+Q reaches the program as ^Q, no quit dialog" 'grep -q "\\^Q" "$PROJ/ctrlq.out" && L "return document.body.innerText.includes(\"again to quit\")" | grep -q false'

s=$(L 'const a=document.querySelector("aside"); return a?Math.round(a.getBoundingClientRect().width):-1'); X key --clearmodifiers ctrl+shift+b; sleep 1
s2=$(L 'const a=document.querySelector("aside"); return a?Math.round(a.getBoundingClientRect().width):-1'); X key --clearmodifiers ctrl+shift+b; sleep 1
check "Ctrl+Shift+B toggles sidebar" '[ "$s" != "$s2" ]'

# xclip stays up as the clipboard owner until killed: a paste asks for the
# targets before the text, so an owner that serves one request is gone too soon.
printf 'echo pasted-ok > %s/paste.out' "$PROJ" | xclip -quiet -selection clipboard >"$ART/xclip.log" 2>&1 &
XCLIP=$!
sleep 0.5
X mousemove 800 400 click 1; X key ctrl+shift+v; sleep 1; X key Return
wait_for 5 'grep -q pasted-ok "$PROJ/paste.out" 2>/dev/null'
kill "$XCLIP" 2>/dev/null
XCLIP=
check "Ctrl+Shift+V pastes into terminal" 'grep -q pasted-ok "$PROJ/paste.out"'

wmctrl -c lpm
wait_for 5 'window_state IsUnMapped'
check "close hides, app keeps running" 'window_state IsUnMapped && kill -0 "$MAIN" 2>/dev/null'

# On the first instance's session bus, where its single-instance name lives. No
# lesson socket: binding one would take over the first instance's.
BUS=$(tr '\0' '\n' < "/proc/$MAIN/environ" | grep '^DBUS_SESSION_BUS_ADDRESS=' | cut -d= -f2-)
app_env DBUS_SESSION_BUS_ADDRESS="$BUS" timeout 30 "$APP" >"$ART/app-second.log" 2>&1
rc=$?
wait_for 5 'window_state IsViewable'
check "second launch hands off (exit 0) and reshows window" '[ "$rc" = 0 ] && window_state IsViewable && [ "$(app_pids)" = "$MAIN" ]'

click_project; sleep 0.5; X key --clearmodifiers ctrl+shift+q; sleep 1
check "Ctrl+Shift+Q asks first" 'L "return document.body.innerText.includes(\"Quit lpm?\") || document.body.innerText.includes(\"again to quit\")" | grep -q true'
X key --clearmodifiers ctrl+shift+q
wait_for 15 '! kill -0 "$MAIN" 2>/dev/null'
check "second Ctrl+Shift+Q quits" '! kill -0 "$MAIN" 2>/dev/null'
check "service survives quit" 'serves'

launch 2 || echo "warning: the relaunched app never rendered its UI" >&2
check "relaunch sees project running" 'L "return (await window.__TAURI_INTERNALS__.invoke(\"list_projects\")).map(p=>p.name+\":\"+p.running).join()" | grep -q "demo:true"'
L 'return await window.__TAURI_INTERNALS__.invoke("stop_project", {name: "demo"})' >/dev/null
sleep 3
check "stop ends the service" '! serves'

shot final
echo "RESULT pass=$pass fail=$fail"
[ "$fail" = 0 ] && [ "$pass" = 15 ] && exit 0
print_logs
exit 1
