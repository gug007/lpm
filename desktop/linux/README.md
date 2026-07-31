# Running lpm on a Linux host

lpm's desktop app is macOS-only to look at, but the same binary runs headless on a
Linux server so agents and services keep running when the laptop closes. A Mac
drives it over the peer protocol and its projects appear in the Mac's sidebar.

The app is not rewritten for this — it runs as itself, drawing into a virtual
display. That is why there is a window manager in the stack.

## Install

Download `lpm-host-linux-amd64.tar.gz` from the latest release and run the
installer:

```sh
tar xzf lpm-host-linux-amd64.tar.gz
cd lpm-host
sudo ./install.sh
```

It installs the runtime dependencies (`apt`), puts the binaries in `/opt/lpm`,
links the CLI onto `PATH`, enables the three units, and waits for the peer server
to come up. Pass `--no-deps` to skip the apt step on a machine where the GTK /
WebKit runtime is already present.

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
lpm pair          # prints an invite to paste into Settings → Connections on the Mac
lpm connections   # what this machine hosts, and what it is connected to
```

`lpm pair` keeps the peer port bound to this machine only. If the Mac reaches the
host through an SSH tunnel (`ssh -L 18766:127.0.0.1:8766 …`), that is what you
want. Pass `--lan` to accept connections on every interface instead — but on a
public IP, check the firewall first: binding every interface puts the peer port on
the open internet, protected only by the pairing code and the pinned certificate.

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
ss -lntp | grep 8766                       # peer server listening
```

The peer port can take ~30s to bind on a small box; poll before concluding it's
broken. `libEGL warning: DRI3 error` in the log is expected — there's no GPU.
