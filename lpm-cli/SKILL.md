---
name: lpm-cli
description: "Control dev projects managed by the lpm app via the `lpm` command: start/stop projects and services, restart a dev server, read service logs, check AI-agent status, wait for a port to be ready, and duplicate a project into parallel copies for multi-agent work. Use whenever the LPM_PROJECT_NAME environment variable is set (the terminal is inside lpm), or when the user mentions lpm and wants to run/stop/restart/inspect services, read dev-server logs, or fan out work across project copies. For creating or editing lpm project YAML configs, use the `lpm-config` skill instead."
---

`lpm` is a command-line companion to the lpm desktop app. Verify it is available with `lpm --version`; if it is missing, install it from the lpm app's Settings.

### Key facts

- The project name is inferred from `LPM_PROJECT_NAME` or the current directory — omit it inside lpm terminals.
- Default output is compact text (cheapest); add `--json` only when you need to parse the result.
- Exit codes: `0` ok, `2` usage / not found / app not running, `1` failure / timeout.
- Control commands (everything except the read commands) need the lpm app running.

### Commands

- `lpm list` — all projects, running state, agent counts.
- `lpm project [name] [--full]` — one project in full (`--full` adds env maps, action details, terminal history).
- `lpm logs [service] [-n 30] [-p proj]` — service scrollback, exactly N lines.
- `lpm status [project]` — live agent statuses (Running/Waiting/Done/Error).
- `lpm start [project] [--profile X]` / `lpm stop [project]` — start / stop a project's services.
- `lpm service <name> start|stop|restart [-p proj]` — one service.
- `lpm wait [project] [--service X | --port N] [--timeout 60]` — block until ready.
- `lpm duplicate [project] [-n N] [--group X] [--run ACTION | --command CMD] [--prompt TEXT]` — clone into parallel copies.
- `lpm remove <copy-name>` — duplicates only; originals need `--force` (don't use `--force` unless the user explicitly asks).
- `lpm run [action | --command CMD] [--prompt TEXT] [-p proj]` — queue in a new app terminal, fire-and-forget.
- `lpm set-status <key> <value>` / `lpm clear-status <key>` — report status to the app UI.

### Token rules

- After `lpm start`, use `lpm wait` — never a sleep or poll loop.
- Read logs with a small `-n` first (e.g. `-n 30`); increase only if needed.
- Errors already name the fix — unknown project/service errors list the valid names. Read the error before retrying.

### Fan-out (parallel agents)

`lpm duplicate -n 3 --run <action> --prompt "..."` clones the project into 3 auto-named copies and queues the task in each. Watch progress with `lpm status`, then clean up each copy with `lpm remove <copy>`.

To create or edit project configs (services/actions/YAML), use the `lpm-config` skill.
