# Projects, services, and profiles

Read this reference for project creation, identity, services, dependencies, profiles, duplicates, and linked Git worktrees.

- [Project files](#project-files)
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
| `extends` | Template names that provide actions. |
| `services` | Long-running commands. |
| `actions` | One-shot commands and buttons. |
| `terminals` | Deprecated alias for `actions` with `type: terminal`; still supported. |
| `profiles` | Named service subsets. |

Use short lowercase hyphenated keys such as `web`, `api-worker`, and `db-migrate`.

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
    env:
      DATABASE_URL: postgres://localhost/myapp
```

| Field | Type | Rule |
|---|---|---|
| `cmd` | string | Required and non-empty. |
| `cwd` | string | Relative to `root`, `~`-expanded, or absolute. Must exist for local projects. |
| `port` | integer | Single listening port from 0 to 65535; nonzero ports must be unique across services. |
| `portConflict` | string | `ask`, `free`, or `fail`; defaults to `ask`. |
| `env` | string map | Environment variables. |
| `dependsOn` | string list | Services that start first. `depends_on` is also accepted. |

Dependencies are transitive and determine start order. They do not wait for readiness and do not affect stop order. Reject unknown dependencies and cycles.

## Profiles

Profiles contain defined service names:

```yaml
profiles:
  default: [api, web]
  frontend-only: [web]
```

Starting without an explicit profile uses `default` when present; otherwise it starts every service.

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

The parent must exist and load successfully. Every duplicate inherits the parent’s services, actions, and profiles without per-entry overrides.

## Project detection

When creating a config, inspect:

- `package.json` scripts
- `Makefile`
- `docker-compose.yml`
- `Procfile`
- `mise.toml`
- framework-specific server, worker, test, lint, build, migration, and console commands

Classify long-running servers and workers as services. Classify finite commands as actions. Add interactive database consoles, REPLs, and shells as actions with `type: terminal`.
