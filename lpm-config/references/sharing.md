# Shared configuration and layering

Read this reference for global actions, repo-shared config, templates, `extends`, and sparse overrides.

## Layers

The precedence from lowest to highest is:

```text
templates < global < .lpm.yml < personal project
```

Higher layers win by field. Within `extends: [a, b, c]`, earlier templates win over later templates.

## Repo config

Write team-shared configuration to `<root>/.lpm.yml`. It supports `extends`, `services`, `actions`, `terminals`, and `profiles`. Do not put `name`, `root`, `parent_name`, or `ssh` in this file.

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

Write personal actions and terminals available to every project to `~/.lpm/global.yml`. It supports `extends`, `actions`, and `terminals`.

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

Reference a template by bare name:

```yaml
extends: [web-tools]
```

Templates contribute only actions and terminals. Template loading is one level deep; a template’s own `extends` is not followed.

## Sparse overrides

A higher layer may set only selected fields:

```yaml
actions:
  deploy:
    position: 1
```

Unset fields inherit from lower layers. Boolean `false` means “inherit” for `confirm` and `reuse`, so a sparse override cannot turn a lower `true` into `false`. Redefine the entry fully when that change is required.

When the requested layer is ambiguous, default to the personal project file and tell the user they can say “share with the team” to use `.lpm.yml` instead.
