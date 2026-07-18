---
name: lpm-config
version: 1.0.0
description: Create and edit lpm YAML configs for projects, services, actions, terminals, profiles, SSH projects, and shared config layers. Use when the user explicitly asks to configure lpm, add an lpm service/action/button/terminal, edit `.lpm.yml`, or manage lpm templates or global config. For operating running projects, use `lpm-cli`.
---

# Configure lpm

Create, modify, and delete lpm config files on macOS. Prefer the `lpm config` commands for target resolution and validation because they use the same configuration model as the app.

## Load only the relevant reference

- Read [references/core.md](references/core.md) for project identity, services, dependencies, profiles, duplicates, and project creation.
- Read [references/actions.md](references/actions.md) when adding or changing actions, buttons, terminals, inputs, ports, shortcuts, or nested menus.
- Read [references/sharing.md](references/sharing.md) for `.lpm.yml`, global config, templates, `extends`, layering, and sparse overrides.
- Read [references/ssh.md](references/ssh.md) for remote projects or `mode: sync`.
- Read [references/validation.md](references/validation.md) before writing and follow its validation workflow afterward.

## Resolve the target

Honor an explicit project or layer from the user. Otherwise run:

```bash
lpm config resolve --cwd . --json
```

Interpret the result:

- One match: edit the returned `path` without asking for confirmation.
- Multiple matches: ask which candidate to use.
- No match: offer to create a project for the current directory or edit one of the returned `available` projects.

Use these explicit layer overrides:

- “globally” or “all my projects” → `~/.lpm/global.yml`
- “share with the team”, “check it in”, or “for everyone” → `<root>/.lpm.yml`
- “template” or “reuse across projects” → `~/.lpm/templates/<name>.yml`

When `lpm config resolve` is unavailable, inspect the YAML project files directly. Match the current directory against expanded `root` paths by path components; the deepest root wins. Do not parse YAML with line-oriented tools.

## Choose the shape

| Intent | Config shape |
|---|---|
| Long-running process started with the project | `services` |
| One-shot command or button | `actions` |
| Persistent interactive shell | `actions` with `type: terminal` |
| Start prerequisites first | service `dependsOn` |
| Ask for parameters | action `inputs` |
| Default action plus alternatives | parent `cmd` plus nested `actions` |
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

For an existing file, preserve unrelated fields and formatting where practical. Use shorthand only when an entry needs no options. Set `confirm: true` for destructive operations.

Confirm only before deleting a config file or overwriting an existing file during creation. Do not confirm an unambiguous target.

After every write, run:

```bash
lpm config validate <path> --json
```

Fix every reported error before finishing. Report warnings that affect the requested behavior. If the command is unavailable, follow the fallback checklist in [references/validation.md](references/validation.md).
