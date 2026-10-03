# Shared configuration and layering

Read this reference for global actions, repo-shared config, templates, `extends`, and sparse overrides.

## Layers

Actions and terminals resolve from highest to lowest precedence:

```text
personal project file
  > its extends templates
  > duplicate's parent file (duplicates only)
  > the parent's extends templates
  > repo <root>/.lpm.yml (local projects only)
  > its extends templates
  > ~/.lpm/global.yml
  > its extends templates
```

Higher layers win by field. Within `extends: [a, b, c]`, earlier templates win over later templates. Services and profiles come only from the project file, the duplicate's parent, and `.lpm.yml`; zones from the project file, the parent, `.lpm.yml`, and `global.yml` (see `zones.md`).

## Repo config

Write team-shared configuration to `<root>/.lpm.yml`. It supports `extends`, `services`, `actions`, `profiles`, and `zones` (declare terminals as actions with `type: terminal`). Do not put `name`, `root`, `label`, `parent_name`, `worktree`, `ssh`, `claudeAccount`, or `work_status` in this file.

```yaml
services:
  web:
    cmd: npm run dev
    port: 3000

actions:
  lint: npm run lint
```

Repo config applies only to local projects and sits below the personal project file.

## Global config

Write personal actions and terminals available to every project to `~/.lpm/global.yml`. It supports `extends`, `actions` (including `type: terminal` shells), and `zones`.

```yaml
actions:
  fetch-all:
    cmd: git fetch --all --prune
    type: background
```

## Templates

Store reusable action and terminal building blocks at `~/.lpm/templates/<name>.yml`:

```yaml
actions:
  logs:
    cmd: tail -f log/development.log
    type: terminal
    reuse: true
```

Reference a template by bare name from a project file, `.lpm.yml`, or `global.yml`:

```yaml
extends: [web-tools]
```

Templates contribute only `actions` and `terminals`; the validator rejects any other key in a template. Template loading is one level deep; a template’s own `extends` is not followed. A name with no matching template is skipped silently.

## Sparse overrides

A higher layer may set only selected fields:

```yaml
actions:
  deploy:
    position: 1
```

Unset fields inherit from lower layers. An empty string, `false` for `confirm` and `reuse`, or an omitted `position` also count as unset, so a sparse override cannot clear a lower value or turn a lower `true` into `false`; write the value you want, or redefine the entry fully in its own file.

These fields replace the lower value whole instead of merging: `env`, `port`, `inputs`, and child `actions`. A sparse override that sets any child `actions` drops every child of the lower entry.

The validator warns `no command or child actions; ensure this is a sparse override` for an override entry without `cmd`. That is expected; it errors only when no layer supplies a command or children.

When the requested layer is ambiguous, default to the personal project file and tell the user they can say “share with the team” to use `.lpm.yml` instead.
