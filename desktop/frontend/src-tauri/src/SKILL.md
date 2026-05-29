---
name: lpm-config
description: Create, modify, and delete lpm (Local Project Manager) project configs at ~/.lpm/projects/*.yml. Use whenever the user mentions lpm, asks to set up lpm, create/edit/delete an lpm config, add or remove services, actions, or terminals from lpm, or says "lpm setup", "create lpm config", "add service to lpm", "configure lpm". Also trigger when the user wants to add a button or menu action to run commands, manage dev project processes, start/stop multiple services together, group related commands, set up one-shot commands with confirmation prompts, or configure interactive terminal shells through YAML config files. Also triggers when the user wants a background/silent action, a split-button with a default plus alternatives, a dropdown menu of related commands, an action pinned to the terminal footer, an SSH/remote project, or a sync-mode action that mirrors a remote directory locally. Also triggers when the user asks to edit lpm config for the current directory (cwd) without naming a project. If the user has lpm installed (~/.lpm/ exists), this skill applies to any request about managing project workflows.
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
| "I want a button that runs X" | **Modify** — add action or terminal (defaults to `display: header`, the main button row) |
| "add a log viewer", "add a watcher" | **Modify** — likely a terminal action with `type: terminal` and `reuse: true` |
| "make it reuse the same terminal", "only one terminal" | **Modify** — set `type: terminal` + `reuse: true` on the action |
| "rename the button", "change the label" | **Modify** — update `label` field on the action/terminal |
| "add a button with a dropdown of actions" | **Modify** — action group with nested `actions` (defaults to `display: header`) |
| "when I click it, give me options to choose" | **Modify** — could be `inputs` (radio options before running) or an action group (sub-actions). Ask the user which they mean. |
| "group these actions together" | **Modify** — create an action group with nested `actions` |
| "duplicate this project for another directory" | **Create** — use `parent_name` for a duplicate project |
| "make it run in background", "notify when done", "run silently" | **Modify** — add action with `type: background` |
| "button with a default and alternatives" | **Modify** — split-button action group (parent `cmd` + nested `actions`) |
| "dropdown of related commands", "menu of sub-actions" | **Modify** — dropdown-only action group (nested `actions`, no parent `cmd`) |
| "pin this to the terminal footer", "tiny button next to the branch switcher" | **Modify** — set `display: footer` on the action/terminal |
| "set up a remote project over ssh", "lpm for this server", "manage services on a remote host" | **Create** — SSH project (use `ssh:` block, omit `root`) |
| "run this action locally against the remote files", "rsync the remote dir and run it locally", "let my local Claude Code touch the remote repo" | **Modify** — set `mode: sync` on the action (SSH projects only) |

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
2. Where should it appear?
   - Default — header button row (omit `display`, or set `display: header`)
   - Compact strip at the bottom of the terminal pane → `display: footer`
   - Hidden in the overflow menu (legacy) → `display: menu`
3. Is it destructive? → `confirm: true`

**"Make it run in the background / only tell me when it's done"**

→ Add the action with `type: background`. The command runs hidden and lpm shows a toast on completion. Common fits: builds, migrations, `docker pull`, `git fetch`, dependency installs. Pair with `confirm: true` when it's destructive.

**"Pin it to the terminal footer / right next to the branch switcher"**

→ Set `display: footer`. The action renders as a compact button in the strip at the bottom of the terminal pane. Use for tight, frequently-used controls (quick-test, redeploy, format) that should always be one click away without taking space in the main button row. Footer also accepts split buttons (parent `cmd` + nested `actions`).

**"Set up a remote project over SSH"**

→ Create a project with an `ssh:` block instead of `root`. Required: `host`, `user`. Optional: `port` (defaults to 22), `key` (identity file path), `dir` (default remote working directory — must be absolute or `~`-prefixed). All services, actions, and terminals run on the remote host over a shared SSH ControlMaster connection. `cwd` values are interpreted as remote paths and are **not** validated locally.

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
```

**"Run this action locally against the remote files" (SSH sync mode)**

→ On SSH projects, set `mode: sync` on the action. lpm rsyncs `ssh.dir` into a local mirror, runs the action locally, then rsyncs changes back. Useful for local tooling that needs filesystem access to the remote repo (local Claude Code, IDE refactors, `prettier --write`, codegen). Default is `mode: remote` (run over SSH on the host) — `sync` is rejected on local projects.

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
- **"When I click, I see a list of sub-actions to pick from"** → dropdown-only action group (nested `actions`, no parent `cmd`). Defaults to the header.
- **"When I click, the default runs, but I can pick an alternative from a chevron"** → split-button action group (parent `cmd` + nested `actions`). Defaults to the header.
- **"When I click, it asks me for a parameter then runs"** → single action with `inputs` (e.g. `type: radio` for fixed choices). Defaults to the header.

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
root: <path>             # required for local projects (supports ~). Omit when ssh: is set.
label: <string>          # optional — display name in UI
parent_name: <string>    # optional — duplicate from parent project

ssh:                     # optional — present means a remote/SSH project. Replaces root.
  host: <string>         # required — remote hostname or IP
  user: <string>         # required — login user
  port: <int>            # optional (0-65535, defaults to 22)
  key: <path>            # optional — path to identity file (~ supported)
  dir: <path>            # optional — default remote working directory (absolute or ~)

services:                # required — at least one (omitted when parent_name is set)
  <key>: <cmd>           # shorthand
  <key>:                 # full form
    cmd: <string>        # required
    cwd: <path>          # optional (remote path on SSH projects)
    port: <int>          # optional (0-65535, unique)
    env: {}              # optional
    profiles: []         # optional

actions:                 # optional — one-shot commands
  <key>: <cmd>           # shorthand
  <key>:                 # full form
    cmd: <string>        # required (unless nested actions)
    label: <string>      # optional — display name in UI
    cwd: <path>          # optional (remote path on SSH projects)
    env: {}              # optional
    confirm: <bool>      # optional (default: false)
    display: <string>    # optional (header | footer, default: header). "menu" still accepted (legacy).
    type: <string>       # optional — "terminal" (pane) or "background" (hidden + toast)
    reuse: <bool>        # optional — reuse same terminal pane
    mode: <string>       # optional, SSH projects only — "remote" (default) or "sync"
    inputs: {}           # optional — user-prompted parameters
    actions: {}          # optional — nested sub-actions (action group)

terminals:               # optional — interactive shells (sugar for actions with type: terminal)
  <key>: <cmd>           # shorthand
  <key>:                 # full form — supports the same fields as actions
    cmd: <string>        # required (unless nested actions)
    label: <string>      # optional
    cwd: <path>          # optional (remote path on SSH projects)
    env: {}              # optional
    display: <string>    # optional (header | footer, default: header). "menu" still accepted (legacy).
    confirm: <bool>      # optional
    reuse: <bool>        # optional — reuse the existing pane on next launch
    inputs: {}           # optional — prompted parameters
    actions: {}          # optional — nested sub-actions (split-button or dropdown)

profiles:                # optional — named service subsets
  <key>: [<service>, ...]
```

**Key rules:**
- Shorthand (`test: go test ./...`) when the command needs no options.
- Full form when you need `cwd`, `env`, `confirm`, `display`, `type`, `reuse`, `mode`, `inputs`, or a `label`.
- Set `confirm: true` on destructive actions (migrations, deploys, cleanup).
- Omit `display` (or set `display: header`) for the main button row — that is the default. Use `display: footer` for compact controls in the terminal footer (next to the branch switcher). `display: menu` is legacy/no longer suggested.
- Use `type: terminal` + `reuse: true` for commands that should stay in one persistent pane (log tailers, watchers).
- Use `type: background` for slow commands you want to fire and forget — lpm shows a toast when they finish.
- Action groups: parent `cmd` + nested `actions` renders as a split button; nested `actions` alone renders as a dropdown. Children inherit `cwd`, `env`, and `mode`.
- A project is **either** local (set `root`) **or** remote (set `ssh:`, omit `root`) — never both.
- On SSH projects, `mode: sync` makes an action run locally against an rsync mirror of `ssh.dir`; `mode: remote` (default) runs on the host. `mode: sync` is rejected on local projects.
- Use `parent_name` to duplicate a project config for a different root directory.
- Keys: short, lowercase, hyphen-separated (`db-migrate`, `run-tests`).
- `~` expands to home. Relative `cwd` resolves from `root` (local projects) or from `ssh.dir` on the remote host (SSH projects). Local `cwd` paths must exist; remote `cwd` paths are not validated locally.

**Validation — verify before writing any config:**
- Either `root` or `ssh:` is set (but not both); `name` is optional and defaults to the config filename.
- When `ssh:` is set: `host` and `user` are non-empty; `port` is in 0–65535 (omitted means 22); `dir` is absolute or `~`-prefixed.
- At least one service is defined (unless `parent_name` is set).
- All `cmd` fields are non-empty strings (actions or terminals with nested `actions` may omit `cmd`).
- All `cwd` paths on local projects point to existing directories. SSH projects skip local cwd checks.
- All ports are in range 0–65535 with no duplicates across services.
- `display` values are `header` (default) or `footer`. `menu` is still accepted as a legacy value but no longer suggested. `button` is a deprecated alias for `header`.
- `type` values are only `terminal` or `background` (or omitted).
- `mode` values are only `remote` or `sync` (or omitted); `sync` requires an SSH project.
- Profile entries reference defined services.
- Nested sub-actions are validated recursively.
- `parent_name` references an existing project.

## Examples

**Example 1: Create a minimal config**
```
User: Set up lpm for this project
Agent: No lpm project matches cwd ~/Projects/my-api. I can:
       1. Create a new project for this directory (name: my-api)
       2. Edit an existing project: myapp, storefront
User: Create it
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

**Example 2: Full config**
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
    display: header

  fetch-all:
    cmd: git fetch --all --prune
    label: Fetch All
    type: background
    display: header

terminals:
  psql:
    cmd: psql myapp_dev
    label: Database
    display: header

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
         display: header
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

**Example 8: Add a background action**
```
User: Add a button that resets the dev database in the background
Agent: [reads config, adds action — silent cwd match on ~/.lpm/projects/myapp.yml]

       Added to ~/.lpm/projects/myapp.yml:
       actions.db-reset:
         cmd: npm run db:reset && npm run db:seed
         label: Reset DB
         type: background
         confirm: true
         display: header
```

**Example 9: Pin an action to the terminal footer**
```
User: Add a quick "format" action right next to the branch switcher
Agent: [adds action with display: footer]

       Added to ~/.lpm/projects/myapp.yml:
       actions.format:
         cmd: npm run format
         label: Format
         display: footer
```

**Example 10: SSH project**
```
User: Set up lpm for our prod API box, deploy@api.example.com, code lives at ~/apps/api
Agent: [creates SSH project — root omitted, ssh: block instead]

       Created ~/.lpm/projects/prod-api.yml:
         ssh: { host: api.example.com, user: deploy, dir: ~/apps/api }
         services: { worker: bin/worker }
```

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
  tail-logs:
    cmd: tail -f log/production.log
    type: terminal
    reuse: true
    display: footer

terminals:
  remote-shell:
    cmd: bash -l
    label: Shell
    display: header
```

**Example 11: Sync-mode action on an SSH project**
```
User: I want to run Claude Code locally against the remote repo
Agent: [adds sync-mode action — rsyncs ~/apps/api locally, runs the command, syncs changes back]

       Added to ~/.lpm/projects/prod-api.yml:
       actions.claude:
         cmd: claude
         label: Claude (local)
         type: terminal
         mode: sync
         display: header
```

**Example 12: Split-button action group**
```
User: Make deploy a button that defaults to staging but lets me pick production or preview
Agent: [adds split-button group]

       Added to ~/.lpm/projects/myapp.yml:
       actions.deploy:
         cmd: ./deploy.sh staging
         label: Deploy
         display: header
         confirm: true
         actions:
           production:
             cmd: ./deploy.sh production
             confirm: true
           preview:
             cmd: ./deploy.sh preview
```

## Limitations

- Project names must be lowercase with no slashes; cannot be `.` or `..`
- All `cwd` paths on local projects must point to existing directories — lpm validates on load
- Ports must be in range 0–65535 and unique across services
- Global config only supports `actions` and `terminals` — no services, profiles, name, or root
- Duplicate projects (`parent_name`) inherit everything — you cannot override individual entries
- A project cannot have both `root` and `ssh:` — pick one
- `mode: sync` is only valid on SSH projects and requires `rsync` available locally and on the host
- SSH projects share a ControlMaster connection per host (`/tmp/lpm-<uid>/cm-<hash>`) — disconnects affect all panes for that host
