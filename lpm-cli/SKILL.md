---
name: lpm-cli
version: 1.16.0
description: "Operate lpm-managed projects through the `lpm` CLI: start or stop projects and services, inspect logs and agent status, wait for readiness, run actions, create, edit, run, pause, and read scheduled automations, manage `/name` skills made in lpm, and duplicate projects into standalone copies or create linked Git worktrees. Use when the user asks to operate or inspect lpm runtime state or manage lpm automations or lpm skills. `LPM_PROJECT_NAME` selects the default project after the skill triggers; it is not a trigger by itself. For editing YAML configuration, use `lpm-config`."
---

`lpm` is a command-line companion to the lpm desktop app. Verify it is available with `lpm --version`; if it is missing, install it from the lpm app's Settings.

### Key facts

- The project name is inferred from `LPM_PROJECT_NAME` or the current directory — omit it inside lpm terminals.
- Default output is compact text (cheapest); add `--json` only when you need to parse the result.
- Exit codes: `0` ok, `2` usage / not found / app not running, `1` failure / timeout.
- `config get`, `config apply`, `skills`, and control commands need the lpm app running; other inspection commands do not.

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
- `lpm connections [--activity] [--json]` — what this machine hosts and what it is connected to, with what each connected computer lets this one's agents copy or run there. `--activity` lists the latest copies and commands agents made between computers.
- `lpm cp [--force] [--json] <SRC> <DST>` — copy a file or folder between this computer and one it connects to; one side is `NAME:PATH`, NAME being any part of a computer's name only it has (as `lpm connections` lists it), PATH may start with `~`. The other computer decides what this one's agents may copy there (nothing until the user turns it on in Settings → Connections), and the user allows each copy in lpm, so the command waits until they answer; keys, credentials and startup files always ask again. A folder lands inside an existing destination folder under its own name; files already there are replaced only with `--force` (the replaced ones are backed up). Only from a terminal in lpm; an automation's run can't copy. Don't retry a denied copy.
- `lpm exec --on NAME[:PATH] [--json] -- COMMAND…` — run a command on a computer this one connects to and get what it prints as it prints it, exiting with its exit code. NAME is matched as for `lpm cp`; `NAME:PATH` starts in that folder there (its home folder otherwise; write `~` after the colon, so it reads as that computer's home). One quoted argument is run by the shell there as written (`&&`, pipes, `cd`); several words are run as one command, each kept whole. Nothing is passed on stdin, and nothing interactive works; use `lpm cp` to move files. That computer decides whether this one's agents may run commands there (off until the user turns it on in Settings → Connections), and the user allows each command in lpm, or once for the tab, so the command waits until they answer. Stopping `lpm exec` stops the command there. Only from a terminal in lpm; an automation's run can't. Don't retry a denied command. A prompt may name a place on another computer as `NAME:PATH` (lpm's @ menu inserts these, e.g. `Mac mini:~/storefront`); use it as written with `lpm exec --on` and `lpm cp`.
- `lpm ports [--computers] [--json]` — every TCP port this machine listens on, with the project and service holding it, or the process name and PID when nothing of lpm's does (empty `project` in `--json`). `--computers` adds each connected paired computer's ports. Check it before freeing a port by hand: a port held by an lpm service is freed with `lpm service <name> stop`, not by killing its process.
- `lpm start [project] [--profile X]` / `lpm stop [project]` — start / stop a project's services.
- `lpm service <name> start|stop|restart [-p proj]` — one service. `restart` stops the run still going first, then runs the command again in the same pane.
- `lpm wait [project | -p proj] [--service X | --port N | --agent] [--timeout 60]` — block until ready: a service with a `ready` check when that check passes, otherwise when its port listens; `--agent` waits until an agent reports after the wait starts and none is still working (your own tab is ignored).
- `lpm duplicate [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--include-uncommitted | --exclude-uncommitted]` — create parallel working directories. Always pass a `--label` describing the copy's purpose so it's identifiable in the app — one repeated `--label` per copy in creation order, `<project-name>-<short-description>` style such as `lpm-fix-auth`. Only omit it when you genuinely can't infer a purpose. Output lists each copy's path.
- `lpm worktree [project] [-n N] [--label TEXT]... [--group X] [--run ACTION | --command CMD] [--prompt TEXT] [--reinstall-deps]` — create linked Git worktrees instead of standalone copies. The same labeling guidance applies. Output lists each worktree's path.
- `lpm remove <copy-name>` — remove a duplicate. For a linked worktree, this also removes its Git worktree registration and lpm-created branch. Originals and SSH projects (SSH duplicates too) need `--force`, and their folder is kept; don't use `--force` unless the user explicitly asks.
- `lpm run [action | --command CMD] [--prompt TEXT] [-p proj]` — queue in a new app terminal, fire-and-forget. It refuses inside an automation run, as do `duplicate` and `worktree` with `--run` or `--command`: the task would run outside the automation. `--prompt "/name args"` sends that skill's prompt with the arguments filled in, and fails if it still needs a value. A skill made in lpm wins over an agent's own of the same name; any other `/name` reaches the agent as typed, and so does every `--prompt` of `duplicate` and `worktree`.
- `lpm skills list [-p proj] [--global] [--json]` — the prompts saved as `/name` skills, run by typing `/name` in an agent's input. They are Agent Skills in `.agents/skills`, so agents read them outside lpm too. Lists only skills made in lpm: the project's and the global ones with each one's folder, description and the values it asks for. `--json` also gives each list's `others`: skills not made in lpm, with the agents that read them and their folder. lpm doesn't change their text; in the app they can be filed in folders or converted to lpm skills. Outside a project, the global list only.
- `lpm skills show <name> [-p proj] [--global] [--json]` — print a skill's prompt, the project's own before a global one of the same name.
- `lpm skills add <name> (--prompt TEXT | --file PATH | --stdin) [--description TEXT] [--folder NAME] [--keep-out-of-git] [-p proj] [--global] [--json]` — save one in the project's list, kept in git, or with `--global` in the list every project shares. `--keep-out-of-git` keeps a project skill out of the repo: it stays in the project folder, is never committed, and syncs to connected computers that hold the same repository. `--folder Parent/Child` keeps it in a folder inside another. Names are lowercase letters, numbers and single hyphens, and a name a skill not made in lpm already holds is refused. In a prompt `{{name}}` asks for a value (the last one takes the rest of the arguments), `{{branch}}`, `{{project}}` and `{{dir}}` fill themselves in (`{{dir}}` is the skill's own folder, so a prompt can point at files kept beside its `SKILL.md`; a global skill has no `{{dir}}` in an SSH project), and `$ARGUMENTS` takes every argument. Single-quote `--prompt` or use `--stdin`, so the shell leaves `$ARGUMENTS` alone.
- `lpm skills edit <name> [--prompt TEXT | --file PATH | --stdin] [--description TEXT] [--folder NAME] [--rename NEW] [--to project|global] [--keep-out-of-git | --in-git] [-p proj] [--global] [--json]` — change only what is given. An empty `--description` or `--folder` clears it; `--to` moves the skill to the other list. Pass `--global` to find it in the global list. `--keep-out-of-git` on a committed skill stages its removal for the user to commit: the file stays, past commits keep a copy, and computers that aren't connected lose it when they pull, so say so first. `--in-git` lets Git see it again. `lpm skills list --json` reports `keptOutOfGit` and `tracked` for each skill.
- `lpm skills rm <name> [-p proj] [--global] [--json]` — delete one. Without `--global` it looks only in the project's list. Delete only when the user asks.
- A project's duplicates and Git worktrees share its skills. A skill Git doesn't hold in a copy lives in the original project and is linked in, so `add`, `edit` and `rm` from any copy change it for all of them, a new one lands in the original, and removing a copy keeps its skills. Commit a new skill from the original. A skill Git holds in a copy stays at that branch's version until the change is merged or pulled.
- `lpm set-status <key> <value>` / `lpm clear-status <key>` — report an agent's status to the app UI. For the status a person sets on a project, use `lpm work-status`.
- `lpm rename <name> [-p proj] [--json]` / `lpm rename --clear` — rename a project or duplicate as lpm shows it, such as `app-sentry-7802475599-UAI-5401` once a duplicate has a ticket. Its folder and its project id stay as they are, so keep using the id with `-p`. Two projects can't share a name.
- `lpm work-status <status> [--note TEXT] [--emoji E] [-p proj] [--json]` / `lpm work-status --clear` — set the status a project or duplicate shows in the sidebar, as its Status menu does. `<status>` is `in-progress`, `blocked`, `done`, `review`, `ready`, `waiting`, `needs-decision`, `paused`, any status the user added, or a new name (give it an `--emoji`). `--note` is the line under the project's name, such as a ticket or a pull request.
- With no `-p`, both change the current project; in an automation run that means the copy the run works in, never the original. Use them only when the user or the automation's prompt asks for it.
- `lpm refresh-label [action] [-p proj]` — rerun the `$(…)` commands in an action's labels and emoji (with its menu items' and options') now and redraw labels built from git; no action refreshes every label in the project. Use it after changing what a dynamic label shows, such as at the end of a release script.
- `lpm update --check [--json]` — installed and available lpm versions, an install waiting to start, and whether services still run on an older lpm (`services.current: false`). `lpm update [--stable]` installs the newest release (`--stable`: back from a Beta build to the latest stable one) once no agent is mid-turn and no background action runs — including you, so inside an lpm terminal it installs after your turn ends; it returns at once with `state: "scheduled"`. Never pass `--now` from an lpm terminal: installing restarts lpm, which closes every terminal (agents reopen in their conversations, services keep running). `lpm update --cancel` calls off a waiting install. Services stay on the lpm they started on through an update; `lpm update --restart-services` stops and starts them all on the current one — only when the user asks, since every dev server restarts. Update only when the user asks.
- `lpm auto-pull [project] [--set on|off|default]` / `lpm auto-pull --all` — whether the app fast-forwards a project from origin by itself, and why. `--set` changes the project's own `autoPull` key through the running app, like `start`/`stop`; `default` removes it, so a duplicate or worktree follows its parent, else the Settings mode (Off / Chosen / All, changed only in the app). Change it only when the user asks.
- `lpm awake [agents|on|off|TIME|+TIME] [--then TIME] [--json]` — keep this machine from sleeping, as the app's Keep awake menu does: `agents` while any agent on it is working or waiting for an answer, then for a while after the last one finishes (`--then 10m`; 5 min by default); a time such as `45m`, `2h` or `1h30m`; `+1h` adds an hour to the time left (a set time, or the countdown after agents); `on` until `off`. No argument says what is on now. Use it when the user asks, or before a long job they leave running unattended (`lpm awake 2h`), for no longer than the job needs. Closing a laptop's lid still puts it to sleep.

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
- `lpm automations take-over <id> [-p proj | --global]` — stop a running Claude automation and carry its conversation on in a terminal tab, in the folder it was working in. Only when the user asks. It refuses inside an automation run.
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
- Git leaves ignored files out, so a worktree brings the ones the source project's `worktreeFiles` names (by default its `.env`-style local files); edit that key with `lpm-config` when the user wants a different set.
- Remove worktrees with `lpm remove`; do not move, trash, or delete their folders directly.
- If a standalone duplicate reports that the source is a linked Git checkout, retry with `lpm worktree`.

### Fan-out (parallel agents)

`lpm duplicate -n 3 --label <proj>-<purpose> --label <proj>-<purpose> --label <proj>-<purpose> --run <action> --prompt "..."` clones the project into 3 labeled copies and queues the task in each. Then, per copy: `lpm wait --agent -p <copy>` until it settles, review its work at the printed path (e.g. `git diff` there), and `lpm remove <copy>`.

Use `lpm worktree` for the fan-out when each copy should use an independent Git branch without duplicating repository data.

To create or edit project configs (services/actions/YAML), use the `lpm-config` skill.
