---
name: lpm-cli
version: 1.10.0
description: "Operate lpm-managed projects through the `lpm` CLI: start or stop projects and services, inspect logs and agent status, wait for readiness, run actions, create, edit, run, pause, and read scheduled automations, and duplicate projects into standalone copies or create linked Git worktrees. Use when the user asks to operate or inspect lpm runtime state or manage lpm automations. `LPM_PROJECT_NAME` selects the default project after the skill triggers; it is not a trigger by itself. For editing YAML configuration, use `lpm-config`."
---

`lpm` is a command-line companion to the lpm desktop app. Verify it is available with `lpm --version`; if it is missing, install it from the lpm app's Settings.

### Key facts

- The project name is inferred from `LPM_PROJECT_NAME` or the current directory — omit it inside lpm terminals.
- Default output is compact text (cheapest); add `--json` only when you need to parse the result.
- Exit codes: `0` ok, `2` usage / not found / app not running, `1` failure / timeout.
- `config get`, `config apply`, and control commands need the lpm app running; other inspection commands do not.

### Commands

- `lpm list` — all projects, running state, agent counts.
- `lpm project [name] [--full]` — one project in full (`--full` adds env maps, action details, terminal history). A started service whose command ended (crashed or exited) shows as `exited` with its code (`runningSource: "exited"`, `exitCode` in `--json`); its pane stays until it is restarted or stopped.
- In `lpm list --json` and `lpm project --json`, when `isRemote` is `true`, `root` is the project's `ssh.dir`: a path on the SSH host, not on this machine. Don't `cd` into it or read files there locally.
- `lpm config resolve [--cwd PATH] [--json]` — match a directory to its deepest project root without using `LPM_PROJECT_NAME`. An SSH project matches only from its local sync mirror `~/.lpm/sync/<project-file-name>`, never by `root` or `ssh.dir`.
- `lpm config validate <file> [--json]` — validate syntax, fields, layer rules, and effective merged configuration.
- `lpm config get --layer project|repo|global|template [--project NAME | --template NAME] [--create] [--json]` — read a config layer with the revision required for a safe write.
- `lpm config apply --layer project|repo|global|template [--project NAME | --template NAME] [--create] --if-revision HASH (--stdin | --file PATH) [--json]` — validate a candidate and atomically apply it through the running app. Never edit a live config file directly.
- `lpm logs [service] [-n 30] [-p proj]` — service scrollback, exactly N lines.
- `lpm status [project]` — live agent statuses (Running/Waiting/Done/Error).
- `lpm start [project] [--profile X]` / `lpm stop [project]` — start / stop a project's services.
- `lpm service <name> start|stop|restart [-p proj]` — one service. `restart` stops the run still going first, then runs the command again in the same pane.
- `lpm wait [project | -p proj] [--service X | --port N | --agent] [--timeout 60]` — block until ready; `--agent` waits until an agent reports after the wait starts and none is still working (your own tab is ignored).
- `lpm duplicate [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--include-uncommitted | --exclude-uncommitted]` — create parallel working directories. Always pass a `--label` describing the copy's purpose so it's identifiable in the app — one repeated `--label` per copy in creation order, `<project-name>-<short-description>` style such as `lpm-fix-auth`. Only omit it when you genuinely can't infer a purpose. Output lists each copy's path.
- `lpm worktree [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--reinstall-deps]` — create linked Git worktrees instead of standalone copies. The same labeling guidance applies. Output lists each worktree's path.
- `lpm remove <copy-name>` — remove a duplicate. For a linked worktree, this also removes its Git worktree registration and lpm-created branch. Originals and SSH projects (SSH duplicates too) need `--force`, and their folder is kept; don't use `--force` unless the user explicitly asks.
- `lpm run [action | --command CMD] [--prompt TEXT] [-p proj]` — queue in a new app terminal, fire-and-forget. It refuses inside an automation run, as do `duplicate` and `worktree` with `--run` or `--command`: the task would run outside the automation.
- `lpm set-status <key> <value>` / `lpm clear-status <key>` — report status to the app UI.
- `lpm refresh-label [action] [-p proj]` — rerun the `$(…)` commands in an action's labels and emoji (with its menu items' and options') now and redraw labels built from git; no action refreshes every label in the project. Use it after changing what a dynamic label shows, such as at the end of a release script.
- `lpm update --check [--json]` — installed and available lpm versions, an install waiting to start, and whether services still run on an older lpm (`services.current: false`). `lpm update [--stable]` installs the newest release (`--stable`: back from a Beta build to the latest stable one) once no agent is mid-turn and no background action runs — including you, so inside an lpm terminal it installs after your turn ends; it returns at once with `state: "scheduled"`. Never pass `--now` from an lpm terminal: installing restarts lpm, which closes every terminal (agents reopen in their conversations, services keep running). `lpm update --cancel` calls off a waiting install. Services stay on the lpm they started on through an update; `lpm update --restart-services` stops and starts them all on the current one — only when the user asks, since every dev server restarts. Update only when the user asks.
- `lpm auto-pull [project] [--set on|off|default]` / `lpm auto-pull --all` — whether the app fast-forwards a project from origin by itself, and why. `--set` changes the project's own `autoPull` key through the running app, like `start`/`stop`; `default` removes it, so a duplicate or worktree follows its parent, else the Settings mode (Off / Chosen / All, changed only in the app). Change it only when the user asks.

### Automations

Automations are tasks the app runs on a schedule: a shell command, a project action, or a headless AI prompt, optionally after a cheap check and in a fresh copy. These commands need the app running. Read [references/automations.md](references/automations.md) before `add` or `edit`.

- `lpm automations list [-p proj | --all] [--json]` — id, name, state (`waiting`, `running`, `enabled`, `paused`, `invalid`), schedule, last result, next run, and `NEW`, the count of runs the user hasn't read (`unread` in `--json`). `waiting` means a run asked the user something; with `--json` the row's `ask` holds the question. `valid: false` rows carry an `error`.
- `lpm automations show <id> [-p proj | --global] [--json]` — the current definition.
- `lpm automations open <id> [-p proj | --global]` — bring the app forward on that automation's page in the project's Automations tab, showing its runs there; with `--global`, on the app-wide Automations page. Use it when the user asks to see or open an automation in the app.
- `lpm automations add <id> [-p proj | --projects a,b | --every-project | --no-project] <schedule> <run> [options]` — create one. Flags cover every field; see the reference.
- `lpm automations edit <id> [-p proj | --global] [flags]` — change only the fields given; `--projects`, `--every-project`, or `--no-project` change where it runs, `--machines` which paired computers may run it.
- `lpm automations remove <id> [-p proj | --global] [--delete-copies]` — delete it and its run history; `--delete-copies` also removes the copies its runs worked in. Only when the user asks.
- `lpm automations run <id> [-p proj | --global]` — start a run now, fire-and-forget. It can edit code, make copies, and cost money; run one only when the user asks.
- `lpm automations stop <id> [-p proj | --global]` — stop the current run.
- `lpm automations disable <id>` / `enable <id>` `[-p proj | --global]` (aliases `pause` / `resume`) — pause or resume the schedule. Resuming never fires the runs missed while paused.
- `lpm automations history <id> [-p proj | --global] [-n N] [--json]` — past runs with their outputs, newest first; each run's `at` timestamp identifies it.
- `lpm automations remove-run <id> --at TIMESTAMP [-p proj | --global] [--message] [--delete-copies]` — delete one run's conversation from the history (`--message`: only that one message); `--delete-copies` also removes the copy it worked in. Only when the user asks.
- `lpm automations mark-read <id> [-p proj | --global] [--at TIMESTAMP]` / `mark-read --all` — mark runs read, as opening them in the app does.
- `lpm automations test-check <id> [-p proj | --global] [--check CMD]` — run the check now and report whether a scheduled run would go ahead; it runs nothing else.
- `lpm automations output <id> [-p proj | --global]` — live output of the run in progress.
- `lpm automations reply <id> "message" [-p proj | --global] [--at TIMESTAMP] [--agent X] [--model X] [--effort X]` — continue an AI automation's conversation (the newest by default), fire-and-forget; then read `output` or `history`.
- `lpm automations answer <id> [-p proj | --global] [--yes | --no | --pick LABEL… | --text "…" | --answers JSON | --dismiss]` — answer the question an automation is waiting on, which resumes its run; with no answer it prints the question and its choices. Answer only with what the user said. It refuses inside an automation run, as does `reply`: a run never answers its own question.

### Asking the user from inside an automation run

`lpm ask` puts a question to the user from within a run (it fails outside one). Ask only when you can't go on without a decision or information only the user has.

- `lpm ask "Deploy to staging?" --confirm [--yes-label Deploy --no-label "Not now"]` — yes/no.
- `lpm ask "Which region?" --choice us-east --choice eu-west [--multiple] [--other]` — a pick from a list; `--other` also takes their own words.
- `lpm ask "What should the release be called?" --text [--multiline] [--placeholder …]` — free text.
- `--default ANSWER --timeout 4h` (a minute to a year) uses the default if nobody answers in time; `--form '{"questions":[…]}'` asks several at once.

In an AI agent's run, `lpm ask` returns at once: end your turn right away, without guessing the answer — it comes back as your next message. In a command run it waits and prints the answer (`yes`/`no` for `--confirm`, exit status 1 for no; picked labels one per line; the text), exiting 3 when the question is dismissed or expires.

An automation in `global.yml` that runs in several projects runs once per project, with its own runs, history, and paused state in each. `-p <project>` acts in one of them; `--global` acts in all of them, like the app's Automations page, so `run --global` starts a run in each. One with no project needs `--global` for every command. With `--global`, `--json` replies carry `global: true` and `projects` instead of `project`, each history entry and live output names its `project`, and `reply` continues the newest conversation across them (or the one holding `--at`).

### Token rules

- After `lpm start`, use `lpm wait` — never a sleep or poll loop.
- After queueing agent work, use `lpm wait --agent -p <copy> --timeout N` instead of polling `lpm status` in a loop.
- Read logs with a small `-n` first (e.g. `-n 30`); increase only if needed.
- Read automation results with `lpm automations history <id> -n 1` first; AI runs can be long.
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
