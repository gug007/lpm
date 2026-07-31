# Running lpm on a Linux host

lpm's desktop app is macOS-only to look at, but the same binary runs headless on a
Linux server so agents and services keep running when the laptop closes. A Mac
drives it over the peer protocol and its projects appear in the Mac's sidebar.

The app is not rewritten for this — it runs as itself, drawing into a virtual
display. That is why there is a window manager in the stack.

## Install

Requires `Xvfb`, `matchbox-window-manager`, `xdpyinfo` (`x11-utils`), and the GTK /
WebKit runtime the app links against:

```sh
apt-get install -y xvfb matchbox-window-manager x11-utils \
  libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1
```

Take the binaries from the `lpm-linux-x86_64` artifact of the **Linux host**
workflow — the build has to go through the Tauri CLI, and a plain
`cargo build --release` produces a binary that still points at the dev server:

```sh
install -m755 lpm-desktop /root/lpm-desktop
install -m755 lpm-cli-x86_64-unknown-linux-gnu /root/lpm-cli-x86_64-unknown-linux-gnu
ln -sf /root/lpm-cli-x86_64-unknown-linux-gnu /usr/local/bin/lpm

install -m644 lpm-xvfb.service lpm-wm.service lpm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now lpm.service
```

`lpm.service` pulls in the other two, so enabling it is enough.

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
