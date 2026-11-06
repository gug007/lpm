# Actions and terminals

Read this reference for actions, buttons, terminals, input prompts, ports, shortcuts, colors, agent prompts, and nested menus. For zones and layers, read [zones.md](zones.md). An action entry is either a command string or the mapping described below.

- [Shapes](#shapes)
- [Command quoting](#command-quoting)
- [Scripts](#scripts)
- [Fields](#fields)
- [Dynamic labels](#dynamic-labels)
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

## Scripts

When a command outgrows one line, move it into a script and run the script from `cmd`. Where the script lives decides whether it reaches the user's other Macs:

- Part of the project: commit it to the repo and run it by relative path (`cmd: ./scripts/deploy.sh`). It travels with Git.
- Not part of a repo (an action in `global.yml`, a template, an automation, a personal helper): save it in `~/.lpm/scripts/` and run it by full path (`cmd: ~/.lpm/scripts/disk-cleanup.sh`). lpm syncs that folder between paired Macs, includes it in config export, and a synced script arrives executable.

A script anywhere else stays on this Mac, so the synced action fails on the others. Start the script with a shebang and `chmod +x` it. Writing the script file directly is fine; the config that calls it still goes through `lpm config apply`.

### Files behind a button

A button with a `labelSvg` or a `popup` keeps its files in one folder named after the button, in the same two places as any script: `scripts/<button>/` in the repo, or `~/.lpm/scripts/<button>/` when it isn't part of a repo. Use these names, and leave out what the button doesn't use:

| File | What it does | Used by |
|---|---|---|
| `button.sh` | Prints the button's `<svg>` | `labelSvg` |
| `data.sh` | Prints the popup's data | the popup's `data` |
| `popup.html` | The popup's page | the popup's `html` |

```yaml
actions:
  stars:
    cmd: gh repo view --web
    labelSvg: $(./scripts/stars/button.sh)
    popup:
      html: scripts/stars/popup.html
      data: $(./scripts/stars/data.sh)
```

In a config outside a repo (the project file, `global.yml`, a template), the same paths start with `~/.lpm/scripts/stars/`.

- Anything else the button needs, such as a library the page loads, goes in the same folder.
- Relative paths start from the action's `cwd`, which is the project root by default.
- A repo's `.lpm.yml` uses relative paths, never `~/.lpm/scripts/`: that folder exists only on the user's own computers, so the files are missing for anyone else who clones the repo.
- An SSH project reads the page and runs the commands on the host, and `~/.lpm/scripts/` doesn't sync there. Keep the files in the project's directory on the host, or write the page in place.
- A small static `<svg>` or page needs no folder: write it in place in the config.

## Fields

| Field | Type | Rule |
|---|---|---|
| `cmd` | string | Required unless child `actions` exist or this is a valid sparse override. |
| `label` | string | Display label; defaults to the key. May hold variables and `$(…)` commands; see [Dynamic labels](#dynamic-labels). |
| `labelSvg` | string | The `<svg>` the button draws in place of its text label, inline or printed by `$(…)`; see [SVG labels](#svg-labels). `label` stays the button's name and its fallback. |
| `labelRefresh` | number or string | How often the action's `$(…)` commands run: seconds, or a number with `s`, `m` or `h` such as `5m`. Defaults to `1m`; the floor is `5s`. |
| `labelRefreshOnHover` | boolean | Run the action's `$(…)` commands again when the pointer rests on the button; see [Dynamic labels](#dynamic-labels). |
| `labelRefreshOnChange` | boolean | Run the action's `$(…)` commands again soon after files in the project change; see [Dynamic labels](#dynamic-labels). |
| `emoji` | string | Icon shown on the button and on the terminal tab it opens. `✻`, `◆`, `✦` and `▣` draw the Claude Code, Codex, Gemini and OpenCode marks. May hold variables and `$(…)` commands; see [Dynamic labels](#dynamic-labels). |
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
| `popup` | string or mapping | A page shown in a card while the pointer rests on the button, or on a long press in lpm Link; see [Popups](#popups). |
| `actions` | mapping | Nested child actions. |

## Dynamic labels

A label can change on its own: a button's `label` and `emoji`, an input's `label`, and a radio option's `label`. Use `{{…}}` variables for facts lpm reads itself, and `$(…)` for anything a command can print; the command's first line of output takes its place. In a repo's `.lpm.yml`, `$(…)` commands, `labelSvg` and popup commands wait until the user allows them (see [sharing.md](sharing.md#repo-config)).

```yaml
actions:
  release:
    cmd: ./scripts/release.sh {{bump}}
    label: "Release · $(git describe --tags --abbrev=0) · {{git.tagAge:v*}}"   # Release · v0.7.13 · 6h ago
    emoji: '$([ -n "$(git log "$(git describe --tags --abbrev=0)"..HEAD --oneline)" ] && echo 🟡 || echo 🟢)'
    labelRefresh: 5m
    labelRefreshOnHover: true
    confirm: true
    type: background
    inputs:
      bump:
        label: What kind of release?
        type: radio
        default: patch
        options:
          - label: "Patch — bug fixes ({{git.nextPatch:v*}})"       # Patch — bug fixes (v0.7.14)
            value: patch
          - label: "Minor — new features ({{git.nextMinor:v*}})"    # Minor — new features (v0.8.0)
            value: minor
          - label: "Major — breaking changes ($(./scripts/next.sh major))"
            value: major
```

| Variable | Value |
|---|---|
| `{{git.branch}}` | The checked-out branch, or the short commit when HEAD is detached. |
| `{{git.tag}}` | The newest tag by creation date. `{{git.tag:v*}}` only considers tags matching the glob. |
| `{{git.tagAge}}` | How long ago that tag was made, such as `just now`, `6h ago` or `2d ago`. Takes the same `:pattern`. |
| `{{git.nextPatch}}`, `{{git.nextMinor}}`, `{{git.nextMajor}}` | The version after the highest version tag, keeping its prefix: from `v0.7.13`, `v0.7.14`, `v0.8.0` and `v1.0.0`. Takes the same `:pattern`. Empty until a version tag exists. |
| `{{project}}` | The project's display name. |

- The git variables read the repository holding the project root, so each copy and worktree shows its own branch and tags. A lightweight tag has no date of its own; its age is its commit's. Tag with `git tag -a` to show the exact release time.
- The next-version variables bump from the highest version (`git tag --sort=-v:refname`), the tag a release script usually starts from, while `{{git.tag}}` is the newest by date. A pre-release suffix is dropped before bumping.
- `$(…)` works as in the shell: quotes, escapes and nested `$(…)` inside it are fine. Single-quote the YAML value when the command has double quotes of its own, as the emoji above does; move anything longer into a script. Variables are not filled inside a command, so a branch or tag name never becomes shell code.
- Commands run in the action's `cwd` with its `env` and `LPM_PROJECT_NAME`, through the same login shell as the action, with a 15-second timeout. They run when lpm starts, on the action's `labelRefresh` interval (one schedule for its label, emoji, input and option labels), and after a background run of any action in the project. The first line of output is used, cut to 60 characters. Until a command has succeeded with some output it reads as empty. A run that exits non-zero or times out keeps the last output, so an API error a command prints never takes the label's place; end a command whose exit status isn't about failure, such as `grep -c` (exits 1 when it counts 0), with `|| true`.
- `emoji` shows the first word of what it renders to, so a command can print `🟡 3 unreleased` and the emoji reads `🟡`; with nothing rendered the button shows no emoji. A terminal tab takes the emoji the button shows when the tab opens and keeps it, as it keeps its name.
- `labelRefreshOnChange: true` runs the action's commands, and those of its menu items and options, again about half a second after files in the project change: an edit, a save from an agent, a commit, a checkout. Folders such as `node_modules`, `dist` and `target` and Git's internal files are ignored, a burst of changes runs each command once, and a command that ran less than 2 seconds ago runs again once that time has passed. Use it for a label that reads the code, such as a count of TODO comments; it watches local projects only, so an SSH project keeps the `labelRefresh` interval.
- `labelRefreshOnHover: true` runs the action's commands, and those of its menu items and options, again when the pointer rests on its button, at most every 5 seconds, so the label and the prompt it opens are current. It needs a pointer, so lpm Link relies on the `labelRefresh` interval.
- `lpm refresh-label <action>` does the same from a script, without the 5-second limit, and `lpm refresh-label` with no action refreshes every label in the project. Call it after a script changes what a label shows, for example at the end of a release script.
- When a variable or command is empty, brackets and separators it leaves behind (`()`, `[]`, and `·`, `|`, `-`, `/`, `:` and similar standing alone between spaces) are dropped: with no tags, `Patch — bug fixes ({{git.nextPatch}})` reads `Patch — bug fixes`. When nothing is left, a label shows the action's key.
- An unknown `{{name}}`, or a `$(` that never closes, shows as written, and `lpm config apply` warns about it. Input `{{key}}` tokens fill `cmd`, `cwd`, `env` and `prompt`, never a label.
- The button, the prompt and lpm Link update by themselves: a new tag or branch shows within a few seconds, command output when it next runs, and ages as they tick over.
- Edit forms show and save labels and emoji as written, never their current value.

## SVG labels

`labelSvg` draws the button's face from an SVG: a sparkline, a count over a chart, a badge. It renders like a dynamic label (variables and `$(…)`, on `labelRefresh` and the other refresh settings), except that a command's whole output is kept, up to 32 KB, not just its first line.

```yaml
actions:
  stars:
    label: $(gh api repos/gug007/lpm --jq .stargazers_count)   # the name, and what shows when the markup can't
    labelSvg: $(./scripts/stars/button.sh)
    labelRefresh: 10m
```

- Keep the command with the button's other files; see [Files behind a button](#files-behind-a-button).
- The `<svg>` is drawn as an image that fills the button edge to edge, so nothing in it runs, loads or touches the app: scripts, event handlers, links and `url(…)` are removed, and it can't reach outside the button.
- It's drawn at its own `width` and `height` (`30` is the header button's height). Nothing measures it for you, so size the `width` to its contents, allowing for a number that grows.
- It reads lpm's colors as CSS variables (`var(--lpm-text)`, `--lpm-accent`, `--lpm-muted`, `--lpm-amber`, `--lpm-green`, `--lpm-red`, `--lpm-border`, `--lpm-bg`, `--lpm-surface`), with the text color and font set. Use them through `style="fill:var(--lpm-accent)"` rather than a `fill` attribute.
- Output that isn't an `<svg>`, is empty or too big, or doesn't parse shows the text `label` instead. lpm Link shows the text label.

## Popups

`popup` shows a page in a card while the pointer rests on the button, and in the card of a terminal tab the action opened; in lpm Link a long press on the button opens it. The page can be anything HTML draws: a chart, a table, a dashboard. One key names the page's format (`html` is the one lpm shows today), and the settings beside it mean the same for every format.

```yaml
actions:
  stars:
    cmd: gh repo view --web
    popup:
      html: scripts/stars/popup.html   # the page: a file, the page itself, or $(a command that prints it)
      data: $(./scripts/stars/data.sh) # optional: what the page reads as lpm.data
      title: GitHub stars              # optional: the card's heading; defaults to the button's label
      size: 380x220                    # optional: the page's width x height, 200–720 by 80–560; default 360x220
      refresh: 5m                      # optional: open (default) runs it as the card opens; or an interval while it's open
      cache: 1m                        # optional: run the commands at most this often; default 30s
```

`popup: scripts/stars/popup.html` alone is the short form; the format comes from the file's ending. For where the page and its commands go, see [Files behind a button](#files-behind-a-button).

| Field | Meaning |
|---|---|
| `html` | A file, relative to the action's `cwd` (the project root by default); the page written in place (a `\|` block, or a value that starts with `<`); or `$(command)`, whose whole output is the page. Up to 1.5 MB. A file's own scripts, styles and images load from beside it on the Mac that holds the project. A page for a paired computer, an SSH project or lpm Link gets only its own text, so keep it self-contained or load libraries from `https`. |
| `data` | `$(command)`, a file, or YAML written in place. Output that is JSON arrives parsed as `lpm.data`; anything else arrives as text in `lpm.text`, with `lpm.data` null. Up to 1 MB. |
| `title` | Plain text. |
| `size` | `WIDTHxHEIGHT` in points. |
| `refresh` | `open`, seconds, or a number with `s`, `m` or `h`, at least `5s`. Each refresh hands new data to the page without reloading it. |
| `cache` | Seconds, or a number with `s`, `m` or `h`, at least `5s`; `30s` by default. How long a result stays current: opening the card within it runs nothing. Once it's older, the card shows it at once (with its age) while the commands run again, then updates in place. A run that fails keeps the last good result on the card, with the failure under it, and isn't tried again before `cache` has passed. The card's refresh button always runs now. Use it for slow or rate-limited data such as the GitHub API. |

The page gets `window.lpm` before its own scripts run:

- `lpm.data`, `lpm.text`, and `lpm.error` (why the `data` command failed; the page still loads).
- `lpm.theme`: `{ mode: "dark" | "light", colors: { bg, surface, text, muted, border, accent, green, red, amber } }`, also set as CSS variables `--lpm-bg`, `--lpm-text` and so on. The card's colors are a default that the page's own styles override.
- `lpm.project`, `lpm.action`, and `lpm.onData(fn)`, called with the new data on each refresh.

```html
<!doctype html>
<style>.bar { background: var(--lpm-accent); }</style>
<div id="bars"></div>
<script>
  function draw(data) { /* render data.months … */ }
  draw(lpm.data);
  lpm.onData(draw);
</script>
```

- Scripts run as the page loads, so put them after the elements they draw into, as above, or wait for `DOMContentLoaded`: a script that comes before any body content finds `document.body` null, and the card stays blank.
- In a repo's `.lpm.yml`, the page and data commands wait until the user allows them, and the card says so meanwhile (see [sharing.md](sharing.md#repo-config)).
- Commands run like label commands: in the action's `cwd` with its `env`, `LPM_PROJECT_NAME` and `LPM_ACTION`, through the login shell, on an SSH project's host, with a 15-second limit. They run when the card opens, not in the background, at most once per `cache`.
- The page runs isolated from lpm: on macOS and Windows in a webview of its own that closes with the card, so a page that hangs or throws only affects itself, and one that hasn't finished loading within 8 seconds is closed with a message. It can't call lpm, and a link opens in the browser. On Linux it runs in a sandboxed frame.
- Nothing about a popup can break its action. A file that's missing, a command that fails or runs too long, a page too big, or a `popup` the app can't read show as a message in the card, and the button still runs. `lpm config apply` reports a `popup` with no format key, two format keys, an unknown field, or a bad `size` or `refresh` as an error, and a page file that doesn't exist as a warning.
- `widgets`, `vega`, `markdown`, `image`, `terminal` and `url` are reserved as format keys for later; this version shows a note to update lpm for them.

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

Input fields support `label` (defaults to the key), `type`, `required`, `placeholder`, `default`, `persist`, `options`, and `position`. Types are `text` (default), `password`, and `radio`. A radio input requires options, and its default must match an option value. Options may be strings or `{label, value}` mappings; a mapping needs both `label` and `value`, or the app drops every action in the file. Input and option labels may hold variables and `$(…)` commands; see [Dynamic labels](#dynamic-labels).

Inputs are prompted in `position` order, then in key order. Set `position` when the prompt order should follow the command rather than the alphabet; leave it off when key order already reads correctly.

`{{key}}` tokens substitute into `cmd`, `cwd`, `env` values, and the action's `prompt`. In `cmd` the answer is shell-quoted automatically for where its token sits — bare, inside `"…"`, or inside `'…'` — so it is always one piece of data and never a second command or a `$(…)` expansion; a bare token stays one argument. Use `{{key|raw}}` to splice an answer into `cmd` verbatim when it is deliberately a command fragment. Substitution into `cwd`, `env`, and `prompt` is always verbatim — those are not shell text.

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
