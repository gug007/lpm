#!/bin/sh
# Test for the parts of install.sh and uninstall.sh that decide things about the
# machine rather than change it: which account the app runs as, how `lpm pair`
# has to be run, which packages are missing, and the needrestart exclusion.
#
#     sh desktop/linux/tests/install-test.sh
#
# The scripts themselves need root and a real systemd, so the functions are
# lifted out of them and run against a fake proc tree, env file and fake
# systemctl / getent / runuser / dpkg-query. Both scripts carry their own copy of
# the account lookup (the uninstaller runs off a pipe), so every case runs
# against both and the two can't drift apart.
set -u

HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INSTALL=${INSTALL:-$HERE/install.sh}
UNINSTALL=${UNINSTALL:-$HERE/uninstall.sh}
ROOT=$(mktemp -d)
BIN=$ROOT/bin
STATE=$ROOT/state
PROC=$ROOT/proc
ENV_FILE=$ROOT/host.env
mkdir -p "$BIN" "$STATE" "$PROC"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (want '$3', got '$2')"; fi; }

# ---- fakes -----------------------------------------------------------------
# systemctl show -p PROP --value lpm.service: the contents of state/PROP.
cat > "$BIN/systemctl" <<EOF
#!/bin/sh
[ "\$1" = show ] || exit 1
cat "$STATE/\$3" 2>/dev/null
exit 0
EOF

cat > "$BIN/getent" <<EOF
#!/bin/sh
[ "\$1" = passwd ] || exit 2
awk -F: -v k="\$2" '\$1 == k || \$3 == k { print; found = 1 } END { exit !found }' "$STATE/passwd"
EOF

# runuser -u USER -- CMD...: records who, then runs the command as us.
cat > "$BIN/runuser" <<EOF
#!/bin/sh
echo "\$2" > "$STATE/runuser"
shift 3
exec "\$@"
EOF

# dpkg-query -W -f=... PKG: the status in state/pkg-PKG, the version in
# state/ver-PKG.
cat > "$BIN/dpkg-query" <<EOF
#!/bin/sh
for last; do :; done
[ -f "$STATE/pkg-\$last" ] || { echo "no packages found matching \$last" >&2; exit 1; }
case "\$2" in
    *Version*) cat "$STATE/ver-\$last" 2>/dev/null ;;
    *) cat "$STATE/pkg-\$last" ;;
esac
EOF

# dpkg --compare-versions A ge B, by sort -V: enough for the versions used here.
cat > "$BIN/dpkg" <<EOF
#!/bin/sh
[ "\$1" = --compare-versions ] && [ "\$3" = ge ] || exit 2
[ -n "\$2" ] || exit 1
[ "\$(printf '%s\\n%s\\n' "\$2" "\$4" | sort -V | head -n 1)" = "\$4" ]
EOF

cat > "$BIN/show-env" <<EOF
#!/bin/sh
echo "HOME=\$HOME LPM_DIR=\${LPM_DIR:-}"
EOF

chmod +x "$BIN"/*
PATH="$BIN:$PATH"
export PATH

printf '%s\n' "root:x:0:0:root:/root:/bin/bash" \
    "ubuntu:x:1000:1000:Ubuntu:/home/ubuntu:/bin/zsh" \
    "svc:x:998:998::/var/lib/svc:/usr/sbin/nologin" > "$STATE/passwd"

# fake_app PID UID ENV...: a running app as the service manager started it.
fake_app() {
    pid=$1 uid=$2
    shift 2
    mkdir -p "$PROC/$pid"
    printf 'Name:\tlpm-desktop\nUid:\t%s\t%s\t%s\t%s\n' "$uid" "$uid" "$uid" "$uid" > "$PROC/$pid/status"
    : > "$PROC/$pid/environ"
    for kv in "$@"; do printf '%s\0' "$kv" >> "$PROC/$pid/environ"; done
}

# unit MAINPID USER ENVIRONMENT: what `systemctl show` reports.
unit() {
    printf '%s\n' "$1" > "$STATE/MainPID"
    printf '%s\n' "$2" > "$STATE/User"
    printf '%s\n' "$3" > "$STATE/Environment"
}

# Lifts the named top-level functions out of a script and defines them here.
load() {
    file=$1
    shift
    for fn in "$@"; do
        body=$(sed -n "/^$fn() {\$/,/^}\$/p" "$file")
        [ -n "$body" ] || { no "$fn is not defined in ${file##*/}"; continue; }
        eval "$body"
    done
}

ACCOUNT_FNS="resolve_service_account running_account configured_account last_value env_file_value as_service_account"

# expect DESCRIPTION USER HOME LPM_DIR: resolve with both scripts' copies.
expect() {
    for script in "$INSTALL" "$UNINSTALL"; do
        load "$script" $ACCOUNT_FNS
        resolve_service_account
        check "$1 [${script##*/}]" "$SERVICE_USER|$SERVICE_HOME|$SERVICE_LPM_DIR" "$2|$3|$4"
    done
}

echo "== systemd: the running app =="
SUPERVISOR=systemd
rm -f "$ENV_FILE"
fake_app 4242 0 DISPLAY=:99 HOME=/root SHELL=/bin/bash
unit 4242 "" "DISPLAY=:99 HOME=/root"
expect "a root host is exactly what it always was" root /root ""

# The field report: a drop-in with User=ubuntu and HOME=/home/ubuntu.
fake_app 4243 1000 DISPLAY=:99 HOME=/home/ubuntu SHELL=/bin/zsh
unit 4243 ubuntu "DISPLAY=:99 HOME=/root HOME=/home/ubuntu"
expect "an app running under a User= drop-in" ubuntu /home/ubuntu ""

fake_app 4244 1000 HOME=/home/ubuntu 'LPM_DIR=~/lpm-data'
unit 4244 ubuntu "HOME=/home/ubuntu"
expect "LPM_DIR relative to home is expanded" ubuntu /home/ubuntu /home/ubuntu/lpm-data

# The live answer beats the configured one: it is what actually holds the socket.
fake_app 4245 1000 HOME=/home/ubuntu
unit 4245 "" "DISPLAY=:99 HOME=/root"
expect "the running process wins over the unit's settings" ubuntu /home/ubuntu ""

echo "== systemd: nothing running =="
unit 0 ubuntu "DISPLAY=:99 HOME=/root HOME=/home/ubuntu"
expect "the last HOME= in the unit wins" ubuntu /home/ubuntu ""

unit 1000 ubuntu "DISPLAY=:99 HOME=/root HOME=/home/ubuntu"
rm -rf "$PROC/1000"
expect "a MainPID that has already gone falls back to the unit" ubuntu /home/ubuntu ""

unit 0 1000 "DISPLAY=:99 HOME=/home/ubuntu"
expect "a numeric User= is named" ubuntu /home/ubuntu ""

unit 0 svc ""
expect "no HOME anywhere takes the account's own" svc /var/lib/svc ""

printf 'SHELL=/bin/zsh\nHOME="/srv/lpm home"\nLPM_DIR=/srv/lpm-data\n' > "$ENV_FILE"
unit 0 ubuntu "DISPLAY=:99 HOME=/home/ubuntu"
expect "the env file overrides Environment=, as systemd applies them" ubuntu "/srv/lpm home" /srv/lpm-data
rm -f "$ENV_FILE"

unit 0 "" ""
expect "a fresh machine with no unit yet is root" root /root ""

echo "== container =="
SUPERVISOR=container
fake_app 4243 1000 HOME=/home/ubuntu
unit 4243 ubuntu "HOME=/home/ubuntu"
expect "no systemd to ask: the supervisor's default" root /root ""
printf 'SHELL=/bin/bash\nLPM_HOME=/data/home\n' > "$ENV_FILE"
expect "LPM_HOME from host.env, which hostctl.sh lets win" root /data/home ""
rm -f "$ENV_FILE"

echo "== running as the service account =="
SUPERVISOR=systemd
load "$INSTALL" $ACCOUNT_FNS
fake_app 4243 1000 HOME=/home/ubuntu LPM_DIR=/srv/lpm-data
unit 4243 ubuntu ""
resolve_service_account
rm -f "$STATE/runuser"
check "a non-root account's command gets its home and data dir" \
    "$(as_service_account show-env)" "HOME=/home/ubuntu LPM_DIR=/srv/lpm-data"
check "and runs as that account" "$(cat "$STATE/runuser" 2>/dev/null)" "ubuntu"
unit 4242 "" ""
resolve_service_account
rm -f "$STATE/runuser"
check "root's command gets root's home" "$(as_service_account show-env)" "HOME=/root LPM_DIR="
[ -f "$STATE/runuser" ] && no "root went through runuser" || ok "and runs directly"

echo "== the pair command it suggests =="
load "$INSTALL" pair_command
pair_as() { # service-user sudo-user
    SERVICE_USER=$1
    if [ -n "$2" ]; then SUDO_USER=$2; else unset SUDO_USER; fi
    pair_command
}
check "ubuntu login, ubuntu service" "$(pair_as ubuntu ubuntu)" "lpm pair"
check "ubuntu login, root service" "$(pair_as root ubuntu)" "sudo -H lpm pair"
check "another login, ubuntu service" "$(pair_as ubuntu alice)" "sudo -H -u ubuntu lpm pair"
check "root login, root service (a container)" "$(pair_as root "")" "lpm pair"
check "root login, ubuntu service" "$(pair_as ubuntu "")" "sudo -H -u ubuntu lpm pair"
unset SUDO_USER

echo "== which dependencies are missing =="
load "$INSTALL" installed
echo "install ok installed" > "$STATE/pkg-xvfb"
echo "install ok installed" > "$STATE/pkg-libgtk-3-0t64"
echo "deinstall ok config-files" > "$STATE/pkg-git"
installed xvfb && ok "an installed package" || no "xvfb reported missing"
installed libgtk-3-0 && ok "a package renamed for t64" || no "libgtk-3-0t64 not recognised"
installed git && no "removed-but-configured counted as installed" || ok "a removed package with config left"
installed iproute2 && no "an absent package counted as installed" || ok "an absent package"

load "$INSTALL" missing_deps
NEED_WEBKIT=$(sed -n 's/^NEED_WEBKIT=//p' "$INSTALL")
DEPS="xvfb libwebkit2gtk-4.1-0 git"
echo "install ok installed" > "$STATE/pkg-libwebkit2gtk-4.1-0"
echo "2.36.0-2ubuntu1" > "$STATE/ver-libwebkit2gtk-4.1-0"
check "a WebKitGTK below the floor is still installed" "$(installed libwebkit2gtk-4.1-0 && echo yes)" "yes"
check "and is handed to apt with what is missing" "$(missing_deps)" " libwebkit2gtk-4.1-0 git"
echo "2.46.5-0ubuntu0.22.04.1" > "$STATE/ver-libwebkit2gtk-4.1-0"
check "one at or above it is left alone" "$(missing_deps)" " git"
rm -f "$STATE/pkg-libwebkit2gtk-4.1-0" "$STATE/ver-libwebkit2gtk-4.1-0"
echo "install ok installed" > "$STATE/pkg-libwebkit2gtk-4.1-0t64"
echo "2.36.0-1" > "$STATE/ver-libwebkit2gtk-4.1-0t64"
check "the floor holds for a t64 name too" "$(missing_deps)" " libwebkit2gtk-4.1-0 git"

echo "== the needrestart exclusion =="
NR=$(sed -n "/NEEDRESTART_CONF.new\" <<'EOF'/,/^EOF\$/p" "$INSTALL" | sed '1d;$d')
check "exactly one assignment" "$(printf '%s\n' "$NR" | grep -c '^\$nrconf')" "1"
printf '%s\n' "$NR" | grep -q '^\$nrconf{override_rc}{' && ok "it adds a key to override_rc" ||
    no "it must add a key, not replace the hash: $NR"
if command -v perl >/dev/null 2>&1; then
    # How needrestart loads conf.d: a string eval into its own %nrconf.
    matched=$(printf '%s\n' "$NR" | perl -e '
        my %nrconf = (override_rc => { qr(^dbus) => 0 });
        eval do { local $/; <STDIN> };
        die $@ if $@;
        for my $unit (@ARGV) {
            my @hit = grep { $unit =~ /$_/ && $nrconf{override_rc}{$_} == 0 } keys %{$nrconf{override_rc}};
            print "$unit\n" if @hit && $unit =~ /lpm/;
        }' lpm.service lpm-xvfb.service lpm-wm.service lpmx.service lpm-other.service xlpm.service lpm.serviced.service 2>&1 | tr '\n' ' ')
    check "it parses, and holds back exactly lpm's three units" "$matched" "lpm.service lpm-xvfb.service lpm-wm.service "
else
    echo "  skip perl is not installed"
fi

rm -rf "$ROOT"
echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
