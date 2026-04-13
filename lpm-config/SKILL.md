---
name: lpm-config
description: Create, modify, and delete lpm (Local Project Manager) project configs at ~/.lpm/projects/*.yml. Use whenever the user mentions lpm, asks to set up lpm, create/edit/delete an lpm config, add or remove services, actions, or terminals from lpm, or says "lpm setup", "create lpm config", "add service to lpm", "configure lpm". Also use when the user wants to manage dev project processes, one-shot commands, or interactive terminals through YAML config files.
---

## Instructions

Use this skill to create, modify, and delete [lpm](https://lpm.cx) (Local Project Manager) YAML configuration files. lpm is a CLI + macOS app that manages long-running services, one-shot commands (actions), and interactive terminals for dev projects.

For the full YAML field reference, see [YAML Schema Reference](references/yaml-schema.md).

### Installation

**Install lpm** (if not already installed):
```bash
curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
```

**Install this skill** via [skills.sh](https://skills.sh):
```bash
# Into your project (committed with code)
npx skills add Darmikon/lpm -s lpm-config

# Or globally (available everywhere)
npx skills add Darmikon/lpm -s lpm-config -g
```

**tmux** is required by lpm:
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
| "I want a button that runs X" | **Modify** — add action or terminal with `display: button` |
| "add a log viewer", "add a watcher" | **Modify** — likely a terminal action with `type: terminal` and `reuse: true` |
| "group these actions together" | **Modify** — create an action group with nested `actions` |
| "duplicate this project for another directory" | **Create** — use `parent_name` for a duplicate project |

### How to Use

**Step 1: Check that lpm is installed**

```bash
command -v lpm
```

If not found, run the install command from Installation above.

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
3. Use the **Smart Guidance** section below to ask the right follow-up questions.
4. Validate all fields (see Validation below).
5. Write the updated config back.

**Delete:**
1. Confirm with the user before removing.
2. Run: `rm ~/.lpm/projects/<name>.yml`

### Smart Guidance

When the user asks to add something, ask follow-up questions to pick the right config shape. Don't dump all options — ask only what's relevant.

**"Add a button / action that does X"**

1. Is it a long-running/interactive process (log tailer, watcher, REPL) or a one-shot command (test, deploy, migrate)?
   - **Long-running/interactive** → ask: "Should this always reuse the same terminal pane, or open a new one each time?"
     - Reuse → `type: terminal`, `reuse: true`
     - New each time → `type: terminal` (no `reuse`)
   - **One-shot** → regular action
2. Should it be a visible button or in the menu?
   - Frequently used → `display: button`
   - Occasional → leave default (`menu`)
3. Is it destructive? → `confirm: true`

**"Add a terminal / shell / console"**

→ Goes in `terminals` section. Ask:
- Should it be a visible button or menu item?

**"This action needs parameters"**

→ Add `inputs`. Ask:
- What parameters? (name, label, type)
- Are any required?
- Should any be a selection from fixed options? → `type: radio` with `options`
- Any defaults?

**"Group related actions together"**

→ Create an action group with nested `actions`. Ask:
- What's the group name/label?
- Do the sub-actions share a working directory or env vars? → Set on parent, children inherit.

**"Set up the same project for another directory"**

→ Create a duplicate with `parent_name`. Only needs `name`, `root`, and `parent_name`.

### Output

Config files are written to `~/.lpm/projects/<name>.yml`. Global config at `~/.lpm/global.yml` supports only `actions` and `terminals`. Project-level entries take precedence when names collide.

**Config structure:**

```yaml
name: <string>           # required — project identifier
root: <path>             # required — project root (supports ~)
label: <string>          # optional — display name in UI
parent_name: <string>    # optional — duplicate from parent project

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
    cmd: <string>        # required (unless nested actions)
    label: <string>      # optional — display name in UI
    cwd: <path>          # optional
    env: {}              # optional
    confirm: <bool>      # optional (default: false)
    display: <string>    # optional (button | menu, default: menu)
    type: <string>       # optional — set to "terminal" for terminal pane
    reuse: <bool>        # optional — reuse same terminal pane
    inputs: {}           # optional — user-prompted parameters
    actions: {}          # optional — nested sub-actions (action group)

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
- Full form when you need `cwd`, `env`, `confirm`, `display: button`, `type`, `reuse`, `inputs`, or a `label`.
- Set `confirm: true` on destructive actions (migrations, deploys, cleanup).
- Set `display: button` on frequently-used actions/terminals.
- Use `type: terminal` + `reuse: true` for commands that should stay in one persistent pane (log tailers, watchers).
- Use action groups (nested `actions`) to organize related commands under one parent — children inherit `cwd` and `env`.
- Use `parent_name` to duplicate a project config for a different root directory.
- Keys: short, lowercase, hyphen-separated (`db-migrate`, `run-tests`).
- `~` expands to home. Relative `cwd` resolves from `root`. All `cwd` must exist.

**Validation — verify before writing any config:**
- `name` and `root` are set
- At least one service is defined (unless `parent_name` is set)
- All `cmd` fields are non-empty strings (actions with nested `actions` may omit `cmd`)
- All `cwd` paths point to existing directories
- All ports are in range 0–65535 with no duplicates
- `display` values are only `button` or `menu`
- `confirm` is only used on actions (not terminals)
- Profile entries reference defined services
- Nested sub-actions are validated recursively
- `parent_name` references an existing project

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

**Example 2: Full config with new features**
```yaml
name: myapp
root: ~/Projects/myapp
label: My Application

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
          - staging
          - production

  database:
    label: Database
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

  logs:
    cmd: tail -f /var/log/myapp/app.log
    type: terminal
    reuse: true
    label: Tail Logs
    display: button

terminals:
  psql:
    cmd: psql myapp_dev
    label: Database
    display: button

profiles:
  frontend-only: [frontend]
  full-stack:    [api, frontend]
```

**Example 3: Add a terminal action with reuse**
```
User: Add a button that shows logs and always uses the same terminal
Agent: [reads config, adds action]

       Added to ~/.lpm/projects/myapp.yml:
       actions.logs:
         cmd: tail -f /var/log/myapp/app.log
         type: terminal
         reuse: true
         label: Tail Logs
         display: button
```

**Example 4: Add an action group**
```
User: Group the database commands together
Agent: [reads config, creates action group]

       Grouped in ~/.lpm/projects/myapp.yml:
       actions.database:
         label: Database
         cwd: ./backend
         actions:
           migrate, seed, reset
```

**Example 5: Create a duplicate project**
```
User: I have a second checkout of myapp at ~/Projects/myapp-v2, set it up in lpm
Agent: I'll create a duplicate config pointing to the existing myapp config.

       Created ~/.lpm/projects/myapp-v2.yml:
         parent_name: myapp
         root: ~/Projects/myapp-v2
```

Output:
```yaml
name: myapp-v2
root: ~/Projects/myapp-v2
parent_name: myapp
```

**Example 6: Add an action with user inputs**
```
User: Add a deploy action that asks which environment to deploy to
Agent: [adds action with inputs]

       Added to ~/.lpm/projects/myapp.yml:
       actions.deploy:
         cmd: ./scripts/deploy.sh --env {{env}}
         confirm: true
         inputs:
           env (radio): staging, production
```

**Example 7: Delete a config**
```
User: Remove lpm config for myapp
Agent: Delete ~/.lpm/projects/myapp.yml? This will remove the project from lpm.
User: Yes
Agent: Deleted ~/.lpm/projects/myapp.yml
```

## Limitations

- Project names must be lowercase with no slashes; cannot be `.` or `..`
- All `cwd` paths must point to existing directories — lpm validates on load
- Ports must be in range 0–65535 and unique across services
- Global config only supports `actions` and `terminals` — no services or profiles
- `confirm` field is only valid on actions, not terminals
- `type` and `reuse` fields are only valid on actions, not terminals
- Duplicate projects (`parent_name`) inherit everything — you cannot override individual entries
