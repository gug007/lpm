# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a monorepo containing three deliverables that share code:

- **CLI** (`main.go`, `cmd/`) — root Go module `github.com/gug007/lpm`. Built as the `lpm` binary.
- **Desktop app** (`desktop/`) — separate Go module that imports the root via a local `replace` directive. Wails v2 (Go backend) + React/TS frontend in `desktop/frontend/`.
- **Marketing website** (`website/`) — Next.js 16, separate.
- **Shared Go packages** (`internal/`) — `config` (YAML parsing/validation), `tmux` (session management), `aigen`, `version`. Imported by both CLI and desktop.
- **AI agent skill** (`lpm-config/`) — published via skills.sh; teaches agents how to author lpm YAML configs. `lpm-config/SKILL.md` is the canonical reference for the YAML schema (see "Config schema" below).

## Common commands

CLI (run from repo root):

```sh
go build -o lpm .                 # build CLI
go test ./...                     # run all Go tests (includes internal/ + desktop/)
go test ./internal/config -run TestName  # single test
./scripts/release.sh patch        # bump version, push v* tag — CI does the build/sign/notarize
```

Desktop app (run from `desktop/`):

```sh
./cleanup.sh           # kill stale Vite (5173) / Wails (34115) processes before dev
wails dev              # live-reloading dev build (frontend on :5173, app on :34115)
wails build            # production build to desktop/build/bin/lpm.app
go test ./...          # backend tests (includes portforward_test, portpoller_test, sshconfig_test)
```

Frontend only (run from `desktop/frontend/`):

```sh
npm run dev     # vite dev server
npm run build   # tsc + vite build → desktop/frontend/dist (consumed by wails)
```

Website (run from `website/`):

```sh
pnpm dev / pnpm build / pnpm lint
```

## Architecture

**Two Go modules, one source of truth.** The CLI and desktop app are separate binaries with separate `go.mod` files, but both import `github.com/gug007/lpm/internal/config` and `internal/tmux`. The desktop module's `replace github.com/gug007/lpm => ../` wires this up. When you change YAML schema, action resolution, or tmux behavior in `internal/`, both surfaces pick it up.

**Project state lives outside the repo.** Configs are user-authored YAML at `~/.lpm/projects/<name>.yml`, with a global add-on at `~/.lpm/global.yml`. Runtime state (window size, project order) is in `~/.lpm/settings.json`. The CLI and desktop app read/write the same files — they're coordinated, not isolated.

**tmux is the execution substrate.** Every service and action runs inside a tmux session/pane. The desktop app's terminal panes are PTYs attached to those tmux sessions (`desktop/pty.go`, `desktop/terminals.go`). `tmux` is a hard runtime dependency — `internal/tmux` injects `/opt/homebrew/bin` and `/usr/local/bin` into PATH at init time so the GUI app (which gets a stripped PATH from launchd) can find it.

**External tools talk to the running desktop via a Unix socket** at `~/.lpm/lpm.sock` (`desktop/socket.go`). This is how the CLI can show status for projects started in the GUI and vice versa.

**SSH/remote projects share a ControlMaster connection** per host at `/tmp/lpm-<uid>/cm-<hash>` (see `config.SSHControlPath`). One disconnect affects every pane on that host. SSH project actions can run in two modes: `remote` (over SSH on the host) or `sync` (rsync `ssh.dir` to a local mirror, run locally, rsync back). `mode: sync` is rejected on local projects.

**Action inheritance.** Nested action groups inherit `cwd`, `env`, and `mode` from the parent via `Action.ResolvedChild` (`internal/config/config.go`). A parent with a `cmd` plus nested `actions` renders as a split button; nested `actions` alone renders as a dropdown.

**Wails frontend bindings.** Go methods on `App` (`desktop/app.go`) are auto-exposed to TS at `desktop/frontend/wailsjs/go/main/App`. The wailsjs directory is generated and gitignored — don't edit it. Frontend state uses Zustand stores in `desktop/frontend/src/store/`.

## Config schema authority

For the YAML config schema (services, actions, terminals, profiles, SSH, action groups, inputs, display modes, validation rules), `lpm-config/SKILL.md` is the canonical reference. When adding a new field or behavior, update both the Go decoder (`internal/config/config.go`) **and** `lpm-config/SKILL.md` — agents using the skill rely on the latter.

## Releases

Tagging `v*` triggers `.github/workflows/release.yml`, which:
1. Builds, signs (Developer ID), and notarizes the desktop app for arm64 + amd64
2. Builds, signs, and notarizes the CLI for both arches
3. Uploads `.dmg` + `.tar.gz` artifacts to the GitHub release

`install.sh` (curl-piped install) pulls the latest CLI tarball from GitHub releases. The desktop app self-updates via `desktop/updates.go`.

## Notes on the website

`website/AGENTS.md` warns: this is Next.js 16 with breaking changes from training data. Read `node_modules/next/dist/docs/` before writing Next.js code there.
