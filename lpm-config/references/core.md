# Projects, services, and profiles

Read this reference for project creation, identity, services, dependencies, profiles, duplicates, and linked Git worktrees.

- [Project files](#project-files)
- [Claude account](#claude-account)
- [Auto pull](#auto-pull)
- [Services](#services)
- [Profiles](#profiles)
- [Duplicate projects](#duplicate-projects)
- [Project detection](#project-detection)

## Project files

Personal projects live at `~/.lpm/projects/<name>.yml`:

```yaml
name: myapp
root: ~/Projects/myapp
label: My Application

services:
  web: npm run dev
```

| Field | Meaning |
|---|---|
| `name` | Optional identifier; defaults to the filename stem. Reject empty names, path separators, `.`, `..`, and `global`. |
| `root` | Local project root. Set this or `ssh`, never both. |
| `label` | Optional display name. |
| `parent_name` | Existing project inherited by a duplicate. |
| `worktree` | Set to `true` only for a linked Git worktree duplicate created by lpm; requires `parent_name`. |
| `worktreeFiles` | `copy` and `link` lists of git-ignored files (`.env`, local keys) that each new worktree of this project brings; see [Duplicate projects](#duplicate-projects). |
| `claudeAccount` | Claude account id that this project's terminals, actions, and AI features always run as; see [Claude account](#claude-account). |
| `claudeAccounts` | Ordered Claude account ids that new sessions take turns on; see [Claude account](#claude-account). |
| `autoPull` | `true` or `false`: whether the app fast-forwards this project from origin by itself; omit to follow the parent or the Settings mode. See [Auto pull](#auto-pull). |
| `work_status` | Status badge written by the app's status menu. Keep it as returned; do not author it. |
| `extends` | Bare template names whose actions sit under this file's; see `sharing.md`. |
| `services` | Long-running commands. |
| `actions` | One-shot commands and buttons. |
| `terminals` | Deprecated alias for `actions` with `type: terminal`; still supported. |
| `profiles` | Named service subsets. |
| `zones` | Framed groups of header or footer buttons; see `zones.md`. |

A project needs at least one service after layering (its own or from the repo `.lpm.yml`), unless it is a duplicate.

## Claude account

`claudeAccount` pins the project to a Claude Code account added in lpm Settings → Accounts & usage. Processes the project starts get `CLAUDE_CONFIG_DIR` pointing at that account's own config directory, so its login stays separate while settings, memory, and skills stay shared.

```yaml
claudeAccount: work
```

- The value is an account id from Settings: letters, digits, `-`, or `_`. An id that no longer exists falls back to the main login.
- Set `claudeAccount: ""` to always use the main login.
- Omit both keys to use the main accounts from Settings (just the main login unless switching is turned on there).
- `claudeAccounts` lists up to three ids (`default` is the main login). When switching is on in Settings, each new session starts on the first listed account under 90% of its 5-hour and weekly limits; the project never uses accounts outside its list. `claudeAccount` wins when both are set.

```yaml
claudeAccounts: [work, side]
```

- A duplicate without either key follows its parent's choice; `claudeAccounts: []` in its own file means the main accounts instead.
- SSH projects ignore both; the remote host has its own login.
- A duplicate's own file can only be changed in the app (the project's account menu), because `--layer project` targets the parent's file.

Use short lowercase hyphenated keys such as `web`, `api-worker`, and `db-migrate`.

## Auto pull

The app fetches every project's origin in the background. Settings › Git › Auto pull picks the mode: Off, Chosen (only projects set to on), or All (every project not set to off). `autoPull` decides for one project:

```yaml
autoPull: true
```

- Mode Off: nothing pulls, whatever the key says.
- Otherwise the project's own `autoPull` wins; a duplicate or worktree without one follows its parent's; then Chosen means off and All means on.
- The app only fast-forwards a branch that tracks origin and is behind it, with no unpushed commits, no uncommitted changes to tracked files, no merge or rebase in progress, and no agent working in the project. A pull can be undone from the app.
- When origin moves in one project (a push from lpm or a terminal, or a fetch), the app fetches the other copies of that repository on that branch, here and on connected computers, so the ones set to auto pull catch up within seconds rather than at their next background check.
- Set or clear it with `lpm auto-pull <project> --set on|off|default` (see `lpm-cli`; needs the app running). The app writes the project's own file, so it also works on a duplicate, where `--layer project` would write the parent's.

## Services

Use a string when only a command is needed:

```yaml
services:
  web: npm run dev
```

Use the full form for options:

```yaml
services:
  db: docker compose up postgres
  api:
    cmd: go run ./cmd/server
    cwd: ./backend
    port: 8080
    portConflict: ask
    dependsOn: [db]
    ready: port
    env:
      DATABASE_URL: postgres://localhost/myapp
```

| Field | Type | Rule |
|---|---|---|
| `cmd` | string | Required and non-empty in every service entry, including one that overrides a repo service. |
| `cwd` | string | Relative to `root`, `~`-expanded, or absolute. Must exist for local projects. |
| `port` | integer | Single listening port from 0 to 65535; nonzero ports must be unique across services. |
| `portConflict` | string | `ask`, `free`, or `fail`; defaults to `ask`. |
| `env` | string map | Environment variables. |
| `dependsOn` | string list | Services that start first. `depends_on` is also accepted, but never both on one service. In a project file the app then fails to load the project; in a repo `.lpm.yml` it silently drops every service and profile from that file. |
| `ready` | see below | When the service counts as ready. Services that depend on it start once it is. |

Dependencies are transitive and determine start order. They do not affect stop order. Reject unknown dependencies and cycles.

A service starts once every service in its `dependsOn` is ready. A dependency without `ready` counts as ready as soon as it starts, so without any `ready` checks services start one after another without waiting. `ready` takes one check:

| Form | Ready when |
|---|---|
| `ready: port` | the service's own `port` accepts connections (the service must set `port`) |
| `ready: 4001` | that port accepts connections |
| `ready: http://localhost:4000/health` | the URL answers with a 2xx status (`https://` too; certificates aren't checked) |
| `ready: { log: "ready in" }` | a line of the service's output contains that text (plain, case-sensitive) |
| `ready: { port: true \| <n>, url: …, log: …, timeout: 60 }` | the mapping form: exactly one of `port`, `url` or `log`, plus `timeout` |

`timeout` is in seconds (1 to 3600, default 30). While a check hasn't passed, the service's tab shows Starting and its dependents' tabs show Waiting. When it times out, its tab shows Not ready and its dependents start anyway, so a start never hangs. Checks on an SSH project run on the host. `lpm wait --service <name>` waits for the same check.

A project-file service with the same key as a repo `.lpm.yml` service wins field by field: an empty `cwd`, zero `port`, empty `portConflict`, empty `env`, or no `ready` falls back to the lower file, and a non-empty `env` replaces it whole. Repeat `dependsOn` in the overriding entry when the service needs dependencies. `global.yml` and templates hold no services.

## Profiles

Profiles contain defined service names:

```yaml
profiles:
  default: [api, web]
  frontend-only: [web]
```

Starting without an explicit profile uses `default` when present; otherwise it starts every service. A profile in the project file replaces a repo profile of the same name.

## Duplicate projects

A standalone duplicate contains only its identity, root, and parent:

```yaml
name: myapp-feature
root: ~/Projects/myapp-feature
parent_name: myapp
```

A linked Git worktree duplicate also contains the lifecycle marker:

```yaml
name: myapp-feature
root: ~/Projects/myapp-feature
parent_name: myapp
worktree: true
```

Create it with `lpm duplicate myapp --worktree --label myapp-feature`. Do not add or remove `worktree: true` manually to convert an existing project: lpm must create the Git worktree registration and its `lpm/<copy-name>` branch.

The source must be a local Git repository whose lpm root equals the repository root, with at least one commit. The worktree starts at the source’s current `HEAD` and does not include uncommitted changes. Remove it with `lpm remove <copy-name>` so lpm also removes the worktree registration and generated branch; do not move, trash, or delete its folder directly.

Git leaves ignored files out of a worktree, so the original project's file can name the ones each new worktree brings. Paths are inside the project; `copy` gives each worktree its own copy, `link` a symlink to the project's file (a copy on Windows when the link can't be made). A file the worktree already has is left alone.

```yaml
name: myapp
root: ~/Projects/myapp
worktreeFiles:
  copy: [.env, .env.local]
  link: [config/master.key]
```

Without `worktreeFiles`, worktrees copy the ignored files that look like local configuration (`.env*` other than templates, `*.local`, keys); `worktreeFiles: {}` brings none. The New worktree dialog's Options write this key, and a worktree of a worktree uses the original project's choice.

The parent must exist and load successfully. Every duplicate inherits the parent’s services, actions, zones, profiles, and Claude account choice (`claudeAccount` or `claudeAccounts`) without per-entry overrides, and follows the parent's `autoPull` unless it sets its own. A duplicate's own file may hold only `name`, `root`, `label`, `parent_name`, `worktree`, `claudeAccount`, `claudeAccounts`, `autoPull`, and `work_status`; the validator rejects `extends`, `ssh`, `services`, `actions`, `terminals`, `profiles`, and `zones` there.

`lpm config get` and `lpm config apply` with `--layer project --project <duplicate>` read and write the parent's file, so a change there reaches the parent and every copy.

## Project detection

When creating a config, inspect:

- `package.json` scripts
- `Makefile`
- `docker-compose.yml`
- `Procfile`
- `mise.toml`
- framework-specific server, worker, test, lint, build, migration, and console commands

Classify long-running servers and workers as services. Classify finite commands as actions. Add interactive database consoles, REPLs, and shells as actions with `type: terminal`.
