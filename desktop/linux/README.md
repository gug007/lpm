# Running lpm on a Linux host

lpm's desktop app is macOS-only to look at, but the same binary runs headless on a
Linux server so agents and services keep running when the laptop closes. A Mac
drives it over the peer protocol and its projects appear in the Mac's sidebar.

The app is not rewritten for this — it runs as itself, drawing into a virtual
display. That is why there is a window manager in the stack.

## What the machine has to be

- **Ubuntu 22.04 or newer** (glibc 2.35+). The published binary is dynamically
  linked, so the Ubuntu it was built on is the floor; below it the app installs
  cleanly and then dies on missing symbols.
- **x86-64.** There is no arm64 host build yet.

A machine booted with systemd is the shape this is built around: the app, the
virtual display and the window manager are three units. A container — a rented
GPU box, a dev sandbox, anything whose PID 1 is a shell — has nothing to install
those into, so the installer sets up [the same three processes under a
supervisor](#hosts-with-no-service-manager) instead. Both are the same install
command; it works out which it is looking at.

The glibc check runs before apt touches anything, so a machine that can't run
this says so in one line rather than after a 300MB download.

## Install

Download `lpm-host-linux-amd64.tar.gz` from the latest release and run the
installer:

```sh
tar xzf lpm-host-linux-amd64.tar.gz
cd lpm-host
sudo ./install.sh
```

It installs the runtime dependencies (`apt`), puts the binaries in `/opt/lpm`,
links the CLI onto `PATH`, enables the three units — or the supervisor, on a
machine with no service manager — and waits for the app to answer. Pass `--no-deps` to skip the apt step on a machine where the runtime is
already present — in which case make sure `git` is installed too, since the app
shells out to it for diffs and syncing. Services need nothing installed: they run
in lpm's own session daemon, which is part of the `lpm-desktop` binary.

The installer does *not* wait for the peer server, because there isn't one yet:
hosting stays off until you pair, below.

`lpm.service` pulls in the display and the window manager through `Requires=`, so
enabling that one unit brings up the whole stack, at boot too.

It runs as root, which is what a dedicated box usually is. To run it as someone
else, add a drop-in with `User=`, and set `HOME=` and `WorkingDirectory=`
explicitly while you're there — the unit uses `%h`, and for a *system* service
that specifier is the service manager's home (`/root`), not the home of the user
in `User=`.

Building by hand is possible but has a trap worth knowing: the build must go
through the Tauri CLI (`npx tauri build --no-bundle`). A plain
`cargo build --release` produces a binary that still points at the dev server and
shows "Could not connect to 127.0.0.1" on a machine with no dev server running.

## Hosts with no service manager

A container is not a small VM: its PID 1 is whatever the image starts, usually a
shell, and `systemctl` either isn't there or answers "System has not been booted
with systemd". There is nothing to install a unit into. On such a machine the
installer puts `hostctl.sh` in `/opt/lpm`, links it onto `PATH` as `lpm-host`,
and starts the same three processes under it:

```sh
lpm-host start     # display, window manager, app — detached
lpm-host status    # whether lpm is running here, and where its log is
lpm-host stop      # those three, and nothing else
lpm-host restart
```

It keeps the same lifetimes the units do. The app is restarted if it dies and
left alone if it exits cleanly (`Restart=on-failure`), and a stop takes down only
the display, the window manager and the app — the session daemon carrying this
machine's services forks into its own session and scheduled job agents `setsid`
away, so neither is in the supervisor's process group, which is the same split
`KillMode=process` gives the unit.

**Nothing here survives the container restarting.** There is no boot to hook
into, so a restarted container comes back with no lpm on it and the Mac sees a
host that stopped answering. Start it from the image's entrypoint if you want
that handled:

```sh
/opt/lpm/hostctl.sh start && exec sleep infinity   # or whatever the image already runs
```

Two container-specific things the installer can't fix for you:

- **`/dev/shm`.** Docker's default is 64MB and WebKit renders through shared
  memory. The installer says so if it sees a small one; `--shm-size=1g` when you
  create the container is the fix.
- **No session bus and no GPU.** The supervisor exports
  `WEBKIT_DISABLE_DMABUF_RENDERER`, `WEBKIT_DISABLE_COMPOSITING_MODE`,
  `LIBGL_ALWAYS_SOFTWARE` and `NO_AT_BRIDGE` for exactly this, since the
  accessibility bridge otherwise waits on a D-Bus connection nothing will answer.
  All of them are defaults: anything you set in `/etc/lpm/host.env` wins.

`hostctl.sh` reads that same `host.env`, so a host set up this way takes its
`SHELL` and anything else you put there from one file, as the unit does. The
installer merges into that file rather than rewriting it — upgrades keep whatever
you set — and owns exactly one line in it, `SHELL`, so re-running the installer is
still how a login shell that was detected wrong gets corrected.

Two things the supervisor sorts out for itself on the way up, both of which used
to be a host that could never be updated again:

- **The display is taken.** Some images run their own X server on `:99`. The
  supervisor moves to the first free display above it and logs which one; nothing
  outside the host depends on the number. `lpm-host status` names the one it
  settled on.
- **An lpm is running that nothing is supervising.** A supervisor killed outright
  leaves the app, the window manager and the display up with nothing naming them.
  `start` and `stop` both find that stack — by the app's own path and this host's
  display number — and end it, rather than reporting that lpm is not running on a
  machine where it plainly is.

## Pairing

There is no UI to click here, so bring-up runs through the CLI:

```sh
sudo -H lpm pair          # prints an invite to paste into Settings → Connections on the Mac
sudo -H lpm connections   # what this machine hosts, and what it is connected to
```

Both talk to the running app through a socket under *its* home directory, and the
service runs as root — so from a `ubuntu@`-style login they need `sudo`, and `-H`
so `$HOME` moves with it. Without `-H` the CLI looks in the login user's home,
finds nothing, and reports that the app is not running on a host that is running
fine. As root you can drop the `sudo -H`.

`lpm pair` keeps the peer port bound to this machine only. If the Mac reaches the
host through an SSH tunnel (`ssh -L 18766:127.0.0.1:8766 …`), that is what you
want, and it exposes nothing.

To be reachable directly, name the interface:

```sh
lpm pair --bind 100.64.0.5    # e.g. this machine's tailnet address
lpm pair --lan                # every interface
```

Prefer `--bind` on anything with a public IP. `--lan` also answers on the public
interface, leaving the peer port on the open internet guarded only by the pairing
code and the pinned certificate. `lpm connections` shows which address is live.

## Agent skills

The agent skills that teach a coding agent how to drive lpm (`lpm`, `lpm-cli`,
`lpm-config`, `lpm-memory`) are installed here by the app itself, into the service
account's `~/.claude/skills` and `~/.agents/skills`, on every start. They ship
inside the binary, so there is nothing to download and nothing to keep in step by
hand: the first start installs them, and any start that finds them differing from
the copies in the running binary rewrites them. Updating lpm on this machine
therefore updates its skills — the new binary restarts into the same pass.

This is the one thing a host does without being asked, and deliberately: on a Mac
it is a button in Settings → Agent tools, and there is no pane in front of anyone
here. A machine that exists to run agents is the last place they should be
missing.

When that isn't enough — a start that failed to write them, or files removed by
hand — the Mac's **Settings → Connections → the host's ⋯ menu** has *Reinstall
skills there*, which asks the host to write its own copies again. It restarts
nothing, so unlike *Update lpm there* it costs no running agents. The row says
`skills out of date` when it already knows there is something to fix, and the
entry is hidden while the host is a release behind — there the skills to install
are the ones its next binary carries.

To keep them off this machine, say so where deleting the files cannot — the next
start would only write them back:

```sh
sudo -H touch /root/.lpm/no-agent-skills
```

## Removing lpm

From the Mac: **Settings → Connections → the host's ⋯ menu → Remove lpm from this
host**. On the machine itself:

```sh
sudo ./uninstall.sh            # remove the install, keep ~/.lpm
sudo ./uninstall.sh --purge    # also delete the service account's ~/.lpm
```

It undoes what the installer did — units (or the supervisor), binaries, the
`PATH` symlinks, the environment file — and stops the services and agents that
were running, which the app deliberately does not own (see below). Your projects
and repos are left alone.

`~/.lpm` is kept by default: project configuration, session memory and this
machine's pairing identity live there, so a reinstall picks up where you left off.
`--purge` is the deliberate other choice, and it is not reversible.

## What a restart costs

Agent terminals on the host belong to the app process, so **restarting `lpm.service`
— or `lpm-host restart` — ends every agent running on this machine** and their
conversations cannot be resumed from where they were. That is why the unit is
`Restart=on-failure` rather than `always`, and why the container supervisor
follows the same rule. A Mac restarting is fine and reattaches to the live
sessions — this is only about restarting lpm on the host itself.

## When it doesn't come up

The failure mode to know: if the window manager isn't running, the app's window is
created 10x10 and never mapped, so the page never executes. The app looks healthy
in `systemctl status` and logs nothing useful. Confirm the display instead:

```sh
systemctl status lpm-xvfb lpm-wm lpm      # lpm-host status, on a container
DISPLAY=:99 xwininfo -root -children      # the app's window should not be 10x10
sudo -H lpm connections                    # the app answers = its page is running
```

On a container the app's own output goes to `~/.lpm/logs/host.log` rather than
the journal — the supervisor writes its decisions there too, so a crash loop is
visible as the restarts it is, and so is a display it had to move to or an
unsupervised lpm it stopped on the way up. `DISPLAY=:99` in the commands above is
the default, not a promise: take the number from `lpm-host status`.

Ask the app, not the port: nothing listens on 8766 until you pair, so a missing
listener on a host you haven't paired yet is the normal state and says nothing
about whether the app is healthy. `libEGL warning: DRI3 error` in the log is
expected — there's no GPU.

One consequence of the app and the session daemon having separate lifetimes: the
daemon captures its environment when it starts, so editing `/etc/lpm/host.env`
and restarting `lpm` no longer reaches the panes that were already running.
`/opt/lpm/lpm-desktop --stop-sessions` (which stops the services and retires the
daemon) is what picks up the new environment.
