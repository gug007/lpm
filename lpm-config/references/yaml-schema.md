# lpm YAML Configuration — Full Schema Reference

Complete field reference for lpm project config files (`~/.lpm/projects/<name>.yml`).

## Full Config Structure

```yaml
name: <string>           # optional — defaults to the config filename
root: <path>             # required for local projects (supports ~). Omit when ssh: is set.
label: <string>          # optional — display name in the UI
parent_name: <string>    # optional — name of parent project (creates a duplicate)
ssh: {}                  # optional — SSH connection block. Replaces root for remote projects.
services: {}             # required — at least one service (omitted in duplicates)
actions: {}              # optional — one-shot commands or action groups
terminals: {}            # optional — persistent interactive shells
profiles: {}             # optional — named service subsets
```

A project must have **either** `root` (local) **or** `ssh:` (remote), not both.

---

## Project-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | no | config filename | Project identifier. Lowercase, no slashes, not `.` or `..`. Defaults to the `.yml` filename. |
| `root` | string | yes* | — | Project root directory. Supports `~`. *Required for local projects; omit when `ssh:` is set. |
| `label` | string | no | — | Display name shown in the UI (defaults to `name`). |
| `parent_name` | string | no | — | Name of a parent project. Creates a **duplicate** that inherits all services, actions, terminals, and profiles from the parent. See [Duplicate Projects](#duplicate-projects). |
| `ssh` | object | no | — | SSH connection settings — turns the project into a remote one. Services, actions, and terminals run on the host over a shared SSH ControlMaster connection. See [SSH Projects](#ssh-projects). |

---

## Services

Long-running processes that lpm starts and stops together.

### Shorthand

```yaml
services:
  worker: celery -A backend worker
```

### Full Form

```yaml
services:
  api:
    cmd: go run .
    cwd: ./backend
    port: 8080
    env:
      DATABASE_URL: postgres://localhost/myapp
    profiles:
      - production
```

### Sequence Form

Services also accept a sequence (list) instead of a mapping. Each entry must include a `name` field. The map form is preferred; use the sequence form when ordering matters or when your YAML tooling prefers arrays.

```yaml
services:
  - name: api
    cmd: go run .
    port: 8080
  - name: frontend
    cmd: npm run dev
    port: 3000
```

Actions and terminals accept the same sequence form. See `decodeNamedMap` in `internal/config/config.go` for the exact loader behavior.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cmd` | string | yes | — | Shell command to run. Must be non-empty. |
| `cwd` | string | no | `root` | Working directory. Relative paths resolve from `root`. Supports `~`. Must exist. |
| `port` | int | no | — | Port the service listens on (0–65535). Must be unique across services. |
| `env` | map[string]string | no | — | Environment variables. |
| `profiles` | []string | no | — | Profiles this service belongs to. |

---

## Actions

One-shot commands — test runners, migrations, deploy scripts, linters. Run via `lpm run <project> <action>` or from the app UI.

Actions can be **standalone** (single command), **terminal actions** (run in a persistent pane), or **action groups** (containing nested sub-actions).

### Shorthand

```yaml
actions:
  test: go test ./...
  lint: npm run lint
  fmt: cargo fmt --check
```

The key becomes both the identifier and the display label.

### Full Form

```yaml
actions:
  migrate:
    cmd: rails db:migrate
    cwd: ./backend
    label: Run Migrations
    confirm: true
    display: header
    env:
      RAILS_ENV: production
```

### Action with Inputs

Actions can prompt the user for input before running. Values are substituted into `cmd` via `{{key}}` placeholders.

```yaml
actions:
  deploy:
    cmd: ./deploy.sh --env {{env}} --tag {{tag}}
    confirm: true
    inputs:
      env:
        type: radio
        label: Environment
        options:
          - label: Development
            value: dev
          - label: Staging
            value: staging
          - label: Production
            value: prod
        default: staging
        required: true
      tag:
        label: Release tag
        placeholder: v1.0.0
```

When label and value are the same, use the shorthand:

```yaml
options: [dev, staging, production]
```

### Terminal Actions (`type: terminal`)

Set `type: terminal` to run an action in a terminal pane instead of as a background one-shot. Use `reuse: true` to keep reusing the **same** terminal pane across runs (instead of opening a new one each time):

```yaml
actions:
  logs:
    cmd: tail -f /var/log/app.log
    type: terminal
    reuse: true
    label: View Logs
    display: header
```

**When to use terminal actions vs terminals section:**
- Use `type: terminal` actions for commands you trigger on demand but want running in a visible pane (log tailers, watchers, REPLs you start via a button).
- Use the `terminals` section for always-available interactive shells (database consoles, Redis CLI).
- Set `reuse: true` when the command should always run in the same pane — prevents pane sprawl for things like log viewers.

### Background Actions (`type: background`)

Set `type: background` to run the command hidden — no modal, no terminal pane. lpm shows a toast when the command finishes, success or failure. Good fit for slow commands whose only interesting signal is "did it succeed": builds, `docker pull`, `git fetch`, one-shot migrations, dependency installs.

```yaml
actions:
  db-reset:
    cmd: npm run db:reset && npm run db:seed
    label: Reset DB
    type: background
    confirm: true           # pair with confirm for destructive ones
    display: header
```

**When to pick which `type`:**
- (default, omit the field) — interactive modal with streaming output. Use for commands you want to watch.
- `terminal` — persistent pane you keep around. Use for log tailers, watchers, REPLs triggered from a button.
- `background` — silent + toast. Use for slow boring commands you can fire and forget.

### Action Groups (Nested Actions)

An action can contain nested sub-actions. There are two shapes:

**Split button** — parent has `cmd` *and* `actions`. Primary click runs the parent command, chevron opens the children:

```yaml
actions:
  deploy:
    cmd: ./deploy.sh staging
    label: Deploy
    display: header
    confirm: true
    actions:
      production:
        cmd: ./deploy.sh production
        label: Production
        confirm: true
      preview:
        cmd: ./deploy.sh preview
        label: Preview
```

**Dropdown-only** — parent has no `cmd`, only `actions`. The whole button opens the menu. Good for a toolkit of related commands with no sensible default:

```yaml
actions:
  database:
    label: Database
    display: header
    cwd: ./backend
    actions:
      migrate:
        cmd: rails db:migrate
        confirm: true
      seed:
        cmd: rails db:seed
      reset:
        cmd: rails db:reset
        confirm: true
```

Sub-actions inherit `cwd` and `env` from the parent; child values win on conflict. Run a sub-action via CLI: `lpm run <project> database migrate`.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cmd` | string | yes* | — | Shell command to execute. Must be non-empty. *Not required if `actions` (sub-actions) is set. |
| `label` | string | no | key name | Display name shown in the UI. |
| `cwd` | string | no | `root` | Working directory. Relative paths resolve from `root`. Supports `~`. Must exist. |
| `env` | map[string]string | no | — | Environment variables injected into the command. |
| `confirm` | bool | no | false | Prompt for confirmation before running. Use for destructive or irreversible commands. |
| `display` | string | no | `header` | UI placement: `header` (main button row, default) or `footer` (terminal footer strip). `menu` is still accepted (legacy) but no longer suggested. `button` is a deprecated alias for `header`. |
| `type` | string | no | — | Action type. `terminal` runs in a terminal pane; `background` runs hidden and shows a toast on completion. Omit for the default inline runner (modal with streaming output). |
| `reuse` | bool | no | false | When `type: terminal`, reuse the same terminal pane across runs instead of opening a new one. |
| `mode` | string | no | — | SSH-only execution mode. `remote` (default on SSH projects) runs the command on the host. `sync` rsyncs `ssh.dir` into a local mirror, runs the action locally, then rsyncs changes back. `sync` is rejected on local projects. See [SSH Action Modes](#ssh-action-modes). |
| `inputs` | map[string]InputField | no | — | Named inputs prompted before running. Values substitute `{{key}}` in `cmd`. |
| `actions` | map[string]Action | no | — | Nested sub-actions. Makes this an action group. See [Action Groups](#action-groups-nested-actions). Children inherit `cwd`, `env`, and `mode` from the parent. |

### `display` Values

- **`header`** (default) — action appears as a visible button in the main button row. Omit `display` to get this.
- **`footer`** — action appears as a compact button in the terminal footer (right next to the branch switcher). Use for tight, always-one-click controls. Footer also accepts split-button groups (parent `cmd` + nested `actions`).
- **`menu`** *(legacy)* — action appears in the overflow menu. Still accepted but no longer suggested by autocomplete; may be deprecated in a future version.
- **`button`** *(deprecated alias for `header`)* — flagged as an error in the editor; runtime still treats it like `header`.

### Input Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `label` | string | no | key name | Display name shown in the UI. |
| `type` | string | no | `text` | Input type: `text`, `password`, or `radio`. |
| `required` | bool | no | false | Whether the field must have a value to run. |
| `placeholder` | string | no | — | Placeholder text (for `text` and `password` types). |
| `default` | string | no | — | Pre-filled default value. For `radio`, must match an option's `value`. |
| `options` | []string \| []{label, value} | no | — | List of options (required when `type: radio`). Each entry is a string or an object with `label` (display text) and `value` (substituted into cmd). |

### Input Types

- **`text`** (default) — single-line text input.
- **`password`** — masked text input for secrets.
- **`radio`** — vertical list of radio buttons. User picks exactly one option.

### When to Use `confirm: true`

- Database migrations, resets, drops
- Deploy / release scripts
- Cleanup commands (`docker system prune`, `rm -rf`)
- Anything touching production

---

## Terminals

Persistent interactive shells you open from the app — database consoles, REPLs, monitoring tools.

### Shorthand

```yaml
terminals:
  console: rails console
  psql: psql myapp_dev
  htop: htop
```

### Full Form

```yaml
terminals:
  psql:
    cmd: psql myapp_dev
    label: Database
    cwd: ./backend
    display: header
    env:
      PGUSER: admin
```

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cmd` | string | yes | — | Shell command to launch. Must be non-empty. |
| `label` | string | no | key name | Display name shown in the UI. |
| `cwd` | string | no | `root` | Working directory. Relative paths resolve from `root`. Supports `~`. Must exist. |
| `env` | map[string]string | no | — | Environment variables injected into the shell. |
| `display` | string | no | `header` | UI placement: `header` (main button row, default) or `footer` (terminal footer strip). `menu` is still accepted (legacy) but no longer suggested. `button` is a deprecated alias for `header`. |
| `confirm` | bool | no | false | Prompt before opening. |
| `reuse` | bool | no | false | Reuse the existing pane on next launch. |
| `inputs` | map[string]InputField | no | — | Named inputs prompted before opening. Values substitute `{{key}}` in `cmd`. |
| `actions` | map[string]Action | no | — | Nested sub-actions. Makes this a split-button or dropdown — see Action Groups. |

### Terminals are Actions under the hood

The `terminals:` block is sugar for actions with `type: terminal` defaulted in. The Go loader (`internal/config/config.go` `TerminalMap`) decodes each entry as an `Action` and sets `type = "terminal"` when it is not set explicitly. That means terminals support the full action field set:

- `confirm: true` — prompt before opening (e.g. for a REPL that touches production).
- `reuse: true` — reuse the existing pane on next launch instead of opening a new one.
- `inputs:` — prompt for values and substitute into `cmd` via `{{key}}`.
- `actions:` — nested sub-actions (split-button or dropdown — see Action Groups below).

Use `terminals:` when the intent is "persistent interactive shell". Drop a `type: terminal` entry into `actions:` when you want to mix one-shots and persistent shells together.

---

## Profiles

Named subsets of services. Start a profile with `lpm myapp -p <profile>`.

```yaml
profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend, worker]
```

Each service name must reference a service defined in `services`.

**The `default` profile is special.** When the user starts a project without picking a profile (`lpm myapp`), lpm uses the `default` profile if one is defined. If no profiles exist at all, lpm starts every service (sorted alphabetically for stable pane ordering).

---

## SSH Projects

Set `ssh:` instead of `root` to make a project remote. Services, actions, and terminals run on the host over a shared SSH ControlMaster connection (multiplexed for fast reconnects). Local `cwd` existence is **not** checked — those paths live on the remote host.

```yaml
name: prod-api
ssh:
  host: api.example.com
  user: deploy
  port: 22
  key: ~/.ssh/id_ed25519
  dir: ~/apps/api

services:
  worker: bin/worker
  api:
    cmd: bin/server
    port: 8080

actions:
  migrate:
    cmd: bin/rails db:migrate
    confirm: true
    display: header

terminals:
  remote-shell:
    cmd: bash -l
    display: header
```

### `ssh` Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `host` | string | yes | — | Remote hostname or IP. |
| `user` | string | yes | — | Login user. |
| `port` | int | no | `22` | TCP port. 0–65535. |
| `key` | string | no | — | Path to identity file. Supports `~`. Leave empty to use ssh-agent or `~/.ssh/config` defaults. |
| `dir` | string | no | — | Default remote working directory. Must be absolute or `~`-prefixed (resolved on the host). Action/terminal `cwd` paths resolve relative to this. |

### Connection Behavior

- lpm uses a ControlMaster socket at `/tmp/lpm-<uid>/cm-<hash>` with `ControlPersist=10m`, so multiple panes share one TCP/SSH connection per host.
- `cwd` on services, actions, and terminals is interpreted as a **remote** path. Relative values resolve from `ssh.dir`.
- A network drop affects every pane bound to that ControlMaster.

---

## SSH Action Modes

On SSH projects, every action has an effective `mode`:

- **`remote`** (default) — runs the command on the host over SSH. Output streams back to the local pane.
- **`sync`** — lpm rsyncs `ssh.dir` into a local mirror (under your home), runs the action **locally** in that mirror, then rsyncs changes back. Use this when you want local tooling to act on remote files (local Claude Code, IDE refactors, codegen, `prettier --write` over a large repo).

```yaml
ssh:
  host: api.example.com
  user: deploy
  dir: ~/apps/api

actions:
  remote-tests:
    cmd: bin/rspec
    # mode: remote (default) — runs on the host

  claude:
    cmd: claude
    label: Claude (local)
    type: terminal
    mode: sync       # rsync down, run locally, rsync back

  format:
    cmd: prettier --write .
    mode: sync
    display: footer
```

`mode: sync` is rejected on local projects (no `ssh:` block) — lpm will refuse to load the config. `sync` requires `rsync` available both locally and on the host.

Children of an action group inherit `mode` from the parent unless they set their own.

---

## Duplicate Projects

A duplicate project inherits **all** services, actions, terminals, and profiles from a parent project. Use this when you want the same project config but with a different `root` directory (e.g., multiple checkouts of the same repo, or a branch worktree):

```yaml
name: myapp-v2
root: ~/Projects/myapp-v2
parent_name: myapp
```

The duplicate loads the parent's full config but uses its own `root` and `name`. You cannot override individual services in a duplicate — it's all-or-nothing inheritance from the parent.

---

## Global Config

Location: `~/.lpm/global.yml`

Supports `actions` and `terminals` only (no `services`, `profiles`, `name`, or `root`). Entries here are available in every project. When a project defines an entry with the same key, the project-level entry wins.

Global entries support the full action/terminal field set — `display` (including `footer`), `confirm`, `type` (including `type: background`), `reuse`, `inputs`, and nested `actions`. There is no stripped-down subset. `mode` is accepted but only meaningful when the entry is invoked from an SSH project.

```yaml
actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true
    display: header

  fetch-all:
    cmd: git fetch --all --prune
    label: Fetch All
    type: background

terminals:
  htop:
    cmd: htop
    label: System
    display: header

  claude:
    cmd: claude
    label: Claude Code
```

---

## Path Resolution

- `~` expands to the user's home directory.
- Relative `cwd` paths resolve relative to the project's `root`.
- Absolute paths are used as-is.
- All `cwd` paths **must point to existing directories** — lpm validates on load.

---

## Naming Keys

- Use short, lowercase, hyphen-separated identifiers: `db-migrate`, `run-tests`, `redis-cli`.
- The key is used as the CLI argument in `lpm run <project> <key>`.

## Shorthand vs Full Form

- **Shorthand**: the command is self-explanatory, runs from root, needs no env vars or confirmation.
- **Full form**: you need `cwd`, `env`, `confirm`, `display`, `type`, `reuse`, `mode`, `inputs`, or a human-friendly `label`.

## Picking a `display` Value

| Value | Where it shows | Use for |
|-------|----------------|---------|
| `header` (default) | Main button row in the project view | The default — anything you want one click away. Omit `display` to get this. |
| `footer` | Strip at the bottom of the terminal pane, next to the branch switcher | Tight, always-one-click controls — quick-format, redeploy, run-tests. Footer entries render compact and accept split-buttons. |
| `menu` *(legacy)* | Overflow `⋮` menu | Tucked away. Still accepted at runtime but no longer suggested by autocomplete; may be deprecated. |
| `button` *(deprecated alias)* | — | Editor flags it as an error and asks you to switch to `header`. |

---

## Validation

lpm validates config on load:

1. The project has either `root` or `ssh:` (but not both). When `ssh:` is set, `host` and `user` are non-empty, `port` is in 0–65535, and `dir` is absolute or `~`-prefixed.
2. At least one service is defined (unless it's a duplicate with `parent_name`).
3. All `cmd` fields are non-empty strings. Actions (and terminals) with nested `actions` may omit `cmd`.
4. All `cwd` paths on local projects point to existing directories. SSH projects skip local cwd checks because `cwd` is a remote path.
5. Ports are in range 0–65535 with no duplicates across services.
6. `display` is `header` (default) or `footer`. `menu` is still accepted as a legacy value; `button` is a deprecated alias for `header` (flagged as an error in the editor).
7. `mode` is `remote` or `sync` (or omitted). `mode: sync` is rejected on local projects.
8. Profile entries reference defined services.
9. Nested sub-actions are validated recursively (cmd required if no children, cwd must exist on local projects, mode validated the same way).
10. `parent_name` must reference an existing, loadable project.

---

## Complete Example

```yaml
name: myapp
root: ~/Projects/myapp
label: My Application

services:
  api:
    cmd: go run ./cmd/server
    cwd: ./backend
    port: 8080
    env:
      DATABASE_URL: postgres://localhost/myapp
  worker:
    cmd: celery -A backend worker
    cwd: ./backend
  frontend:
    cmd: npm run dev
    cwd: ./frontend
    port: 3000

actions:
  test: go test ./...

  test-frontend:
    cmd: npm test
    cwd: ./frontend
    label: Frontend Tests
    display: header

  deploy:
    cmd: ./scripts/deploy.sh --env {{env}}
    label: Deploy
    confirm: true
    inputs:
      env:
        type: radio
        label: Target Environment
        required: true
        default: staging
        options:
          - label: Staging
            value: staging
          - label: Production
            value: production

  database:
    label: Database
    cwd: ./backend
    env:
      DATABASE_URL: postgres://localhost/myapp
    actions:
      migrate:
        cmd: rails db:migrate
        label: Run Migrations
        confirm: true
      seed:
        cmd: rails db:seed
        label: Seed Data
      reset:
        cmd: rails db:reset
        label: Reset Database
        confirm: true

  logs:
    cmd: tail -f /var/log/myapp/app.log
    type: terminal
    reuse: true
    label: Tail Logs
    display: header

  lint:
    cmd: golangci-lint run ./...
    cwd: ./backend
    label: Lint Backend

  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true

terminals:
  console: rails console

  psql:
    cmd: psql myapp_dev
    label: Database
    cwd: ./backend
    display: header

  redis:
    cmd: redis-cli
    label: Redis CLI
    display: header

profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend, worker]
```
