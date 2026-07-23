---
name: lpm-config
version: 1.2.0
description: Create and edit lpm YAML configs for projects, duplicates, worktree metadata, services, actions, terminals, profiles, SSH projects, and shared config layers. Use when the user explicitly asks to configure lpm, add an lpm service/action/button/terminal, edit `.lpm.yml`, or manage lpm templates or global config. For creating or removing linked Git worktrees and operating running projects, use `lpm-cli`.
---

# Configure lpm

Create and modify lpm config on macOS exclusively through `lpm config get` and `lpm config apply`. Never modify a live project, repo, global, or template config directly with an editor, filesystem tool, patch, redirection, or script. The CLI validates the candidate before the app atomically replaces the destination.

## Load only the relevant reference

- Read [references/core.md](references/core.md) for project identity, services, dependencies, profiles, duplicates, linked Git worktrees, and project creation.
- Read [references/actions.md](references/actions.md) when adding or changing actions, buttons, terminals, inputs, ports, shortcuts, or nested menus.
- Read [references/sharing.md](references/sharing.md) for `.lpm.yml`, global config, templates, `extends`, layering, and sparse overrides.
- Read [references/ssh.md](references/ssh.md) for remote projects or `mode: sync`.
- Read [references/validation.md](references/validation.md) before preparing a candidate and follow its transactional workflow.

## Resolve the target

Honor an explicit project or layer from the user. Otherwise run:

```bash
lpm config resolve --cwd . --json
```

Interpret the result:

- One match: use the returned project name with `lpm config get`; never edit the returned `path`.
- Multiple matches: ask which candidate to use.
- No match: offer to create a project for the current directory or configure one of the returned `available` projects.

Use these explicit layer overrides:

- “globally” or “all my projects” → `~/.lpm/global.yml`
- “share with the team”, “check it in”, or “for everyone” → `<root>/.lpm.yml`
- “template” or “reuse across projects” → `~/.lpm/templates/<name>.yml`

When `lpm config resolve` is unavailable, inspect the YAML project files read-only. Match the current directory against expanded `root` paths by path components; the deepest root wins. Do not parse YAML with line-oriented tools and do not write a config without `lpm config apply`.

## Choose the shape

| Intent | Config shape |
|---|---|
| Long-running process started with the project | `services` |
| One-shot command or button | `actions` |
| Persistent interactive shell | `actions` with `type: terminal` |
| Start prerequisites first | service `dependsOn` |
| Ask for parameters | action `inputs` |
| Default action plus alternatives | parent `cmd` plus nested `actions` |
| Split button whose main segment repeats the last used option | parent `primary: last-used` plus nested `actions` |
| Menu with no default | nested `actions` without parent `cmd` |
| Hidden command with completion notification | `type: background` |
| Send command into the focused terminal | `type: command` |
| Reused visible pane | `type: terminal` plus `reuse: true` |
| Team-shared config | `<root>/.lpm.yml` |
| Reusable action set | template plus `extends` |
| Remote execution | project `ssh` block |

Ask only when the requested shape is genuinely ambiguous. For “button with options,” distinguish a split button, dropdown, and input prompt. For a terminal action, distinguish one reused pane from a fresh pane each run.

## Apply the change

For a new project, inspect repo signals such as `package.json`, `Makefile`, `docker-compose.yml`, `Procfile`, and `mise.toml`. Detect long-running services separately from one-shot test, lint, build, migration, and deploy actions.

Read the selected layer and its revision:

```bash
lpm config get --layer project --project <name> --json
lpm config get --layer repo --project <name> --json
lpm config get --layer global --json
lpm config get --layer template --template <name> --json
```

Use `--create` with both `get` and `apply` when intentionally creating a missing project or template. Build the candidate from the returned `content` in a temporary file, preserving unrelated fields and formatting where practical. Use shorthand only when an entry needs no options. Set `confirm: true` for destructive operations.

Apply the candidate using the exact returned revision:

```bash
lpm config apply --layer <layer> <target-args> \
  --if-revision <revision> --file <candidate-path> --json
```

The command must return `applied: true` before reporting success. Fix validation errors in the temporary candidate and retry. On a revision conflict, run `get` again and reapply the intended change to the new content instead of forcing an overwrite.

Confirm only before replacing an existing config during intentional creation. Do not confirm an unambiguous edit. Config deletion must go through the lpm app; never delete a config file directly.

If the app is not running or `config get/apply` is unavailable, tell the user to start or update lpm. Do not fall back to direct writes.
