---
name: lpm-config
description: Create, modify, and delete lpm project configs at ~/.lpm/projects/*.yml. Use whenever the user mentions lpm, asks to set up lpm, create/edit/delete an lpm config, add or remove services, actions, or terminals from lpm, or says "lpm setup", "create lpm config", "add service to lpm", "configure lpm". Also trigger when the user wants to add a button or menu action to run commands, manage dev project processes, start/stop multiple services together, group related commands, set up one-shot commands with confirmation prompts, or configure interactive terminal shells through YAML config files. Also triggers when the user wants a background/silent action, an action that submits a command into the currently open/focused/active terminal (the `command` action type), a split-button with a default plus alternatives, a dropdown menu of related commands, an action pinned to the terminal footer, an SSH/remote project, or a sync-mode action that mirrors a remote directory locally. Also triggers when the user wants an action input to remember the last value chosen and pre-select it next time (`persist`). Also triggers when the user asks to edit lpm config for the current directory (cwd) without naming a project. Also triggers when the user wants to share an lpm config with their team via `.lpm.yml` checked into the repo, create or reference a reusable template under `~/.lpm/templates/`, layer one config on top of another via `extends`, reorder buttons with `position`, assign a keyboard shortcut (`shortcut`) or emoji icon (`emoji`) to an action, pre-flight a port-conflict check with `port` on an action or terminal, or sparse-override a single field of a global action. If the user has lpm installed (~/.lpm/ exists), this skill applies to any request about managing project workflows.
---

## Instructions

Use this skill to create, modify, and delete [lpm](https://lpm.cx) (Local Project Manager) YAML config files. lpm is a macOS app that manages long-running services, one-shot commands (actions), and interactive terminals for dev projects.

- To *control* running projects from the command line (start/stop/logs/status/duplicate), use the `lpm-cli` skill instead.
- **Read [references/yaml-schema.md](references/yaml-schema.md) before writing any config.** It is the single source of truth for every field, shape, and rule. This file covers *which* file to edit and *what shape* to reach for; the schema doc covers *the fields*.

### Check lpm is installed

```bash
ls -d /Applications/lpm.app >/dev/null 2>&1 || test -d ~/.lpm
```

If neither exists, point the user to [lpm.cx](https://lpm.cx) to download the macOS app. lpm also needs tmux — if missing, `brew install tmux` (macOS only).

### Pick the target project file

Work out which `~/.lpm/projects/<name>.yml` to edit *before* asking the user anything. Use the cwd as the primary signal.

1. `pwd` for the current directory.
2. `ls ~/.lpm/projects/*.yml` (empty is fine).
3. For each project file, read its `root:` (expand `~` → `$HOME`):
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
   - Otherwise any `root` that is a path-component prefix of `cwd` is a candidate. **Longest prefix wins.**
5. Act on the match count:

   | Matches | What to do |
   |---------|-----------|
   | 1 | **Silently** edit `~/.lpm/projects/<name>.yml`. No "I'll edit X" line, no confirmation — apply the change and write. |
   | ≥2 | Ask once: *"cwd is inside multiple lpm projects (`a`, `b`). Which one?"* |
   | 0 | In one reply, offer both: (1) create a new project config for this cwd, (2) pick an existing project — list every `~/.lpm/projects/*.yml`. |

**Overrides (these win over cwd detection):**
- User names a project explicitly ("add a service to `myapp`") → use that name.
- "globally" / "to all my projects" / "для всех проектов" → write to `~/.lpm/global.yml` (supports `actions` and `terminals` only).
- "share with team" / "for everyone on the repo" / "check it in" → write to `<root>/.lpm.yml` (`<root>` = matched project's root, else cwd). Create it if absent. Don't gate on "is this a git repo".
- "as a template" / "for reuse across projects" → write to `~/.lpm/templates/<name>.yml`. Take `<name>` from the user's wording, or ask once if there's no obvious name.

**Layering precedence:** `templates < global < .lpm.yml < project` (right wins). Within `extends: [a, b, c]`, earlier wins. **Sparse-override trap:** bool fields (`confirm`, `reuse`) treat `false` as "inherit", so you cannot flip a lower layer's `true` → `false` from a higher one — redefine the entry fully. Full explanation: schema doc → *Config Layering & Precedence*.

**Ambiguity rule.** When intent is ambiguous between layers (e.g. "add a logs button" with both a project file and a `.lpm.yml` present), default to the personal project file and add one sentence: *"Adding to your personal project file. Say 'share with the team' to put it in `.lpm.yml` instead."*

**Confirmations** are kept only for deleting a config file or overwriting an existing one during Create. Never confirm the target on a single-match cwd.

### Intent → config shape

Map the request to a shape, then open the named schema-doc section for the field details. One concept, one row.

| User intent | Shape | Schema section |
|-------------|-------|----------------|
| Run a one-shot command (test, lint, build, deploy) | `actions` entry (shorthand, or full form for options) | Actions |
| Long-running / interactive thing on demand (log tailer, watcher, REPL) | action with `type: terminal`; add `reuse: true` to keep **one** pane | Terminal Actions |
| Always-available interactive shell (psql, redis-cli) | `terminals` entry | Terminals |
| Run silently, notify when done (build, `git fetch`, migrate) | action with `type: background` | Background Actions |
| Send a command into the currently focused/active terminal | action with `type: command` | Active-Terminal Actions |
| Prompt for parameters before running | add `inputs` (use `type: radio` for fixed choices) | Input Fields |
| Remember the last value picked for an input | `persist: true` on the input | `persist: true` |
| Pin a compact button to the terminal footer | `display: footer` | `display` Values |
| Default action + alternatives behind a chevron | split button: parent `cmd` **and** nested `actions` | Action Groups |
| A menu of related commands, no default | dropdown: nested `actions`, **no** parent `cmd` | Action Groups |
| Nested / multi-level menus, a tree of actions | nest `actions` recursively (any depth → drill menu) | Action Groups |
| Reorder buttons / put one first | `position:` (float, lower renders first) | `position` field |
| Ensure a port is free before running | `port:` on the action/terminal (+ `portConflict:`) | Ports & Conflicts |
| Confirm before a destructive command | `confirm: true` | When to Use `confirm` |
| Rename a button / change the label | set `label:` on the entry | field tables |
| Emoji icon on a button, or a keyboard shortcut for it | `emoji:` / `shortcut:` (e.g. `cmd+shift+b`) | Actions field table |
| Remote project over SSH | `ssh:` block, omit `root` | SSH Projects |
| Run an action locally against remote files | `mode: sync` (SSH projects only) | SSH Action Modes |
| Set up the same project for another directory | new file with `parent_name` (only `name`, `root`, `parent_name`) | Duplicate Projects |
| Share actions/services with the team | write to `<root>/.lpm.yml` | `.lpm.yml` |
| Reuse a building block across projects | `~/.lpm/templates/<name>.yml` + `extends:` | Templates |
| Add an entry to every project | `~/.lpm/global.yml` | Global Config |
| Override one field of a global/shared entry | sparse entry, e.g. `myAction: {position: 3}` | Sparse Overrides |

**Clarify only when genuinely ambiguous:**
- *"a button with options" / "when I click, give me options"* — three different shapes. Ask: *"Should it run a default with alternatives behind a chevron (split button), open a menu of commands (dropdown), or prompt for a parameter before running (inputs)?"*
- *"add a terminal / shell"* — ask whether it should reuse one pane (`reuse: true`) or open fresh each time.

### Execute

**Create:**
1. If `~/.lpm/projects/<name>.yml` already exists, confirm overwrite or switch to Modify.
2. Read the schema doc.
3. Auto-detect the project's setup from repo signals rather than writing blind:
   - **Services** (long-running): `package.json` scripts, `Makefile`, `docker-compose.yml`, `Procfile`, `mise.toml` — dev servers, watchers, workers.
   - **Actions** (one-shot): test, lint, build, migrate, deploy scripts.
   - **Terminals**: database consoles, REPLs, log tailers.
   - **Profiles**: logical service groupings (frontend-only, full-stack).
4. `mkdir -p ~/.lpm/projects`, then write `~/.lpm/projects/<name>.yml`.

**Modify:**
1. Read the existing `~/.lpm/projects/<name>.yml`.
2. Apply the change using the intent guide above; ask only the follow-ups that are relevant.
3. Write it back.

**Delete:**
1. Confirm with the user.
2. `rm ~/.lpm/projects/<name>.yml`.

### Workflow examples

**Create with detection (no cwd match):**
```
User: Set up lpm for this project
Agent: No lpm project matches cwd ~/Projects/my-api. I can:
       1. Create a new project for this directory (name: my-api)
       2. Edit an existing project: myapp, storefront
User: Create it
Agent: [detects a dev server + test/lint scripts, writes the config]
       Created ~/.lpm/projects/my-api.yml — 1 service (dev), 2 actions (test, lint), 1 terminal (psql).
```

**Silent cwd-matched modify:**
```
User: Add a button that resets the dev database in the background
Agent: [single cwd match on myapp — edits silently, no confirmation]
       Added actions.db-reset to ~/.lpm/projects/myapp.yml (type: background, confirm: true).
```

**Clarify an ambiguous request:**
```
User: Add a deploy button with options
Agent: Should it run a default with alternatives behind a chevron (split button),
       open a menu of deploy commands (dropdown), or prompt for a target before running (inputs)?
User: Default to staging, let me pick production
Agent: [adds a split-button action group: cmd: ./deploy.sh staging + nested production/preview]
```

**Delete with confirmation:**
```
User: Remove lpm config for myapp
Agent: Delete ~/.lpm/projects/myapp.yml? This removes the project from lpm.
User: Yes
Agent: Deleted ~/.lpm/projects/myapp.yml
```
