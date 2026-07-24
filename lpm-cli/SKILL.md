---
name: lpm-cli
version: 1.3.0
description: "Operate lpm-managed projects through the `lpm` CLI: start or stop projects and services, inspect logs and agent status, wait for readiness, run actions, and duplicate projects into standalone copies or create linked Git worktrees. Use when the user asks to operate or inspect lpm runtime state. `LPM_PROJECT_NAME` selects the default project after the skill triggers; it is not a trigger by itself. For editing YAML configuration, use `lpm-config`."
---

`lpm` is a command-line companion to the lpm desktop app. Verify it is available with `lpm --version`; if it is missing, install it from the lpm app's Settings.

### Key facts

- The project name is inferred from `LPM_PROJECT_NAME` or the current directory — omit it inside lpm terminals.
- Default output is compact text (cheapest); add `--json` only when you need to parse the result.
- Exit codes: `0` ok, `2` usage / not found / app not running, `1` failure / timeout.
- `config get`, `config apply`, and control commands need the lpm app running; other inspection commands do not.

### Commands

- `lpm list` — all projects, running state, agent counts.
- `lpm project [name] [--full]` — one project in full (`--full` adds env maps, action details, terminal history).
- `lpm config resolve [--cwd PATH] [--json]` — match a directory to its deepest project root without using `LPM_PROJECT_NAME`.
- `lpm config validate <file> [--json]` — validate syntax, fields, layer rules, and effective merged configuration.
- `lpm config get --layer project|repo|global|template [--project NAME | --template NAME] [--create] [--json]` — read a config layer with the revision required for a safe write.
- `lpm config apply --layer project|repo|global|template [--project NAME | --template NAME] [--create] --if-revision HASH (--stdin | --file PATH) [--json]` — validate a candidate and atomically apply it through the running app. Never edit a live config file directly.
- `lpm logs [service] [-n 30] [-p proj]` — service scrollback, exactly N lines.
- `lpm status [project]` — live agent statuses (Running/Waiting/Done/Error).
- `lpm start [project] [--profile X]` / `lpm stop [project]` — start / stop a project's services.
- `lpm service <name> start|stop|restart [-p proj]` — one service.
- `lpm wait [project] [--service X | --port N | --agent] [--timeout 60]` — block until ready; `--agent` waits for the project's agents to settle.
- `lpm duplicate [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--include-uncommitted | --exclude-uncommitted]` — create parallel working directories. Always pass a `--label` describing the copy's purpose so it's identifiable in the app — one repeated `--label` per copy in creation order, `<project-name>-<short-description>` style such as `lpm-fix-auth`. Only omit it when you genuinely can't infer a purpose. Output lists each copy's path.
- `lpm worktree [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--reinstall-deps]` — create linked Git worktrees instead of standalone copies. The same labeling guidance applies. Output lists each worktree's path.
- `lpm remove <copy-name>` — remove a duplicate. For a linked worktree, this also removes its Git worktree registration and lpm-created branch. Originals need `--force`; don't use `--force` unless the user explicitly asks.
- `lpm run [action | --command CMD] [--prompt TEXT] [-p proj]` — queue in a new app terminal, fire-and-forget.
- `lpm set-status <key> <value>` / `lpm clear-status <key>` — report status to the app UI.

### Token rules

- After `lpm start`, use `lpm wait` — never a sleep or poll loop.
- After queueing agent work, use `lpm wait --agent -p <copy> --timeout N` instead of polling `lpm status` in a loop.
- Read logs with a small `-n` first (e.g. `-n 30`); increase only if needed.
- Errors already name the fix — unknown project/service errors list the valid names. Read the error before retrying.

### Duplicate modes

- `lpm duplicate` makes a standalone APFS copy. The app's duplicate setting decides whether uncommitted changes are copied; `--include-uncommitted` and `--exclude-uncommitted` override it.
- `lpm worktree` makes a linked Git checkout with its own branch and shared repository data. The source must be a local Git repository, its lpm root must equal the repository root, and it must have at least one commit.
- A worktree starts at the source's current `HEAD` on an lpm-created `lpm/<copy-name>` branch. It does not include uncommitted changes.
- Remove worktrees with `lpm remove`; do not move, trash, or delete their folders directly.
- If a standalone duplicate reports that the source is a linked Git checkout, retry with `lpm worktree`.

### Fan-out (parallel agents)

`lpm duplicate -n 3 --label <proj>-<purpose> --label <proj>-<purpose> --label <proj>-<purpose> --run <action> --prompt "..."` clones the project into 3 labeled copies and queues the task in each. Then, per copy: `lpm wait --agent -p <copy>` until it settles, review its work at the printed path (e.g. `git diff` there), and `lpm remove <copy>`.

Use `lpm worktree` for the fan-out when each copy should use an independent Git branch without duplicating repository data.

To create or edit project configs (services/actions/YAML), use the `lpm-config` skill.
