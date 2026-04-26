# lpm SSH feature — capability brief

Source: commits `6be6ab7..d718d43` on `main`. Feature surface lives in
`desktop/sshconfig.go`, `desktop/sshsync.go`, `desktop/portforward.go`,
`desktop/portpoller.go`, `desktop/projects.go`, `desktop/actions.go`,
`desktop/pty.go`, `internal/config/config.go`,
`desktop/frontend/src/components/AddSSHProjectModal.tsx`,
`desktop/frontend/src/components/NewProjectPicker.tsx`, and the
`project-detail/Ports*` files.

This is a factual brief — no marketing language. The copywriter will style.

---

## 1. What the user can actually do

### 1a. Create an SSH project

- "Add a project" picker (`NewProjectPicker.tsx`) shows two options:
  - **Local Folder** — pick a folder on disk
  - **SSH Host** — connect to a remote machine over SSH
- Choosing "SSH Host" opens the **Connect to SSH host** modal
  (`AddSSHProjectModal.tsx`).
- The modal collects:
  - **Host** — hostname or IP
  - **User** — login user
  - **Port** — defaults to 22
  - **Identity file** — optional path to an SSH key, e.g. `~/.ssh/id_ed25519`.
    Empty falls back to ssh-agent or `~/.ssh/config` defaults.
  - **Remote directory** — optional default working directory; the shell lands
    here on the remote.
  - **Project name** — auto-suggested from `user-host` and slugified, but the
    user can override it.
- Submitting the modal calls the Wails-bound Go function `CreateSSHProject`,
  which writes a project YAML at `~/.lpm/projects/<name>.yml` containing an
  `ssh:` block and a default `services.shell` that runs `exec "$SHELL" -l`
  on the remote.

### 1b. Pick an existing host from `~/.ssh/config`

- On open, the modal calls `ListSSHHosts` (`sshconfig.go`) which parses
  `~/.ssh/config` and any files referenced by `Include` directives (depth
  capped at 4 to avoid cycles).
- The parser:
  - Extracts each non-wildcard `Host` block (skips `*`, `?`, and `!`-prefixed
    negations).
  - Reads `HostName`, `User`, `Port`, `IdentityFile` from each block.
  - Ignores `Match` blocks (their predicates can't be evaluated outside an
    actual ssh connection attempt).
  - Honors quoted fields, `=` separators, comments, and the SSH first-match
    semantics.
  - Returns a deduped, alphabetically sorted list as JSON to the frontend.
- The modal renders this as a dropdown picker labeled **Connect to Host…**.
  Each option shows the alias and (when present) the user. Selecting a host
  pre-fills Host / User / Port / Identity file in the form below; the project
  name auto-suggests from the alias.
- A trailing "Enter manually…" option lets the user bypass the picker and
  type the connection details themselves.
- If the user edits the Host field after picking a configured host, the picker
  flips to "manual" so the displayed selection doesn't lie about what's
  actually being submitted.
- When `~/.ssh/config` is missing or empty, the picker is hidden and the
  fields appear directly.

### 1c. Run services, actions, and terminals over SSH

Once an SSH project exists, lpm's existing project lifecycle works against
the remote host transparently:

- **Services** — long-running processes declared under `services:` are
  spawned on the remote. The local tmux session (one pane per service)
  becomes a window into remote `ssh user@host '<service-cmd>'` invocations.
- **Actions** — items declared under `actions:` run as one-shot commands;
  on SSH projects they default to `mode: remote`, executing on the host.
- **Terminals** — items declared under `terminals:` open an interactive
  shell on the remote. The remote shell honors the project's `ssh.dir`
  (lands the user there via `cd <dir>`).
- All command execution wraps the remote command in `bash -ilc '...'` so
  the remote login + interactive rc files run, putting `nvm`, `rbenv`,
  `asdf`-managed tools on `PATH` (see `WrapAsLoginShell`).
- Per-action `cwd` is joined to `ssh.dir`: an absolute or `~`-prefixed `cwd`
  wins; a relative `cwd` is appended. Per-action `env:` exports run before
  the command.
- All ssh invocations share an OpenSSH **ControlMaster** connection
  (`ControlMaster=auto`, `ControlPath=/tmp/lpm-<uid>/cm-%C`,
  `ControlPersist=10m`). Subsequent service/action/terminal launches reuse
  the existing channel instead of re-authing — measurable startup speedup
  on slow links / 2FA-gated bastions.
- Server keepalive: `ServerAliveInterval=30` is set on every ssh invocation
  so dropped connections surface promptly instead of hanging.

### 1d. Action mode: remote vs sync

Each action can declare `mode:` (added in commit `15cfbd4`):

- **`mode: remote`** (default for SSH projects) — runs the command on the
  remote host over ssh.
- **`mode: sync`** — rsyncs `ssh.dir` into a local mirror at
  `~/.lpm/sync/<project>/`, runs the action locally against that mirror,
  then rsyncs changes back. `rsync -az --update` is used both ways so
  files newer on either side aren't overwritten.

The "sync" mode exists so locally-installed tools (e.g. a local Claude Code
session, a local code-formatter, a local IDE refactor) can act on remote
files without the user manually shuttling code. A `pullTTL` of 5 seconds
suppresses redundant rsyncs during rapid action chains. Pushes run async
on action exit and surface any rsync failure via the `sync-error` event;
shutdown waits on in-flight pushes.

The schema (`project-config.schema.json`, commit `15cfbd4`) restricts `mode`
to `remote` or `sync` and the validator rejects `mode: sync` on local
projects. Nested sub-actions inherit the parent's `mode`, `cwd`, and `env`.

### 1e. Forward remote ports to localhost

The Ports panel (`PortsButton.tsx` + `PortsPopover.tsx`, commit `d718d43`)
provides remote-to-local port forwarding for any running SSH project.

**Manual forward**

- Open the project's Ports popover (button in the project detail header).
- Enter a remote port; optionally enter a desired local port (blank = auto).
- Submit — backend `AddPortForward` spawns
  `ssh -N -L 127.0.0.1:<localPort>:127.0.0.1:<remotePort> ...`
  with `ExitOnForwardFailure=yes` and `ServerAliveInterval=30`.
- Local port selection: when the user leaves it blank, the backend prefers
  to **mirror the remote port locally** (so `localhost:3000` hits remote
  `:3000`). If that local port is already in use, it falls back to a
  randomly-picked free port.
- Forwards are idempotent on remote port: a second request for the same
  port returns the existing tunnel.

**Port readiness polling (local listener)**

- After spawning ssh, the backend polls `127.0.0.1:<localPort>` until
  something accepts (75 ms tick, 4 second timeout). Only then does the
  forward report success — the user knows the tunnel is actually usable
  the moment the toast appears.
- If ssh exits before the listener comes up (auth failure, port-in-use,
  bad host key, etc.), the polling exits early and the captured stderr
  tail surfaces in the error message.

**Discover-and-suggest from remote listening sockets**

- For every running SSH project, lpm runs a background **port poller**
  (`portpoller.go`) every 3 seconds. The poller runs
  `(ss -tlnH) || (netstat -tln | tail -n +3)` on the remote and parses
  out listening TCP ports.
- It filters out the SSH port itself, ports below 1024 (unless declared
  in `services:`), and "ambient" ports already listening at the moment
  polling starts (system services, databases, alt-ssh) — those get
  baseline-dismissed silently so only **ports opened after** the user
  hit Start get surfaced.
- New listening ports are surfaced as **suggestions** in the Ports
  popover — a "Detected on remote" section with a one-click forward
  button. Suggestions show as a `N new` badge on the Ports button.
- If a port is **declared** under `services:`, it auto-forwards instead
  of suggesting (toast: `Auto-forwarded :3000 → http://localhost:3000`,
  with an "Open" action).
- Suggestions can be edited inline (pencil icon → change the local port,
  Enter to commit, Escape to cancel) or dismissed. Dismissals stick
  across service restarts.
- The popover also has a **Clear all** button for cases where ambient
  noise piled up before the baseline filter took effect.

**Discover-and-suggest from URL output**

- The PTY wrapper (`sniffPortsFromOutput`) scans terminal output from
  remote services for `http://localhost:NNNN` / `127.0.0.1:NNNN` /
  `0.0.0.0:NNNN` URLs (with ANSI color codes stripped first so
  vite/next/chalk-formatted output still matches). Detected ports
  feed into the same suggestion / auto-forward machinery as the
  remote-poll path.

**Lifecycle**

- Forwarding direction is **remote → local**: `ssh -N -L`. There is no
  reverse / `-R` mode.
- Forwards live for the duration of the project run. Stopping or removing
  the project kills every forward, clears suggestions, and stops the
  poller. Clicking "Stop" on a single forward kills only that ssh.
- The backend tracks the ssh subprocess and emits `ports-changed` whenever
  a forward starts or exits unexpectedly so the UI stays in sync.
- `resumePortPollers` re-attaches pollers on app startup for projects
  whose remote services survived a restart.
- App shutdown calls `stopAllPortForwards` so no orphan ssh processes
  leak.

### 1f. Per-project SSH connection profile

The SSH connection lives in the project YAML alongside services/actions,
so each project has its own host. Schema (`config.go`,
`project-config.schema.json`):

```yaml
ssh:
  host: example.com         # required
  user: deploy              # required
  port: 22                  # default 22
  key: ~/.ssh/id_ed25519    # optional
  dir: /var/www/app         # optional, must be absolute or ~-prefixed

services:
  web:
    cmd: npm run dev
    port: 3000

actions:
  migrate:
    cmd: rake db:migrate
    mode: remote          # default on SSH projects
  format:
    cmd: prettier --write src
    mode: sync            # uses local rsync mirror
```

The config validator enforces: `host` and `user` required when `ssh:` is
present, port range, `dir` must be absolute or `~`-prefixed, and SSH
projects don't need `root`.

Project YAML stays portable across machines — `key` and any `~`-prefixed
local paths collapse to `~/...` form on save.

---

## 2. Pain it removes

Concrete dev workflows lpm now handles end-to-end:

- **Remote dev box / cloud workstation.** A team uses a beefy Linux box
  (EC2, GCP, Hetzner) for builds while developers code from a Mac. lpm's
  "SSH Host" project runs the dev box's services in tmux panes you see
  locally; localhost in the browser hits whatever the dev box just bound.
- **Staging / preview server.** Quickly tail a staging service, run a
  one-shot action like `rake db:migrate` against staging, and hit the
  preview URL on `localhost`.
- **Bastion / jump host.** Because the host picker reads `~/.ssh/config`,
  any `ProxyJump`/`ProxyCommand` setup the user already has in place
  applies automatically — pick the inside-VPC host from the dropdown and
  lpm opens services through the bastion without any extra config.
- **Docker host on Mac.** Developers running Docker on a separate Linux
  host (because Mac Docker is slow) point an SSH project at it; declared
  service ports auto-forward, and ad-hoc compose ports surface as
  suggestions.
- **Linux build / CI machine.** SSH'd into a Linux box for a build, run
  the build pipeline as an action, watch its output in a remote terminal,
  and forward the artifact server back when it comes up.
- **Embedded / homelab device.** A Raspberry Pi or NAS on the LAN — pick
  it from the dropdown, declare `services` for its dev/test daemons,
  forward whatever it serves to your laptop browser.
- **Read-and-edit remote files locally.** Action `mode: sync` lets a
  local refactor / formatter / IDE-driven AI tool act on remote source
  trees without the user manually rsyncing back and forth.
- **Multi-environment switching.** Each environment is a separate lpm
  project (prod, staging, ec2-1, ec2-2). Switching is one click; their
  services/actions stay isolated and so do their forwarded ports.

What it removes:

- Hand-typed `ssh -L` lines and the resulting orphaned ssh processes.
- Re-typing the same host/user/port that's already in `~/.ssh/config`.
- Guessing whether the local listener is actually up before clicking the
  preview URL — the toast only appears when a TCP connect succeeds.
- Hunting through remote `ps` / `ss` output to see which dev server bound
  which port, and figuring out the right `ssh -L` flags for each.
- Splitting attention between a local terminal and a remote tmux —
  remote services run in lpm panes alongside local ones.

---

## 3. Concrete keywords and phrases (pulled from feature surface)

Direct surface (UI strings):

- "Connect to SSH host"
- "Connect to Host…"
- "Enter manually…"
- "Add a project" / "SSH Host" / "Local Folder"
- "Connect to a remote machine over SSH"
- "Services, actions, and terminals will run over this SSH connection."
- "Identity file (optional)"
- "Leave blank to use ssh-agent or your ~/.ssh/config defaults."
- "Remote directory (optional)"
- "The shell will land in this directory on the remote host."
- "Forwarded ports"
- "Detected on remote"
- "remote :3000 → localhost:3000"
- "Auto-forwarded :3000 → http://localhost:3000"
- "Add a remote port below to expose it on localhost."

Code/schema/config-level:

- "ssh config" / "~/.ssh/config" / "SSH config host picker"
- "ssh action mode" / "mode: remote" / "mode: sync"
- "remote port forwarding" / "local port forwarding" / "ssh -L"
- "ControlMaster" / "ControlPath" / "ControlPersist" / connection multiplexing
- "ServerAliveInterval" / SSH keepalive
- "host picker" / "host alias" / "HostName"
- "ProxyJump" / "jump host" / bastion host (inherited from `~/.ssh/config`)
- "Identity file" / "ssh-agent"
- "remote directory" / `ssh.dir`
- "port readiness polling" / "wait for local listener"
- "auto-forward declared service ports"
- "rsync mirror" / "local mirror of ssh.dir" / "rsync push" / "rsync pull"
- "config import" — picker reads existing `~/.ssh/config` so anything you
  already configured in `Host` blocks works without re-typing.
- "remote terminal over SSH" / "interactive remote shell"
- "tmux session per project" — implementation detail; user-facing copy
  should describe behavior in terms of "panes per service" / "remote
  services running side-by-side."

Common dev-server keywords the URL-sniffer recognizes (so SEO-relevant
terms naturally apply):

- vite, next, rails, django, express, webpack-dev-server (any tool that
  prints `http://localhost:NNNN` on startup)

---

## 4. Notable UX details

### Host picker

- Picker only appears when `~/.ssh/config` has at least one non-wildcard
  Host. Otherwise the form fields show directly.
- Selecting a host pre-fills Host / User / Port / Identity file *and*
  auto-suggests a project name from the alias (slugified).
- The project name auto-suggest stops as soon as the user types into the
  name field (`nameTouched` flag).
- Wildcard hosts (`*`, `?`, `!`-prefixed) are deliberately omitted — they're
  templates, not pickable hosts.
- `Match` blocks are skipped because their predicates depend on actual
  ssh connection state (target host, exec, etc.) that lpm can't evaluate.
- `Include` directives are followed (max depth 4) so users with split
  configs (`~/.ssh/config.d/work`, etc.) see all their hosts.
- First-match-wins precedence is preserved (matches OpenSSH's behavior
  for repeated `Host` blocks).

### Port forwarding direction and lifecycle

- Direction is **remote → local only** (`ssh -N -L`). There is no
  reverse forwarding.
- Local port choice: backend prefers to mirror the remote port (so the
  user types the same port they read in remote logs); only falls back
  to a random free port on conflict.
- A forward is considered "open" only after a TCP connect to the local
  side succeeds, so the success toast and the working tunnel are in
  sync.
- Each forward is owned by a project. Stopping or removing the project
  kills its forwards. App shutdown kills all forwards across all
  projects.
- The Ports button shows two badges: a green count of active forwards,
  and a blue "N new" badge for pending suggestions when there are no
  active forwards.
- Suggestions can be:
  - **Accepted** (one click → forward at the suggested local port)
  - **Edited** (pencil → change local port → Enter)
  - **Dismissed** individually or via "Clear all"
- Dismissals persist across service restarts; the suggested set itself
  prunes ports that stop listening so the popover doesn't grow stale.

### Runs alongside local projects

- An SSH project is a peer of a local project — same sidebar, same
  command launcher, same "Start / Stop" buttons. Switching between a
  local project and a remote one is one click.
- The Ports panel only appears in remote-project context (button is
  rendered against `IsRemote` projects).
- A user can have many SSH projects open in parallel; their forwards,
  pollers, and rsync mirrors are all isolated by project name.

### Per-project SSH config

- Connection lives inside the project YAML (`ssh:` block). No global
  hosts file maintained by lpm — `~/.ssh/config` is the source of truth
  for connection metadata, and the picker just imports from it once at
  modal open.
- Editing the project YAML lets the user change host/user/port/key/dir
  later (and add `services` / `actions` / `terminals` / `mode: sync`).
  The same config validator runs on save, surfacing any error in the
  editor before the file commits.

### Integration with existing project flow

- Existing flows (Start, Stop, profiles, services subset, terminals,
  actions, action inputs/options, child actions, duplicate-via-pointer)
  all transparently apply to SSH projects — the only difference is
  `cmd` is wrapped with `ssh ... 'bash -ilc <script>'` instead of run
  directly.
- The duplicate / parent-pointer feature works for SSH projects: the
  same connection profile can be shared by multiple project entries
  (e.g. `prod-web` and `prod-jobs` pointing at the same host with
  different service subsets).
- Notes, status entries, and project ordering work identically for
  SSH projects.

### Performance / robustness

- ControlMaster multiplexing means only the **first** ssh-touching
  operation pays the auth cost; subsequent service starts, action runs,
  and terminal opens reuse the channel.
- Port poller emits `ports-changed` only on real change after the first
  poll, so the popover doesn't re-render on every 3-second tick.
- `pruneOrphanSyncDirs` cleans up `~/.lpm/sync/<name>` directories at
  startup for projects that no longer exist.
- App shutdown waits (with a timeout) on in-flight rsync pushes so a
  user closing the app immediately after editing doesn't lose changes.

---

## 5. File map (for the copywriter, when they need to verify a claim)

| Capability | Source file |
|---|---|
| `~/.ssh/config` parsing, host listing | `desktop/sshconfig.go` |
| Host picker dropdown / SSH project modal | `desktop/frontend/src/components/AddSSHProjectModal.tsx` |
| Local vs SSH project picker | `desktop/frontend/src/components/NewProjectPicker.tsx` |
| SSH project schema, validation, command argv builder | `internal/config/config.go`, `desktop/frontend/src/schemas/project-config.schema.json` |
| `CreateSSHProject` Wails endpoint | `desktop/projects.go` |
| Action mode (remote vs sync), rsync mirror | `desktop/sshsync.go`, `desktop/actions.go` |
| Terminal / service launch over SSH | `desktop/pty.go`, `internal/tmux/tmux.go` |
| Remote port forwarding (`ssh -N -L`) | `desktop/portforward.go` |
| Remote port discovery (poller + URL sniff) | `desktop/portpoller.go`, `desktop/portforward.go` |
| Ports UI (button, popover, inline edit) | `desktop/frontend/src/components/project-detail/{PortsButton,PortsPopover,LocalPortField,forwardPort}.{tsx,ts}` |
