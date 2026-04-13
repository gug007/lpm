# lpm YAML Configuration — Full Schema Reference

Complete field reference for lpm project config files (`~/.lpm/projects/<name>.yml`).

## Full Config Structure

```yaml
name: <string>           # required — project identifier
root: <path>             # required — project root directory (supports ~)
label: <string>          # optional — display name in the UI
parent_name: <string>    # optional — name of parent project (creates a duplicate)
services: {}             # required — at least one service (omitted in duplicates)
actions: {}              # optional — one-shot commands or action groups
terminals: {}            # optional — persistent interactive shells
profiles: {}             # optional — named service subsets
```

---

## Project-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | yes | — | Project identifier. Lowercase, no slashes, not `.` or `..`. |
| `root` | string | yes | — | Project root directory. Supports `~`. |
| `label` | string | no | — | Display name shown in the UI (defaults to `name`). |
| `parent_name` | string | no | — | Name of a parent project. Creates a **duplicate** that inherits all services, actions, terminals, and profiles from the parent. See [Duplicate Projects](#duplicate-projects). |

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

Services also accept a sequence (list) instead of a mapping. Each entry must include a `name` field:

```yaml
services:
  - name: api
    cmd: go run .
    port: 8080
  - name: frontend
    cmd: npm run dev
    port: 3000
```

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
    display: button
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
    display: button
```

**When to use terminal actions vs terminals section:**
- Use `type: terminal` actions for commands you trigger on demand but want running in a visible pane (log tailers, watchers, REPLs you start via a button).
- Use the `terminals` section for always-available interactive shells (database consoles, Redis CLI).
- Set `reuse: true` when the command should always run in the same pane — prevents pane sprawl for things like log viewers.

### Action Groups (Nested Actions)

An action can contain nested sub-actions instead of (or in addition to) a `cmd`. Sub-actions inherit `cwd` and `env` from the parent, with child values taking precedence:

```yaml
actions:
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
```

Run a sub-action via CLI: `lpm run <project> database migrate`

In the UI, the parent action appears as a group with its children listed inside.

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cmd` | string | yes* | — | Shell command to execute. Must be non-empty. *Not required if `actions` (sub-actions) is set. |
| `label` | string | no | key name | Display name shown in the UI. |
| `cwd` | string | no | `root` | Working directory. Relative paths resolve from `root`. Supports `~`. Must exist. |
| `env` | map[string]string | no | — | Environment variables injected into the command. |
| `confirm` | bool | no | false | Prompt for confirmation before running. Use for destructive or irreversible commands. |
| `display` | string | no | `menu` | UI placement: `menu` (dropdown) or `button` (visible button). |
| `type` | string | no | — | Action type. Set to `terminal` to run in a terminal pane instead of as a background one-shot. |
| `reuse` | bool | no | false | When `type: terminal`, reuse the same terminal pane across runs instead of opening a new one. |
| `inputs` | map[string]InputField | no | — | Named inputs prompted before running. Values substitute `{{key}}` in `cmd`. |
| `actions` | map[string]Action | no | — | Nested sub-actions. Makes this an action group. See [Action Groups](#action-groups-nested-actions). |

### `display` Values

- **`menu`** (default) — action appears in a dropdown/overflow menu.
- **`button`** — action appears as a visible button. Use for frequently-used actions.

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
    display: button
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
| `display` | string | no | `menu` | UI placement: `menu` (dropdown) or `button` (visible button). |

### Key Difference from Actions

Terminals do **not** have `confirm`, `type`, `reuse`, `inputs`, or nested `actions` fields — they are interactive sessions, not one-shot commands.

---

## Profiles

Named subsets of services. Start a profile with `lpm myapp -p <profile>`.

```yaml
profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend, worker]
```

Each service name must reference a service defined in `services`.

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

Supports only `actions` and `terminals` (not services, profiles, name, or root). Project-level entries take precedence when names collide.

```yaml
actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true

terminals:
  htop: htop
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
- **Full form**: you need `cwd`, `env`, `confirm`, `display: button`, `type`, `reuse`, `inputs`, or a human-friendly `label`.

## When to Use `display: button`

Use for frequently-used items:
- Running tests
- Opening a database console
- Viewing logs
- Restarting a key service

Leave less frequent commands at the default `menu` to keep the UI clean.

---

## Validation

lpm validates config on load:

1. At least one service is defined (unless it's a duplicate with `parent_name`).
2. All `cmd` fields are non-empty strings. Actions with nested `actions` may omit `cmd`.
3. All `cwd` paths point to existing directories.
4. Ports are in range 0–65535 with no duplicates.
5. `display` is either `button` or `menu` (or omitted for default).
6. `confirm` is only valid on actions, not terminals.
7. Profile entries reference existing services.
8. Nested sub-actions are validated recursively (cmd required, cwd must exist).
9. `parent_name` must reference an existing, loadable project.

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
    display: button

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
    display: button

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
    display: button

  redis:
    cmd: redis-cli
    label: Redis CLI
    display: button

profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend, worker]
```
