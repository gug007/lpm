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
- **Booted with systemd.** The app, the virtual display and the window manager are
  three units — a Docker container whose PID 1 is something else has nothing to
  install them into.
- **x86-64.** There is no arm64 host build yet.

The installer checks the first two before it touches apt, so a machine that can't
run this says so in one line rather than after a 300MB download.

## Install

Download `lpm-host-linux-amd64.tar.gz` from the latest release and run the
installer:

```sh
tar xzf lpm-host-linux-amd64.tar.gz
cd lpm-host
sudo ./install.sh
```

It installs the runtime dependencies (`apt`), puts the binaries in `/opt/lpm`,
links the CLI onto `PATH`, enables the three units, and waits for the app to
answer. Pass `--no-deps` to skip the apt step on a machine where the runtime is
already present — in which case make sure `tmux` and `git` are installed too.
They are not conveniences: services on a host are tmux panes, and the app refuses
to render at all without tmux on `PATH`.

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

## What a restart costs

Agent terminals on the host belong to the app process, so **restarting `lpm.service`
ends every agent running on this machine** and their conversations cannot be
resumed from where they were. That is why the unit is `Restart=on-failure` rather
than `always`. A Mac restarting is fine and reattaches to the live sessions — this
is only about restarting lpm on the host itself.

## When it doesn't come up

The failure mode to know: if the window manager isn't running, the app's window is
created 10x10 and never mapped, so the page never executes. The app looks healthy
in `systemctl status` and logs nothing useful. Confirm the display instead:

```sh
systemctl status lpm-xvfb lpm-wm lpm
DISPLAY=:99 xwininfo -root -children      # the app's window should not be 10x10
sudo -H lpm connections                    # the app answers = its page is running
```

Ask the app, not the port: nothing listens on 8766 until you pair, so a missing
listener on a host you haven't paired yet is the normal state and says nothing
about whether the app is healthy. `libEGL warning: DRI3 error` in the log is
expected — there's no GPU.

One consequence of the app and the tmux server having separate lifetimes: the
tmux server captures its environment when it starts, so editing
`/etc/lpm/host.env` and restarting `lpm` no longer reaches the panes that were
already running. `tmux kill-server` (which stops the services) is what picks up
the new environment.
