---
name: lpm-config
description: Create, modify, and delete lpm (Local Project Manager) project configs at ~/.lpm/projects/*.yml. Use whenever the user mentions lpm, asks to set up lpm, create/edit/delete an lpm config, add or remove services, actions, or terminals from lpm, or says "lpm setup", "create lpm config", "add service to lpm", "configure lpm". Also trigger when the user wants to add a button or menu action to run commands, manage dev project processes, start/stop multiple services together, group related commands, set up one-shot commands with confirmation prompts, or configure interactive terminal shells through YAML config files. If the user has lpm installed (~/.lpm/ exists), this skill applies to any request about managing project workflows.
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
# Interactive — shows available skills
npx skills add gug007/lpm

# Or install directly
npx skills add gug007/lpm -s lpm-config

# Install globally (available everywhere)
npx skills add gug007/lpm -s lpm-config -g

# Update to latest version
npx skills update lpm-config
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
| "make it reuse the same terminal", "only one terminal" | **Modify** — set `type: terminal` + `reuse: true` on the action |
| "rename the button", "change the label" | **Modify** — update `label` field on the action/terminal |
| "add a button with a dropdown of actions" | **Modify** — action group with `display: button` and nested `actions` |
| "when I click it, give me options to choose" | **Modify** — could be `inputs` (radio options before running) or an action group (sub-actions). Ask the user which they mean. |
| "group these actions together" | **Modify** — create an action group with nested `actions` |
| "duplicate this project for another directory" | **Create** — use `parent_name` for a duplicate project |
| "make it run in background", "notify when done", "run silently" | **Modify** — add action with `type: background` |
| "button with a default and alternatives" | **Modify** — split-button action group (parent `cmd` + nested `actions`) |
| "dropdown of related commands", "menu of sub-actions" | **Modify** — dropdown-only action group (nested `actions`, no parent `cmd`) |

### How to Use

**Step 1: Check that lpm is installed**

```bash
command -v lpm
```

If not found, run the install command from Installation above.

**Step 2: Pick the target project file**

Work out which `~/.lpm/projects/<name>.yml` to edit *before* asking the user anything. Use the cwd as the primary signal.

1. Get the current working directory: `pwd`.
2. List existing projects: `ls ~/.lpm/projects/*.yml` (empty is fine).
3. For each project file, read its `root:` line (expand `~` to `$HOME`). A one-liner that works:

   ```bash
   for f in ~/.lpm/projects/*.yml; do
     [ -f "$f" ] || continue
     name=$(basename "$f" .yml)
     root=$(awk '/^root:/ {print $2; exit}' "$f" | sed "s|^~|$HOME|")
     printf '%s\t%s\n' "$name" "$root"
   done
   ```

4. Match cwd against each `root`:
   - Exact match (`cwd == root`) wins outright.
   - Otherwise, any `root` that is a path-component prefix of `cwd` is a candidate. **Longest prefix wins.**

5. Act on the match count:

   | Matches | What to do |
   |---------|-----------|
   | 1 | **Silently** edit `~/.lpm/projects/<name>.yml`. No "I'll edit X" line, no confirmation. Apply the change and write the file. |
   | ≥2 | Ask once: *"cwd is inside multiple lpm projects (`a`, `b`). Which one?"* |
   | 0 | Offer two options in the same reply: (1) create a new project for this cwd (`lpm init` or from scratch), (2) pick an existing project by name — list every `~/.lpm/projects/*.yml`. |

**Overrides (these win over cwd detection):**
- The user names a project explicitly ("add a service to `myapp`") → use that name.
- The user says "globally" / "to all my projects" / "для всех проектов" → write to `~/.lpm/global.yml` instead.

**Confirmations** are kept only for deleting a config file or overwriting an existing one during a Create flow. Never confirm the target on a single-match cwd.

**Step 3: Execute the operation**

**Create:**
1. Check if a config already exists at `~/.lpm/projects/<name>.yml` — if so, confirm with the user before overwriting (or switch to **Modify** flow).
2. Read [YAML Schema Reference](references/yaml-schema.md) for the full field reference.
3. Consider using `lpm init` first — it auto-detects services for Rails, Next.js, Go, Django, Flask, Docker Compose, and more. You can then read the generated config and refine it rather than writing from scratch.
4. If writing from scratch, analyze the project directory to discover:
   - **Services** — look at `package.json` scripts, `Makefile`, `docker-compose.yml`, `Procfile`, `mise.toml` for long-running processes (dev servers, watchers, workers).
   - **Actions** — one-shot commands: test, lint, build, migrate, deploy scripts.
   - **Terminals** — interactive shells: database consoles, REPLs, log tailers.
   - **Profiles** — logical groupings of services (frontend-only, full-stack, etc.).
5. Create directory if needed: `mkdir -p ~/.lpm/projects`
6. Write the config at `~/.lpm/projects/<name>.yml`.

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

**"Make it run in the background / only tell me when it's done"**

→ Add the action with `type: background`. The command runs hidden and lpm shows a toast on completion. Common fits: builds, migrations, `docker pull`, `git fetch`, dependency installs. Pair with `confirm: true` when it's destructive.

**"Button with a default action plus alternatives" (split button)**

→ Action group with `cmd` on the parent AND nested `actions`. Main click runs the parent's command; chevron opens the children. Example: `deploy` that defaults to staging with production/preview tucked behind it.

**"Dropdown of related commands" (dropdown-only)**

→ Action group with nested `actions` but no parent `cmd`. The whole button opens the menu. Example: a `database` button that expands into migrate / seed / reset.

**"Add a terminal / shell / console"**

→ Goes in `terminals` section. Ask:
- Should it be a visible button or menu item?

**"This action needs parameters"**

→ Add `inputs`. Ask:
- What parameters? (name, label, type)
- Are any required?
- Should any be a selection from fixed options? → `type: radio` with `options`
- Any defaults?

**"Add a button with a dropdown" / "button with options"**

This is ambiguous — clarify what the user means:
- **"When I click, I see a list of sub-actions to pick from"** → dropdown-only action group (nested `actions`, no parent `cmd`) with `display: button`.
- **"When I click, the default runs, but I can pick an alternative from a chevron"** → split-button action group (parent `cmd` + nested `actions`) with `display: button`.
- **"When I click, it asks me for a parameter then runs"** → single action with `inputs` (e.g. `type: radio` for fixed choices) and `display: button`.

Ask: "Should the button run a default command with alternatives behind a chevron (split button), open a menu of commands (dropdown), or prompt for a parameter before running (inputs)?"

**"Group related actions together"**

→ Create an action group with nested `actions`. Ask:
- What's the group name/label?
- Do the sub-actions share a working directory or env vars? → Set on parent, children inherit.

**"Rename a button" / "change the label"**

→ Update the `label` field on the action or terminal. Read the existing config, find the entry, set or change `label`.

**"Set up the same project for another directory"**

→ Create a duplicate with `parent_name`. Only needs `name`, `root`, and `parent_name`.

**"Add this action/terminal to all my projects"**

→ Goes in the global config at `~/.lpm/global.yml`. It supports `actions` and `terminals` only (no `services`, `profiles`, `name`, or `root`), but both of those carry the full field set — `display`, `confirm`, `type` (including `type: background`), `reuse`, `inputs`, and nested `actions`. Project-level entries with the same key take precedence.

### Output

Config files are written to `~/.lpm/projects/<name>.yml`. Global config at `~/.lpm/global.yml` supports only `actions` and `terminals`. Project-level entries take precedence when names collide.

**Config structure:**

```yaml
name: <string>           # optional — defaults to the config filename
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
    type: <string>       # optional — "terminal" (pane) or "background" (hidden + toast)
    reuse: <bool>        # optional — reuse same terminal pane
    inputs: {}           # optional — user-prompted parameters
    actions: {}          # optional — nested sub-actions (action group)

terminals:               # optional — interactive shells (sugar for actions with type: terminal)
  <key>: <cmd>           # shorthand
  <key>:                 # full form — supports the same fields as actions
    cmd: <string>        # required (unless nested actions)
    label: <string>      # optional
    cwd: <path>          # optional
    env: {}              # optional
    display: <string>    # optional (button | menu, default: menu)
    confirm: <bool>      # optional
    reuse: <bool>        # optional — reuse the existing pane on next launch
    inputs: {}           # optional — prompted parameters
    actions: {}          # optional — nested sub-actions (split-button or dropdown)

profiles:                # optional — named service subsets
  <key>: [<service>, ...]
```

**Key rules:**
- Shorthand (`test: go test ./...`) when the command needs no options.
- Full form when you need `cwd`, `env`, `confirm`, `display: button`, `type`, `reuse`, `inputs`, or a `label`.
- Set `confirm: true` on destructive actions (migrations, deploys, cleanup).
- Set `display: button` on frequently-used actions/terminals.
- Use `type: terminal` + `reuse: true` for commands that should stay in one persistent pane (log tailers, watchers).
- Use `type: background` for slow commands you want to fire and forget — lpm shows a toast when they finish.
- Action groups: parent `cmd` + nested `actions` renders as a split button; nested `actions` alone renders as a dropdown. Children inherit `cwd` and `env`.
- Use `parent_name` to duplicate a project config for a different root directory.
- Keys: short, lowercase, hyphen-separated (`db-migrate`, `run-tests`).
- `~` expands to home. Relative `cwd` resolves from `root`. All `cwd` must exist.

**Validation — verify before writing any config:**
- `root` is set (`name` is optional — defaults to the config filename)
- At least one service is defined (unless `parent_name` is set)
- All `cmd` fields are non-empty strings (actions or terminals with nested `actions` may omit `cmd`)
- All `cwd` paths point to existing directories
- All ports are in range 0–65535 with no duplicates across services
- `display` values are only `button` or `menu`
- `type` values are only `terminal` or `background` (or omitted)
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
- Global config only supports `actions` and `terminals` — no services, profiles, name, or root
- Duplicate projects (`parent_name`) inherit everything — you cannot override individual entries
