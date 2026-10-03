# Actions and terminals

Read this reference for actions, buttons, terminals, input prompts, ports, shortcuts, colors, agent prompts, and nested menus. For zones and layers, read [zones.md](zones.md). An action entry is either a command string or the mapping described below.

- [Shapes](#shapes)
- [Command quoting](#command-quoting)
- [Fields](#fields)
- [Zones](#zones)
- [Action types](#action-types)
- [Agent prompt](#agent-prompt)
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
- Children inherit `cwd`, `mode`, `type`, and `portConflict` through the tree; a child's own value wins. A child's `env` is merged over its parent's key by key.
- Children are ordered by `position`, then by key. Only top-level entries are header, footer, or zone buttons; children are menu items.
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
- If the named or remembered child is missing, the main segment falls back to the first runnable child. `lpm config apply` warns when `primary` names a key the entry's own children don't have.
- With `primary` set, the main segment runs a child, never the parent's own `cmd`, so leave `cmd` off the parent.

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
| `emoji` | string | Icon shown on the button and on the terminal tab it opens. |
| `color` | string | Accent for the button and its terminal tab: a named accent (`red`, `orange`, `claude`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, `slate`, `gray`, `stone`), a named accent plus `-deep` such as `blue-deep`, or any CSS color such as `"#8b5cf6"` (quote a leading `#`). |
| `shortcut` | string | Shortcut that runs the action while the project is open, such as `cmd+shift+b`: `cmd` (`ctrl` counts as `cmd`) or `alt`/`opt`, optionally `shift`, and exactly one key. |
| `cwd` | string | Relative to the local root or remote `ssh.dir`; local paths must exist. |
| `env` | string map | Environment variables. |
| `confirm` | boolean | Confirm before destructive or irreversible commands. |
| `display` | string | `header` by default, `footer`, or the key of a zone (see [zones.md](zones.md)); `menu` is legacy. Do not use deprecated `button`. |
| `layer` | string | With `display: <zone>`, the key of the zone layer the button sits in. |
| `primary` | string | On a parent with child `actions`, `last-used` or a child key; sets which child the split button's main segment runs. |
| `prompt` | string | With `type: terminal` and an agent CLI `cmd`, the task submitted to the agent once it is ready; see [Agent prompt](#agent-prompt). |
| `type` | string | Omit for the inline runner, or use `terminal`, `command`, or `background`. |
| `reuse` | boolean | With `type: terminal`, reuse the same pane. |
| `mode` | string | `remote` or `sync`; see `ssh.md`. |
| `port` | number, range string, or list | Ports that must be free before running. |
| `portConflict` | string | `ask`, `free`, or `fail`. |
| `position` | number | Lower values render first; unpositioned entries follow by key; floats are allowed. Inside a zone it orders the zone's buttons. |
| `inputs` | mapping | Values prompted before execution and substituted into `{{key}}`. |
| `actions` | mapping | Nested child actions. |

## Zones

To place buttons in framed header or footer zones, or in zone layers, read [zones.md](zones.md). In short: `display: <zone>` puts a top-level button in a zone, `layer: <key>` picks the layer, and `position` orders it inside.

## Action types

- Omit `type` for a one-shot command with visible streamed output.
- Use `type: terminal` for a persistent visible pane such as a watcher, log tailer, or REPL.
- Use `type: command` to submit the command into the currently focused terminal.
- Use `type: background` for hidden finite work that only needs a completion notification.

Declare always-available interactive shells as actions with `type: terminal`. A standalone `terminals:` section is a deprecated alias that still loads (its entries default to `type: terminal` and take the same fields), but new configs should use `type: terminal` under `actions:`.

## Agent prompt

`prompt` hands a task to the AI agent a terminal action launches. It applies to `type: terminal` actions whose `cmd` runs `claude`, `codex`, `gemini`, or `opencode`; the text is submitted once the agent is ready.

```yaml
actions:
  review:
    cmd: claude
    type: terminal
    emoji: "🔍"
    color: claude
    inputs:
      pr:
        label: PR link
        required: true
    prompt: >-
      Review {{pr}} and list blocking issues first.
```

`{{key}}` input tokens are filled into `prompt` verbatim.

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

Input fields support `label` (defaults to the key), `type`, `required`, `placeholder`, `default`, `persist`, `options`, and `position`. Types are `text` (default), `password`, and `radio`. A radio input requires options, and its default must match an option value. Options may be strings or `{label, value}` mappings; a mapping needs both `label` and `value`, or the app drops every action in the file.

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
