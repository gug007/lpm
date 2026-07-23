# Actions and terminals

Read this reference for actions, buttons, terminals, input prompts, ports, shortcuts, and nested menus. An action entry is either a command string or the mapping described below.

- [Shapes](#shapes)
- [Command quoting](#command-quoting)
- [Fields](#fields)
- [Action types](#action-types)
- [Inputs](#inputs)
- [Ports](#ports)
- [Destructive operations](#destructive-operations)

## Shapes

```yaml
actions:
  test: npm test

  logs:
    cmd: tail -f log/development.log
    type: terminal
    reuse: true

  deploy:
    cmd: ./deploy.sh staging
    label: Deploy
    confirm: true
    actions:
      production:
        cmd: ./deploy.sh production
        confirm: true

  database:
    label: Database
    actions:
      migrate: rails db:migrate
      seed: rails db:seed
```

- `cmd` with children creates a split button: the label runs the default and the chevron opens alternatives.
- Children without a parent `cmd` create a dropdown.
- Nested `actions` may continue to any depth.
- Children inherit `cwd`, `env`, `mode`, `type`, and `portConflict` through the tree. Child values win.
- `primary` makes the split button's main segment run one of the children instead of the parent `cmd`. See [Primary child](#primary-child).

## Primary child

On a parent with nested `actions`, `primary` chooses which child the split button's main segment shows and runs. The chevron still opens the full list.

```yaml
actions:
  Deploy:
    display: header
    primary: last-used
    actions:
      Staging: ./deploy.sh staging
      Prod: ./deploy.sh prod
```

- `primary: last-used` makes the main segment repeat whichever child was run most recently, whether from the segment or the menu. The choice is remembered per project and never written back to config.
- `primary: <childName>` pins one child by its key, for example `primary: Prod`.
- If the named or remembered child is missing, the main segment falls back to the first runnable child.
- `primary` takes precedence over the parent's own `cmd`, which is then reachable only through nothing else — leave it off when using `primary`.

## Command quoting

Use a block scalar when a command contains YAML-sensitive text such as `: `, ` #`, shell quotes, or input placeholders:

```yaml
actions:
  review:
    cmd: >-
      claude "PR links to review: {{prs}}. Follow the review instructions."
```

Shell quotes inside an otherwise plain YAML value do not quote the value for YAML. Validate the finished file before continuing.

## Fields

| Field | Type | Rule |
|---|---|---|
| `cmd` | string | Required unless child `actions` exist or this is a valid sparse override. |
| `label` | string | Display label; defaults to the key. |
| `emoji` | string | Separate icon shown in the UI. |
| `shortcut` | string | Global shortcut such as `cmd+shift+b`; require `cmd`/`ctrl` or `alt`/`opt` plus a key. |
| `cwd` | string | Relative to the local root or remote `ssh.dir`; local paths must exist. |
| `env` | string map | Environment variables. |
| `confirm` | boolean | Confirm before destructive or irreversible commands. |
| `display` | string | `header` by default or `footer`; `menu` is legacy. Do not use deprecated `button`. |
| `primary` | string | On a parent with child `actions`, `last-used` or a child key; sets which child the split button's main segment runs. |
| `type` | string | Omit for the inline runner, or use `terminal`, `command`, or `background`. |
| `reuse` | boolean | With `type: terminal`, reuse the same pane. |
| `mode` | string | `remote` or `sync`; see `ssh.md`. |
| `port` | number, range string, or list | Ports that must be free before running. |
| `portConflict` | string | `ask`, `free`, or `fail`. |
| `position` | number | Lower values render first; floats are allowed. |
| `inputs` | mapping | Values prompted before execution and substituted into `{{key}}`. |
| `actions` | mapping | Nested child actions. |

## Action types

- Omit `type` for a one-shot command with visible streamed output.
- Use `type: terminal` for a persistent visible pane such as a watcher, log tailer, or REPL.
- Use `type: command` to submit the command into the currently focused terminal.
- Use `type: background` for hidden finite work that only needs a completion notification.

Declare always-available interactive shells as actions with `type: terminal`. A standalone `terminals:` section is a deprecated alias that still loads, but new configs should use `type: terminal` under `actions:`.

## Inputs

```yaml
actions:
  deploy:
    cmd: ./deploy.sh --env {{env}} --tag {{tag}}
    confirm: true
    inputs:
      env:
        type: radio
        label: Environment
        options: [staging, production]
        default: staging
        required: true
        persist: true
      tag:
        label: Release tag
        placeholder: v1.0.0
```

Input fields support `label`, `type`, `required`, `placeholder`, `default`, `persist`, and `options`. Types are `text` (default), `password`, and `radio`. A radio input requires options, and its default must match an option value. Options may be strings or `{label, value}` mappings.

## Ports

```yaml
actions:
  dev:
    cmd: npm run dev
    port: [3000, "3002-3010", 8080]
    portConflict: ask
```

Use integers or quoted inclusive ranges between 0 and 65535. A service `port` is different: it accepts one integer describing the port the service listens on.

## Destructive operations

Set `confirm: true` for deploys, releases, database resets or drops, cleanup commands, and anything touching production.
