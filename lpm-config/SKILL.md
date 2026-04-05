---
name: lpm-config
description: >-
  Create, modify, and delete lpm project configs. Use when the user asks to
  set up lpm, add/remove services, actions, or terminals, or manage
  ~/.lpm/projects/*.yml files. Triggers on "lpm", "create lpm config",
  "add service to lpm", "lpm setup".
license: MIT
compatibility: Claude Code, Cursor, Windsurf, Copilot CLI, Gemini CLI
metadata:
  author: gug007
  version: "1.0.0"
---

# lpm Config Skill

Manages [lpm](https://lpm.cx) (Local Project Manager) YAML configuration files.

For the full YAML field reference, see [YAML Schema Reference](references/yaml-schema.md).

---

## Step 0: Ensure lpm Is Installed

Before any config operation, check if lpm is available:

```bash
command -v lpm
```

If not found, install it:

```bash
curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
```

lpm requires **tmux**. If tmux is missing, install it:

```bash
# macOS
brew install tmux

# Debian/Ubuntu
sudo apt install tmux
```

---

## Step 1: Determine the Operation

| User intent | Operation |
|-------------|-----------|
| "create lpm config", "set up lpm for this project" | **Create** a new config file |
| "add service/action/terminal to lpm" | **Modify** an existing config |
| "change/update lpm config" | **Modify** an existing config |
| "remove/delete lpm config" | **Delete** a config file |
| "remove action/service/terminal from lpm" | **Modify** — remove a section entry |

---

## Step 2: Determine the Project Name

1. **Default** — use the current project directory name (basename of `root` or `cwd`).
2. **Always confirm** with the user before creating or modifying:
   > I'll create lpm config as `~/.lpm/projects/<name>.yml` — is that name good, or would you prefer something else?
3. If the user provides a different name, use that instead.
4. If modifying an existing config, check `~/.lpm/projects/` for the matching file first.

---

## Step 3: Execute the Operation

### Create

1. Read [YAML Schema Reference](references/yaml-schema.md) for the full field reference.
2. Analyze the project directory to discover:
   - **Services** — look at `package.json` scripts, `Makefile`, `docker-compose.yml`, `Procfile`, `mise.toml`, workspace configs for long-running processes (dev servers, watchers, workers).
   - **Actions** — one-shot commands: test, lint, build, migrate, deploy scripts.
   - **Terminals** — interactive shells: database consoles, REPLs, log tailers.
   - **Profiles** — logical groupings of services (frontend-only, full-stack, etc.).
3. Create `~/.lpm/projects/` directory if it doesn't exist:
   ```bash
   mkdir -p ~/.lpm/projects
   ```
4. Write the config file at `~/.lpm/projects/<name>.yml` with the standard section order: `name`, `root`, `services`, `actions`, `terminals`, `profiles`.

### Modify

1. Read the existing config: `~/.lpm/projects/<name>.yml`.
2. Read [YAML Schema Reference](references/yaml-schema.md) for field reference if needed.
3. Apply the requested changes (add/update/remove entries).
4. Validate:
   - Every `cmd` is non-empty.
   - Every `cwd` points to an existing directory.
   - Ports are unique and in range 0–65535.
   - Profile entries reference existing services.
   - At least one service remains after modification.
5. Write the updated config back.

### Delete

1. Confirm with the user:
   > Delete `~/.lpm/projects/<name>.yml`? This will remove the project from lpm.
2. Remove the file:
   ```bash
   rm ~/.lpm/projects/<name>.yml
   ```

---

## Config File Locations

| Config type | Path |
|-------------|------|
| Project config | `~/.lpm/projects/<name>.yml` |
| Global config | `~/.lpm/global.yml` (only `actions` and `terminals`) |

Project-level entries take precedence over global when names collide.

---

## Config Structure Quick Reference

```yaml
name: <string>           # required — project identifier
root: <path>             # required — project root (supports ~)

services:                # required — at least one
  <key>: <cmd>           # shorthand
  <key>:                 # full form
    cmd: <string>        # required
    cwd: <path>          # optional
    port: <int>          # optional (0-65535, unique)
    env: {}              # optional
    profiles: []         # optional

actions:                 # optional — one-shot commands
  <key>: <cmd>           # shorthand
  <key>:                 # full form
    cmd: <string>        # required
    label: <string>      # optional — display name in UI
    cwd: <path>          # optional
    env: {}              # optional
    confirm: <bool>      # optional (default: false)
    display: <string>    # optional (button | menu, default: menu)

terminals:               # optional — interactive shells
  <key>: <cmd>           # shorthand
  <key>:                 # full form
    cmd: <string>        # required
    label: <string>      # optional
    cwd: <path>          # optional
    env: {}              # optional
    display: <string>    # optional (button | menu, default: menu)

profiles:                # optional — named service subsets
  <key>: [<service>, ...]
```

---

## Validation Checklist

Before writing any config, verify:

- `name` and `root` are set
- At least one service is defined
- All `cmd` fields are non-empty strings
- All `cwd` paths point to existing directories
- All ports are in range 0–65535 with no duplicates
- `display` values are only `button` or `menu`
- `confirm` is only used on actions (not terminals)
- Profile entries reference defined services
- Global config (`~/.lpm/global.yml`) only has `actions` and `terminals`

---

## Key Rules

- **Shorthand** (`test: go test ./...`) when the command needs no options.
- **Full form** when you need `cwd`, `env`, `confirm`, `display: button`, or a `label`.
- Set `confirm: true` on destructive actions (migrations, deploys, cleanup commands).
- Set `display: button` on frequently-used actions/terminals (tests, database console).
- Keys are short, lowercase, hyphen-separated: `db-migrate`, `run-tests`, `redis-cli`.
- `~` expands to home. Relative `cwd` resolves from `root`. All `cwd` must exist.

---

## Examples

### Minimal

```yaml
name: my-api
root: ~/Projects/my-api

services:
  server: npm run dev
```

### Full project

```yaml
name: myapp
root: ~/Projects/myapp

services:
  api:
    cmd: go run ./cmd/server
    cwd: ./backend
    port: 8080
    env:
      DATABASE_URL: postgres://localhost/myapp
  frontend:
    cmd: npm run dev
    cwd: ./frontend
    port: 3000
  worker:
    cmd: celery -A backend worker
    cwd: ./backend

actions:
  test:
    cmd: go test ./...
    cwd: ./backend
    display: button
  migrate:
    cmd: rails db:migrate
    cwd: ./backend
    label: Run Migrations
    confirm: true
  lint: npm run lint

terminals:
  psql:
    cmd: psql myapp_dev
    label: Database
    display: button
  console: rails console

profiles:
  frontend-only:
    - frontend
  full-stack:
    - api
    - frontend
    - worker
```
