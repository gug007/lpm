---
name: lpm-config
description: Create, modify, and delete lpm (Local Project Manager) project configs at ~/.lpm/projects/*.yml. Use whenever the user mentions lpm, asks to set up lpm, create/edit/delete an lpm config, add or remove services, actions, or terminals from lpm, or says "lpm setup", "create lpm config", "add service to lpm", "configure lpm". Also use when the user wants to manage dev project processes, one-shot commands, or interactive terminals through YAML config files.
---

## Instructions

Use this skill to create, modify, and delete [lpm](https://lpm.cx) (Local Project Manager) YAML configuration files. lpm is a CLI + macOS app that manages long-running services, one-shot commands (actions), and interactive terminals for dev projects.

For the full YAML field reference, see [YAML Schema Reference](references/yaml-schema.md).

### Prerequisites

- **lpm** must be installed. If not found, install it:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
  ```
- **tmux** is required by lpm:
  ```bash
  # macOS
  brew install tmux
  # Debian/Ubuntu
  sudo apt install tmux
  ```

### When to Use

| User intent | Operation |
|-------------|-----------|
| "create lpm config", "set up lpm for this project" | **Create** a new config file |
| "add service/action/terminal to lpm" | **Modify** an existing config |
| "change/update lpm config" | **Modify** an existing config |
| "remove/delete lpm config" | **Delete** a config file |
| "remove action/service/terminal from lpm" | **Modify** — remove a section entry |

### How to Use

**Step 1: Check that lpm is installed**

```bash
command -v lpm
```

If not found, run the install command from Prerequisites above.

**Step 2: Determine the project name**

1. Default — use the current project directory name (basename of `root` or `cwd`).
2. Always confirm with the user before creating or modifying:
   > I'll create lpm config as `~/.lpm/projects/<name>.yml` — is that name good, or would you prefer something else?
3. If the user provides a different name, use that instead.
4. If modifying an existing config, check `~/.lpm/projects/` for the matching file first.

**Step 3: Execute the operation**

**Create:**
1. Read [YAML Schema Reference](references/yaml-schema.md) for the full field reference.
2. Analyze the project directory to discover:
   - **Services** — look at `package.json` scripts, `Makefile`, `docker-compose.yml`, `Procfile`, `mise.toml` for long-running processes (dev servers, watchers, workers).
   - **Actions** — one-shot commands: test, lint, build, migrate, deploy scripts.
   - **Terminals** — interactive shells: database consoles, REPLs, log tailers.
   - **Profiles** — logical groupings of services (frontend-only, full-stack, etc.).
3. Create directory if needed: `mkdir -p ~/.lpm/projects`
4. Write the config at `~/.lpm/projects/<name>.yml`.

**Modify:**
1. Read the existing config: `~/.lpm/projects/<name>.yml`.
2. Apply the requested changes (add/update/remove entries).
3. Validate all fields (see Validation below).
4. Write the updated config back.

**Delete:**
1. Confirm with the user before removing.
2. Run: `rm ~/.lpm/projects/<name>.yml`

### Output

Config files are written to `~/.lpm/projects/<name>.yml`. Global config at `~/.lpm/global.yml` supports only `actions` and `terminals`. Project-level entries take precedence when names collide.

**Config structure:**

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

**Key rules:**
- Shorthand (`test: go test ./...`) when the command needs no options.
- Full form when you need `cwd`, `env`, `confirm`, `display: button`, or a `label`.
- Set `confirm: true` on destructive actions (migrations, deploys, cleanup).
- Set `display: button` on frequently-used actions/terminals.
- Keys: short, lowercase, hyphen-separated (`db-migrate`, `run-tests`).
- `~` expands to home. Relative `cwd` resolves from `root`. All `cwd` must exist.

**Validation — verify before writing any config:**
- `name` and `root` are set
- At least one service is defined
- All `cmd` fields are non-empty strings
- All `cwd` paths point to existing directories
- All ports are in range 0–65535 with no duplicates
- `display` values are only `button` or `menu`
- `confirm` is only used on actions (not terminals)
- Profile entries reference defined services

## Examples

**Example 1: Create a minimal config**
```
User: Set up lpm for this project
Agent: I'll create lpm config as ~/.lpm/projects/my-api.yml — is that name good?
User: Yes
Agent: [analyzes project, writes config]

       Created ~/.lpm/projects/my-api.yml:
       - 1 service: dev server
       - 2 actions: test, lint
       - 1 terminal: database console
```

Minimal output:
```yaml
name: my-api
root: ~/Projects/my-api

services:
  server: npm run dev
```

**Example 2: Create a full config**
```
User: Create lpm config for this project with all services
Agent: [discovers services, actions, terminals from project files]
```

Full output:
```yaml
name: myapp
root: ~/Projects/myapp

services:
  api:
    cmd: go run ./cmd/server
    cwd: ./backend
    port: 8080
  frontend:
    cmd: npm run dev
    cwd: ./frontend
    port: 3000

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

terminals:
  psql:
    cmd: psql myapp_dev
    label: Database
    display: button

profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend]
```

**Example 3: Modify an existing config**
```
User: Add a redis terminal to lpm
Agent: [reads ~/.lpm/projects/myapp.yml, adds terminal, writes back]

       Added to ~/.lpm/projects/myapp.yml:
       terminals.redis:
         cmd: redis-cli
         label: Redis CLI
         display: button
```

**Example 4: Delete a config**
```
User: Remove lpm config for myapp
Agent: Delete ~/.lpm/projects/myapp.yml? This will remove the project from lpm.
User: Yes
Agent: Deleted ~/.lpm/projects/myapp.yml
```

## Limitations

- Skill names must be lowercase with hyphens only
- All `cwd` paths must point to existing directories — lpm validates on load
- Ports must be in range 0–65535 and unique across services
- Global config only supports `actions` and `terminals` — no services or profiles
- `confirm` field is only valid on actions, not terminals
