# Creating and editing automations

Read this reference before `lpm automations add`, `edit`, or `remove-run`. Every command here needs the lpm app running.

- [What an automation does](#what-an-automation-does)
- [Where it lives](#where-it-lives)
- [Create](#create)
- [Schedules](#schedules)
- [What it runs](#what-it-runs)
- [Check, copy, verify, delivery](#check-copy-verify-delivery)
- [Edit](#edit)
- [Remove](#remove)
- [Runs](#runs)

## What an automation does

The lpm app runs automations on their schedule while it is running. Each run goes through these steps in order:

1. `--check` (optional) runs in the project. Exit 0 means there is work to do; any other exit code ends the run as "nothing to do". It times out after 10 minutes.
2. `--duplicate` (optional) makes a fresh copy or Git worktree to work in.
3. The run itself: `--cmd`, `--action`, or `--prompt`. It times out after an hour, not counting time spent waiting on an answer.
4. `--verify` (optional) runs afterwards. Exit 0 means the checks passed. It times out after 15 minutes.

Every step gets `LPM_JOB_ID`, `LPM_PROJECT_NAME`, `LPM_RUN_ROOT` (where the run happens), `LPM_IS_COPY` (`1` in a copy), `LPM_TRIGGER` (`schedule`, `manual`, or `reply`), and, when known, `LPM_SCHEDULED_FOR` and `LPM_LAST_RUN_AT` (Unix seconds). The run itself also gets `LPM_RUN_ID`, which `lpm ask` uses to put a question to the user: a `cmd` waits for the answer, an AI prompt ends its turn and is resumed with it. The user answers in lpm, lpm Link, or Telegram when the automation sends there (its buttons, or a reply to the message), never the run itself. While a question is open, the automation's scheduled runs are skipped and Run now is refused. SSH projects can't have automations.

## Where it lives

| Runs in | Flag | Kept in |
|---|---|---|
| One project | `-p <project>`, `--projects <project>`, or none inside the project | that project's config |
| Several projects | `--projects a,b` | `~/.lpm/global.yml` |
| Every project | `--every-project` | `global.yml` |
| No project, in the home directory | `--no-project` | `global.yml` |

Automations in `global.yml` never run in duplicates. Every command finds an automation by `-p <project>` (or the current project); one with no project needs `--global`. On `run`, `stop`, `enable`, `disable`, `history`, `output`, and `reply`, `--global` acts in every project the automation runs in.

These commands rewrite the YAML file the automation lives in, the same way the lpm phone app does. Comments in that file are not kept.

## Create

```bash
lpm automations add <id> [-p proj | --projects a,b | --every-project | --no-project] <schedule> <run> [options] [--json]
```

- `<id>` uses letters, digits, `-`, and `_`, such as `weekly-deps`. The CLI refuses an id the project (or, for `global.yml`, any project) already shows.
- `--label TEXT` and `--emoji E` set how the app shows it; the label defaults to the id.
- A schedule and something to run are required.

```bash
lpm automations add weekly-deps --label "Weekly dependency check" \
  --at 09:00 --days mon \
  --check 'test -n "$(npm outdated)"' --duplicate worktree \
  --prompt "Update outdated dependencies, fix anything that breaks, and summarize the changes." \
  --agent claude --verify "npm test"
```

The command validates the entry before saving it and exits 2 if anything is wrong, naming the field. After saving, it asks the app whether the automation can run. If the app finds a problem the CLI can't see, such as an `--action` the project doesn't have, the automation is saved but the command exits 1 with the app's reason; fix it with `edit`. On success it prints when the next run is due.

## Schedules

| When | Flags |
|---|---|
| Only when started by hand | `--manual` |
| Every 30 minutes, 6 hours, or 2 days | `--every 30m`, `--every 6h`, `--every 2d` (a bare number means hours; 5 minutes minimum) |
| A random gap of 4 to 8 hours | `--every 4h-8h` |
| Hourly, 09:00–18:00 on weekdays | `--every 1h --at 09:00 --until 18:00 --days mon,tue,wed,thu,fri` |
| Every day at 09:00 | `--at 09:00` |
| Several fixed times | `--at 09:00,17:30` (at least 5 minutes apart) |
| Some weekdays | `--at 09:00 --days mon,thu` |
| A random time 09:00–11:00 | `--at 09:00 --until 11:00` |
| Three random times 09:00–17:00 | `--at 09:00 --until 17:00 --times 3` |
| Two random weekdays each week | `--at 10:00 --days mon,tue,wed,thu,fri --pick-days 2` |
| Dates of the month | `--at 09:00 --days 1,15,last`; add `--short-months last` to run the 31st on a shorter month's last day instead of skipping it |
| A position in the month | `--at 09:00 --days "first mon"`; also `"last fri"`, `"second day"`, `"last weekday"` (a workday) |
| Once on a date | `--at 14:00 --days 2026-10-20` |
| Cron, in local time | `--cron "0 18 * * 5"` or `--cron @daily` |

- `--days` holds weekday names, dates of the month, or calendar dates; don't mix them.
- `--until`, `--times`, and `--pick-days` go with `--at`. With `--every`, `--at` and `--until` form a daily window, and `--days` can only be weekdays.
- `--cron` and `--manual` stand alone. A cron line's runs must be at least 5 minutes apart.

## What it runs

Exactly one of these:

- `--cmd COMMAND`: a shell command, run in the project root, or in the copy when `--duplicate` is set. Put anything longer than a line in a script: in the repo when it belongs to the project (`--cmd ./scripts/nightly.sh`), otherwise in `~/.lpm/scripts/` (`--cmd ~/.lpm/scripts/disk-cleanup.sh`), the folder lpm syncs between paired Macs. A script saved anywhere else is missing when the automation runs on another Mac.
- `--action NAME`: an action from the project's config. Add `--prompt` only when the action opens an agent terminal; the agent gets the prompt once it is ready.
- `--prompt TEXT`: a headless AI agent run, with these options:
  - `--agent claude|codex|gemini|opencode`. Leave it out to use the app's default agent.
  - `--model` and `--effort`: passed to the agent as written.
  - `--access full|read`. `full` (the default) lets the agent edit files and run commands. `read` makes it read and report only. OpenCode always runs with full access.
  - `--quiet`: if the agent finds nothing worth reporting, the run leaves no entry and sends no notification.
  - `--memory`: each run reads what earlier runs did and found, and adds its own notes, through the lpm-memory skill (session `job-<id>`). Needs `--access full`. Jobs made in the app have it on.
  - `--claude-account ID`: the Claude account Claude Code runs on, by the id the project's `claudeAccount` uses (Settings → Accounts & usage → Claude accounts). Use `default` for the main login and `--claude-account ""` to go back to the project's account. Without it, runs use the project's account, or the main login when the automation runs standalone. On a computer that doesn't have that account, runs use the project's account instead.

A headless run has no one to answer its questions, so write the prompt as a complete task: what to inspect, what to change, and what to report.

## Check, copy, verify, delivery

- `--check COMMAND` should be cheap and only decide whether there is work. It always runs in the original project.
- `--verify COMMAND` isn't available for `--action`.
- `--duplicate copy|worktree|off` runs the work in a fresh copy (`copy`) or a linked Git worktree (`worktree`). Use it when the run edits files and its work should be reviewed separately. A worktree needs a Git repository.
  - `--reinstall-deps` reinstalls dependencies in the copy or worktree.
  - `--pull-latest false` stops a copy from pulling the latest commits first.
  - `--exclude-uncommitted` leaves uncommitted changes out of a copy.
- `--send-to lpm,telegram` sets where results go: `lpm` (the default), `telegram`, or `telegram:<target>`. A question asked one at a time can be answered from Telegram too.

## Which computer runs it

Config sync copies an automation to every paired computer, but only one of them runs each scheduled run. `--machines` lists the ones that may, best first: `this` (the computer the app runs on), a paired computer's name as Settings → Connections shows it, or `any` for any other computer that has it and is on. The first one in the list that is on runs it; the next takes over a few minutes after it goes offline, and the first one pulls those runs into its own history when it's back.

- A new automation runs only on the computer it was made on: `--machines this` is the default.
- `--machines "this,Studio"`: this computer, or Studio while this one is off.
- `--machines this,any`: this computer, or any other that's on.
- `--machines ""` goes back to every computer that has it running it on its own, which is how automations made before this setting behave.

`show` prints the list as hostIds. Pausing one that lists its computers pauses it on all of them.

## Edit

```bash
lpm automations show <id> [-p proj | --global]
lpm automations edit <id> [-p proj | --global] [the same flags as add]
```

Run `show` first to see the current definition. `edit` changes only the fields you pass:

- An empty value clears a field: `--check ""`, `--model ""`, `--send-to ""`. Turn a flag off with `--quiet false` or `--duplicate off`.
- Any schedule flag replaces the whole schedule, so pass all of it again. For example, moving `--at 09:00 --days mon` to 10:00 needs `--at 10:00 --days mon`.
- `--cmd` replaces the whole run. `--action` drops the AI settings. `--prompt` on its own keeps the current action or agent settings. To turn an action into an AI prompt, pass `--action "" --prompt "..."`.
- `--projects`, `--every-project`, and `--no-project` change where it runs, and the automation moves to where that is kept (see [Where it lives](#where-it-lives)), keeping its runs: `--projects web` on one in `global.yml` moves it into `web`'s config, and `--projects web,api` on one of `web`'s moves it to `global.yml`. An automation in the project's `.lpm.yml` travels with the folder, so change where it runs there instead.

Pause and resume with `lpm automations disable|enable` instead of editing; the app keeps that choice separately, except for an automation that lists its computers, whose pause is written into its definition so every computer sees it.

## Remove

```bash
lpm automations remove <id> [-p proj | --global] [--delete-copies]
```

This deletes the definition and its run history; remove one only when the user asks. An automation in `global.yml` needs `--global`, because removing it affects every project it runs in. Copies its runs worked in stay unless you pass `--delete-copies`.

## Runs

```bash
lpm automations history <id> [-p proj | --global] [-n N]
lpm automations remove-run <id> --at TIMESTAMP [-p proj | --global] [--message] [--delete-copies]
lpm automations mark-read <id> [-p proj | --global] [--at TIMESTAMP]
lpm automations mark-read --all
lpm automations test-check <id> [-p proj | --global] [--check CMD]
```

- `remove-run` deletes the conversation the run at `--at` belongs to: the run and the replies that continued it. `--message` deletes only that one message. `--delete-copies` also removes the copy the run worked in. Only when the user asks.
- `list` shows how many runs the user hasn't read under `NEW`. `mark-read` marks them read, the same as opening them in the app; `--at` stops at that run, so newer ones stay new.
- `test-check` runs the automation's check in the project (with `--global`, in the first project it runs in) and says whether a scheduled run would go ahead, with the check's output. `--check CMD` tries a command before you save it with `edit`. It runs nothing but the check, which times out after a minute.
