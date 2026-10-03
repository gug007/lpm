# Actions and terminals

Read this reference for actions, buttons, terminals, zones, input prompts, ports, shortcuts, and nested menus. An action entry is either a command string or the mapping described below.

- [Shapes](#shapes)
- [Command quoting](#command-quoting)
- [Fields](#fields)
- [Zones](#zones)
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
| `display` | string | `header` by default, `footer`, or the name of a zone (see Zones); `menu` is legacy. Do not use deprecated `button`. |
| `layer` | string | With `display: <zone>`, the key of the zone layer the button sits in; see Zones → Layers. |
| `primary` | string | On a parent with child `actions`, `last-used` or a child key; sets which child the split button's main segment runs. |
| `type` | string | Omit for the inline runner, or use `terminal`, `command`, or `background`. |
| `reuse` | boolean | With `type: terminal`, reuse the same pane. |
| `mode` | string | `remote` or `sync`; see `ssh.md`. |
| `port` | number, range string, or list | Ports that must be free before running. |
| `portConflict` | string | `ask`, `free`, or `fail`. |
| `position` | number | Lower values render first; floats are allowed. |
| `inputs` | mapping | Values prompted before execution and substituted into `{{key}}`. |
| `actions` | mapping | Nested child actions. |

## Zones

A zone is a framed spot in the desktop header or footer that holds buttons as buttons, not as menu items. It is 1, 2 or 3 rows of its bar tall, keeps that height when empty, and fills top to bottom, then the next column.

```yaml
zones:
  build:
    rows: 2          # 1, 2 or 3; an entry with rows declares the zone
    label: Build     # optional, shown in menus
    position: 3      # optional, order among the items of its bar
  deploy:
    rows: 1
    display: footer  # header (default) or footer
actions:
  ios:
    cmd: make ios
    display: build   # show inside zone "build"
    position: 1      # order inside the zone
```

- Declare a zone in the project file, the repo `.lpm.yml`, or `global.yml`. A higher file wins field by field: project file > duplicate's parent > repo `.lpm.yml` (local projects only) > `global.yml`.
- A duplicate's own file can't declare zones (the validator rejects them); it inherits its parent's.
- A zone entry without `rows` only adjusts a zone declared in another file — for example a `position` or `display` note in the project file.
- `display` is `header` (the default) or `footer`; any other value is an error. Footer zones and footer buttons share one `position` numbering, as header zones and header buttons do.
- Zone names can't be empty, `header`, `footer`, `menu` or `button`, and can't contain `:` or `/`.
- Zones hold placement only. A button keeps its definition wherever it is declared; `display: <zone>` (usually written to the project file by drag and drop) puts it in the zone.
- A button whose `display` names a zone that doesn't exist shows in the header.

### Layers

A zone can hold keyed layers that it slides between, each layer a separate set of buttons. A button points at one with `layer: <key>`.

```yaml
zones:
  build:
    rows: 2
    layers:
      mobile:
        label: Mobile    # optional, shown next to the dots
        position: 1
      layer-2:
        position: 2      # no label: dots only
actions:
  ios:
    display: build
    layer: layer-2       # no layer: the zone's first layer
```

- A layer entry holds only `label` (string) and `position` (number). Layer keys can't contain `:` or `/`.
- The first layer is the one with the lowest `position`, ties broken by key. A button without `layer`, or naming a layer the zone doesn't have, shows in the first layer.
- Dots appear only when the zone has 2 or more layers.
- Layers merge across config files per layer key, field by field, like zones.
- Adding a second layer to a zone without layers writes two: `layer-1`, which keeps today's buttons, and `layer-2`. A layer created without a name gets the key `layer-<n>`.

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

Input fields support `label`, `type`, `required`, `placeholder`, `default`, `persist`, `options`, and `position`. Types are `text` (default), `password`, and `radio`. A radio input requires options, and its default must match an option value. Options may be strings or `{label, value}` mappings.

Inputs are prompted in `position` order, then in key order. Set `position` when the prompt order should follow the command rather than the alphabet; leave it off when key order already reads correctly.

`{{key}}` tokens substitute into `cmd`, `cwd`, `env` values, and the action's `prompt`. In `cmd` the answer is shell-quoted automatically when it contains spaces or shell metacharacters, so an answer is always one argument and never a second command; do not wrap tokens in your own quotes. Use `{{key|raw}}` to splice an answer into `cmd` verbatim when it is deliberately a command fragment. Substitution into `cwd`, `env`, and `prompt` is always verbatim — those are not shell text.

`persist` is ignored for `password` inputs: secrets are never stored.

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
