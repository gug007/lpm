# /vs/pm2 — Content & Copy Plan

Page route: `/vs/pm2`
Target primary keyword: **pm2 alternative dev** (qualified; bare "pm2 alternative" is
production-supervisor intent and is deliberately not targeted)
Intent: a Node developer who already runs PM2 — often in production — asking whether it
is also the right thing for the local dev loop, and what they lose if they move.

**Angle:** re-aimed within its own subject. The title narrows to local dev so a
production searcher self-selects out. PM2 is not strawmanned anywhere: cluster mode,
`ecosystem.config.js`, `pm2 logs`, `pm2 startup` and `pm2-runtime` are named as real
strengths, **six** matrix rows go to PM2, and the page's argument is complementary — one
config on the server, one on the laptop.

Sources of truth, in the orchestrator's order of precedence: `desktop/` and `cli/` first,
then the fact-check ledger (spec part 5), then part 4.8's copy. Where part 4.8 contradicts
the code or the ledger, the code wins and the deviation is recorded in §7.

---

## 1. Metadata

```ts
title: "PM2 Alternative for Local Dev: Panes, Not a Daemon"
// 50 chars (renders 56 with the layout's appended " — lpm")
description:
  "PM2 supervises production. Locally you want a live pane per service you can read and search, not a daemon — plus the six things PM2 does that lpm does not."
// 155 chars. "six" is the number of rows the matrix concedes — see §4.
keywords: [
  "pm2 alternative dev", "pm2 for local development", "pm2 vs tmux", "pm2 vs lpm",
  "pm2 local dev", "ecosystem.config.js alternative", "pm2 dev mode",
  "run multiple dev servers mac", "start all services one command mac",
  "claude code parallel sessions", "codex parallel agents",
]
// 11 entries. Both "process manager" phrasings removed (§6.4 of the spec).
alternates.canonical: "/vs/pm2"
openGraph.title / twitter.title: TITLE            // same const, four uses
openGraph.description / twitter.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/pm2"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
```

`title: { absolute: … }` is gone; the layout appends ` — lpm` exactly once.

**OG image** (`opengraph-image.tsx`):
`headline: ["A PM2 alternative for local dev", "— and what to keep PM2 for."]`,
`subline: "A live pane per service you can read and search, plus the six things PM2 does that lpm does not."`,
`alt: "A PM2 alternative for local development — and what to keep PM2 for."` (matches the H1).

Every count on the page — DESCRIPTION, OG subline, matrix `description`, `lpmNote` — says
**six**, and six is what the table concedes.

---

## 2. Section outlines

Rendered order (canonical /vs order from spec part 2, with the brief's one documented
move: `ComparisonBasis` sits directly above the matrix rather than under the hero, so the
QuickAnswer takes the fold slot):

`ComparisonHero → QuickAnswer → VerdictCards → SurvivesQuit (unique A) → Pm2Basis
(ComparisonBasis) → FeatureMatrix → VerbMap (unique B, CommandMap) → EcosystemToLpm
(unique B cont.) → SectionVideo → WhenToPick → DemoSection → Faq → RelatedPages → Cta`

### Hero
- eyebrow `lpm vs PM2`
- H1 `A PM2 alternative for local development — and what to keep PM2 for.`
- description: the page `DESCRIPTION`
- verdict line `If both columns describe you, that is the normal case — run both.`
- `jumpHref="#map"`, `jumpLabel="Every pm2 verb, mapped"`
- `downloadSource="vs-pm2-hero"`

### QuickAnswer
H2 `Can you use PM2 for local development?` — answered "Yes" first, without naming lpm
in the first 60 words. Two paragraphs, then a `CodeBlock filename="Same two services,
both tools"`:

```
pm2 start ecosystem.config.js --only "web,api"
lpm start myapp --profile dev
```

The `--only` form is the quoted comma list PM2's ecosystem-file reference documents.
Paragraph 2 closes on the two-file truth (§7 item 3), not on "a ten-line `.lpm.yml`".

### VerdictCards (3)
`PM2 / Keep PM2`, `lpm / Add lpm`, `Both / Run both` — bodies verbatim from the brief.

### Unique section A — `_components/survives-quit.tsx`, `id="survives-quit"`
Eyebrow `Process lifetime`, title `Close the app. Your dev servers keep running.`, the
brief's body as the header description, then a three-row `<dl>` (survives closing the app
/ a reboot / a crash) and the brief's closing line. Two of the three rows go to PM2, which
is what the closing line says.

### `_components/pm2-basis.tsx` — the `ComparisonBasis` data
Eleven sources (§6.1), `reviewed={VS_REVIEWED}`, `lpmNote` with the **six**-row count.
Extracted from `page.tsx` so that file stays well under the 400-line limit.

### FeatureMatrix, `id="matrix"` (rendered by `_components/pm2-matrix.tsx`)
Title `PM2 and lpm, row by row`, description `Six of these rows go to PM2…`. Seventeen
rows, table in §4, plus the retained-logs footnote the ledger mandates (§5.5's
`live scrollback only` entry).

### Unique section B — `_components/verb-map.tsx` (shared `CommandMap`, `id="map"`)
Eyebrow `Muscle memory`, title `Every pm2 verb, and what it is here`, `fromLabel="pm2"`,
`toLabel="lpm"`, twelve rows, footnote carrying the per-verb app relationship and the
`/connect-ai-agents` link.

### Unique section B continued — `_components/ecosystem-to-lpm.tsx`
`ecosystem.config.js` and `.lpm.yml` side by side, same two services, plus the brief's
three notes (`apps[]` mapping, `dependsOn`, `port:`) and the `/config` link on
"config reference".

### SectionVideo
`clip="agent-run-command"`, eyebrow `See it`, title `The CLI, driven by an agent`.

### WhenToPick
Existing title/description kept, with the brief's third framing line appended. PM2's five
bullets are verbatim and untouched — they are what makes the page trustworthy. lpm bullet
5 carries the shared-ports/shared-database concession (§5.3).

### FAQ (6) — section title `Keeping PM2, or moving off it`; full text in §5.

### RelatedPages (5) — `/vs/tmux`, `/vs/docker-compose`, `/config`,
`/connect-ai-agents`, `/best-terminal-for-claude-code-and-codex` (spec §6.1).
In-body contextual links: `/connect-ai-agents` from the command-map footnote, `/vs/tmux`
from FAQ 5, `/config` twice — from the `.lpm.yml` block ("config reference") and the CTA
(`.lpm.yml`), never from the word "commit" (spec part 7 blocking item 1).

### CTA
Title `Keep PM2 for supervision. Add lpm for the workspace.` plus the brief's second
line. The trailing line no longer promises that dropping a `.lpm.yml` in the repo is by
itself enough — see §7 item 3.

---

## 3. Structured data

`webPageJsonLd` (with `about[]` and `dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd`,
`screenRecordingJsonLd("agent-run-command")`. `FAQPage` is emitted inline by
`components/vs/faq.tsx` and is not duplicated here. No `HowTo`, no page-level
`SoftwareApplication`, no `Review`/`Product`/`aggregateRating`, no `ItemList`.

---

## 4. Comparison matrix

lpm first and highlighted; competitor column is PM2.

| Capability | lpm | PM2 |
|---|---|---|
| Services keep running after you close the app | ✓ | ✓ |
| Every service in its own live pane instead of one log stream | ✓ | `pm2 logs` |
| Switch between projects visually | ✓ | ✗ |
| Checks declared ports before starting and names the holder | `ask, free, or fail` | ✗ |
| Declares service start order | `dependsOn` | ✗ |
| Named service subsets | `profiles` | `--only` |
| Wait for a port or a service from a script | `lpm wait --port 3000` | ✗ |
| Copy the whole stack for a second agent | `up to 50 worktrees or standalone copies` | ✗ |
| Runs Claude Code and Codex in panes beside the services | ✓ | ✗ |
| Runs Node, Python, shell commands and binaries | ✓ | ✓ |
| Cluster mode across CPU cores with load balancing | ✗ | ✓ |
| Auto-restart on crash with backoff and memory limits | `stays down; the pane keeps its last output` | ✓ |
| Comes back after a reboot (pm2 startup / pm2 save) | ✗ | ✓ |
| Zero-downtime reload on deploy | ✗ | ✓ |
| Log files and rotation | `live scrollback only` | `pm2-logrotate` |
| CPU and memory dashboard | ✗ | `pm2 monit, PM2 Plus` |
| Scriptable from a shell, with JSON for the caller | `lpm CLI, --json on nearly every verb` | `pm2 CLI` |

Footnote under the table (ledger §5.5, the `live scrollback only` entry): "There is no
logs directory. `lpm logs api --lines 500` reads that service pane's scrollback, so what
you get back is always current — and when the pane goes, the history goes with it. For
output you can still read next week, PM2's log files plus pm2-logrotate remain the right
tool."

Rows the brief deletes and that are gone: `Local file-watch restart mode`, `Primary
focus`, `Config format`, `Starts multiple processes with one command`, `Open source,
free`, `Generates project config from your repo`, `Per-service live output pane`,
`Native macOS desktop app`, `Duplicate a project for a second AI agent`, `Designed for
Claude Code / Codex in parallel` (the last four are re-labelled into the rows above).

**Rows conceded to PM2: six** — cluster mode, auto-restart with backoff, reboot
persistence, zero-downtime reload, log files and rotation, resource dashboard. The matrix
`description` says six, `lpmNote` says six, and `DESCRIPTION` / the OG subline say "the
six things PM2 does that lpm does not". Ties: four (rows 1, 6, 10, 17). No competitor
checkmark on this page stands for a prerequisite rather than a capability, so nothing
needed re-polarising.

No row label on this page is byte-identical to a label on another /vs page
(`grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` returns only `VerdictCards` labels,
competitor names and `ComparisonBasis` source labels, all exempt).

Engineer notes: shared `FeatureMatrix` renders the desktop table inside
`overflow-x-auto` and a card list below `md`; `id="matrix"` brings `scroll-mt-20`. Row
data lives in `_components/pm2-matrix.tsx`.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Can I use lpm in production instead of PM2?** — "No, and that is not the pitch. lpm
   is a local dev-workflow tool. PM2 is production-first, with cluster mode, crash
   recovery, boot persistence, and zero-downtime reloads; it also provides pm2-dev and
   watch mode for local development. If you are deploying an app to a server, use PM2. If
   you want a visual workspace around local services and agents, use lpm." (verbatim,
   ledger §5.6)
2. **Does lpm cluster Node processes across cores like PM2?** — verbatim from the current
   page.
3. **Do my services keep running if I quit lpm?** — "Yes. They run outside the app, so
   closing the window leaves them up and relaunching finds them again. A reboot is the
   exception — there is no `pm2 startup` equivalent, so you start the project again."
4. **Can I run PM2 inside lpm?** — "You can: a service's command is just a shell line, so
   `pm2-runtime start ecosystem.config.js` runs in a pane like anything else. Most people
   do not, because you would then have two things deciding whether a process is alive.
   Point lpm at the same commands your ecosystem file runs and skip the layer."
   (`pm2-runtime` is now sourced — see §6.1.)
5. **Should I run PM2 and tmux together, or neither?** — "PM2 restarts what dies; tmux
   holds a detached session until you attach to it again. Neither one stands in for the
   other, so running both is a fair answer — one supervises, one keeps the window. If the
   pair is only there to give you a single workspace, that overlap is the job lpm does,
   with no tmux underneath it." (`/vs/tmux` link on the closing phrase. Reworded from the
   brief: the popularity claim went, and both mechanism halves are now sourced — see §7
   item 5.)
6. **Can I keep PM2 for production and use lpm locally?** — "Yes. Keep
   ecosystem.config.js and PM2 in your deployment workflow, then add an lpm config for the
   local commands you actively develop against. Supervision stays with PM2, and local
   development gets lpm's service panes, project switcher, and parallel-agent copies."

Items 3–5 are JSX answers and each supplies `answerText`.

---

## 6. Claims tables

### 6.1 Competitor claims → `ComparisonBasis` source

Eleven sources, each earning its place. Every PM2 (and tmux) mechanism claim on the page
traces to one of them; every source was fetched and read on the review date.

| Source | What it carries on this page |
|---|---|
| PM2 development docs | `pm2-dev`, `--watch` — QuickAnswer para 1, FAQ 1, WhenToPick PM2 bullet 5 |
| PM2 process-management docs | `pm2 start`/`stop all`/`restart`/`list`/`show`, and non-Node support ("bash commands, script, binaries", `pm2 start app.py`) — matrix rows 1, 10, verb-map rows |
| the ecosystem file reference | `--only "api-app,worker-app"`, `name`/`script`/`args`/`env`, `max_memory_restart` — QuickAnswer code block, matrix row 6, the `ecosystem.config.js` sample, WhenToPick PM2 bullet 2 |
| PM2 cluster mode | cores + load balancing, and `reload`'s "0-second-downtime" — matrix rows 11, 14, VerdictCards, FAQ 1–2 |
| PM2 restart strategies | restart on crash, `exp_backoff_restart_delay`, memory-limit restart — matrix row 12, VerdictCards, WhenToPick PM2 bullet 2, FAQ 5's "restarts what dies" |
| PM2 startup script | `pm2 startup` / `pm2 save` — matrix row 13, section A, verb map, FAQ 3 |
| PM2 log management | `pm2 logs --lines <n>`, `$HOME/.pm2/logs` — verb-map logs row, matrix row 15, matrix footnote |
| pm2-logrotate | rotation — matrix row 15, matrix footnote, WhenToPick PM2 bullet 4 |
| PM2 monitoring | `pm2 monit`, PM2 Plus — matrix row 16, verb map, WhenToPick PM2 bullet 4 |
| pm2-runtime in Docker | `pm2-runtime start …` as a drop-in foreground binary — FAQ 4 |
| the tmux manual | "Each session is persistent and will survive accidental disconnection… or intentional detaching" — FAQ 5's tmux half |

Nothing on the page asserts a PM2 release date, maintenance status or licence, so no
source is needed for those and none is claimed.

### 6.2 lpm claims → `desktop/` / `cli/` file:line

Every lpm cell and every lpm sentence. Paths are relative to `/Users/gug007/Projects/lpm`.
A bare `lpm: true` is treated as a hard claim.

| Claim, as rendered | Where | Evidence |
|---|---|---|
| Services keep running after you close the app; relaunching finds them again | matrix row 1, section A, FAQ 3, QuickAnswer | `desktop/frontend/src-tauri/src/sessiond.rs:1-13`; `sessions.rs:1-9` (ledger §5.6) |
| Every service in its own live pane, still labelled, still streaming | matrix row 2, section A, WhenToPick lpm bullet 3 | `desktop/frontend/src/components/PaneView.tsx:382-400` (each service tab renders its name plus the ports it is listening on), `:534-560` (every service is a `Pane`) |
| A pane you read and search, never type into | DESCRIPTION, OG subline, QuickAnswer, matrix row 2 | `desktop/frontend/src/components/Pane.tsx:56` (`disableStdin: true`), `:446` (`canPaste={false}`), `:185-189` (`findNext`/`findPrevious`) |
| Switch between projects visually | matrix row 3, WhenToPick lpm bullet 1 | `desktop/frontend/src/components/Sidebar.tsx:830` (`renderProjectRow` — selection, per-project run state, agent rows) |
| Checks declared ports before starting and names the holder — ask, free, or fail | matrix row 4, WhenToPick lpm bullet 5, section B note 3 | `desktop/frontend/src-tauri/src/ports.rs:1-8` (detection feeding the start dialog), `:26` (policy `"" \| ask \| free \| fail`), `config.rs:568-582` |
| Declares service start order — `dependsOn` | matrix row 5, section B note 2 | `config.rs:580-581`; `services.rs:197` (`expand_service_deps`); cycles rejected in `cli/src/config_cmd.rs` |
| Order is not readiness — `lpm wait --port` is the gate, and it needs no app | section B note 2, matrix row 7, verb map | `cli/src/main.rs:165-188`; `cli/src/wait.rs:1-5` ("The port/service/ready modes poll client-side (250ms) and never touch the app"), `:197` (only `--agent` calls `require_app`) |
| Named service subsets — `profiles`, `lpm start --profile dev` | matrix row 6, QuickAnswer code block, verb map | `config.rs:807-809` (`profiles: BTreeMap<String, Vec<String>>`); `cli/src/main.rs:132-142`; `cli/src/start.rs:18-22` |
| Copy the whole stack — up to 50 worktrees or standalone copies | matrix row 8, verb map, VerdictCards, WhenToPick lpm bullet 5 | `cli/src/main.rs:239-247` and `:279-287` (`-n` parsed with `range(1..=50)`); `desktop/frontend/src/components/BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`); `desktop/frontend/src-tauri/src/projects_crud.rs:517` (`git worktree add -b`) |
| A worktree leaves untracked files behind — no `.env`, no `node_modules` | verb-map worktree note | `projects_crud.rs:517` (a linked worktree is a checkout of tracked files); `cli/src/main.rs:302-304` (`--reinstall-deps` exists because installed dependencies do not come along); ledger §5.6 ("say so") |
| Two copies still share ports and databases; lpm names the process holding one | WhenToPick lpm bullet 5 | `ports.rs:1-8`, `:26` (detection, not isolation); `config.rs:568-582` (`port` is a declared integer with no allocation path) — ledger §5.3 |
| Runs Claude Code and Codex in panes beside the services, with status per tab | matrix row 9, WhenToPick lpm bullet 4, SectionVideo | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (Claude Code and Codex hooks only); `desktop/frontend/src/types.ts:247`; `PaneView.tsx:415-434` |
| Runs Node, Python, shell commands and binaries; a service command is just a shell line | matrix row 10, FAQ 4, WhenToPick lpm bullet 2 | `config.rs:1051-1061` (`build_local_script`: `export K=v && cmd`); `sessions.rs:171-182` (`build_command`) |
| No cluster mode, no zero-downtime reload, nothing that comes back after a reboot | matrix rows 11, 13, 14; section A; FAQ 1–3 | absence: no boot registration anywhere — `grep -rn "LaunchAgent\|launchd\|LoginItem"` over `desktop/frontend/src-tauri/src` hits only comments (`actions.rs:6`, `proctree.rs:4,35,85`, `tmuxmigrate.rs:25`); `grep -rn "zero-downtime\|graceful_reload"` returns nothing |
| A crashed service stays down; its pane keeps the last output and the exit code | matrix row 12, section A | absence: no service respawn path anywhere; `desktop/frontend/src/components/InteractivePane.tsx:1010` writes `[Process exited with code N]` into the pane; `Pane.tsx:58` (`scrollback: 10000`) is what holds the output it printed |
| No logs directory; `lpm logs` reads a live pane and nothing outlives it | matrix row 15 + matrix footnote | `cli/src/logs.rs:78-84` (a stopped project errors "is not running"), `:11` (`MAX_LINES = 10_000`), `:109` (clamp); no file sink in `sessions.rs`/`sessiond.rs` (ledger §5.5) |
| No CPU or memory numbers anywhere | matrix row 16, verb map (`pm2 monit` → no equivalent) | absence: `grep -rln "cpuPercent\|cpu_percent\|memoryMB\|rss\b"` over `desktop/frontend/src` and `src-tauri/src` returns nothing; `PaneView.tsx:382-400` renders name + ports only |
| Scriptable from a shell — `--json` on nearly every verb | matrix row 17 | 14 of the 19 top-level verbs declare `json: bool` in `cli/src/main.rs`; the three command groups that do not (`config`, `automations`, `mobile`) expose it on their subcommands (`cli/src/config_cmd.rs` ×9, `job.rs` ×16, `mobile.rs` ×6). Only `set-status` and `clear-status` have none |
| `lpm start`, `lpm stop` and `lpm service web restart` need the app up; `lpm logs`, `lpm list` and `lpm wait --port` do not; `lpm status` does | verb-map footnote | `cli/src/start.rs:16`, `stop.rs:10`, `service_cmd.rs:50` (`control::require_app`); `cli/src/control.rs:12-19` ("lpm app is not running — start it to control projects"); `cli/src/list.rs:40` and `cli/src/logs.rs:78-110` (no `require_app`); `cli/src/wait.rs:197`; `cli/src/status.rs:14-21` ("lpm app is not running — no live status.") |
| Every command in the map exists as written | `_components/verb-map.tsx` | `cli/src/main.rs:90` (`list`), `:96` (`project`), `:107` (`logs … --lines`), `:132` (`start --profile`), `:143` (`stop`), `:151` (`service <name> <op>`), `:165` (`wait --port --timeout`), `:239` (`duplicate -n --run --prompt`), `:279` (`worktree -n`); restart path `desktop/frontend/src-tauri/src/services.rs:466` |
| lpm reads package.json scripts, Makefile targets, justfile recipes and lockfiles to suggest commands | WhenToPick lpm bullet 2 | `desktop/frontend/src/components/project-detail/useProjectSuggestions.ts:68-119` (package.json, Makefile/makefile, justfile, compose files, Cargo.toml, go.mod, pyproject.toml, uv.lock, four JS lockfiles) — ledger §5.3 replacement wording |
| lpm can put the repo in front of Claude Code or Codex to draft the rest | WhenToPick lpm bullet 2 | `desktop/frontend/src-tauri/src/aigen.rs:33-45` (`check_aicl_is`, `is_supported_cli`: claude, codex, gemini, opencode); `types.ts:247` |
| Services kept in your own project file, or committed as a `.lpm.yml` the repo carries | QuickAnswer, section B, CTA | `config.rs:1508-1546` (`load_repo_yaml` + `merge_repo_services_profiles` — the repo file merges **under** the personal project file, which is why the CTA no longer implies the repo file alone is enough) |
| `port:` is checked for conflicts and watched by `lpm wait`; the bound port still comes from the command or `env:` | section B note 3 | `config.rs:568-582` (declared integer, no allocation); `ports.rs:1-8`; ledger §5.3 |
| MIT-licensed, free, no account, native macOS app | CTA, WhenToPick lpm bullet 3 | `LICENSE:1`; `desktop/frontend/src-tauri/tauri.conf.json:31-38` (`targets: ["app", "dmg"]`, `macOS` block) |

---

## 7. Deviations from the brief, and why

1. **"a pane per service you can type into" → "a live pane per service you can read and
   search".** Four places (DESCRIPTION, OG subline, QuickAnswer paragraph 2, matrix row
   2 label). A service pane is **read-only**: `Pane.tsx:56` creates its terminal with
   `disableStdin: true`, `:446` passes `canPaste={false}`, and `PaneView.tsx:534-560`
   renders services through that component. Typing is a *terminal tab* capability, not a
   service one. Search is citable (`Pane.tsx:185-189`), so the replacement keeps the same
   contrast against `pm2 logs`.
2. **"Five of these rows go to PM2" → "Six".** The table concedes six; the brief's five
   was its `WhenToPick` bullet count (log rotation and monitoring are one bullet there,
   two rows here). Fixed in all four places that carry a count (matrix `description`,
   `lpmNote`, `DESCRIPTION`, OG subline) so they agree with each other and with the table.
3. **The `.lpm.yml` framing, in the QuickAnswer and the CTA.** The brief's "add a ten-line
   `.lpm.yml` for the laptop" and "drop it next to your `ecosystem.config.js` — it commits
   with the repo" both imply the repo file is self-sufficient. It is not:
   `config.rs:1508-1546` merges `<root>/.lpm.yml` services and profiles **under** the
   personal project file, so lpm has to know about the folder first. Ships as "declare
   those same services to lpm — kept to yourself in your own project file, or committed as
   a `.lpm.yml` so a teammate gets the same set", and the CTA now says "Point lpm at that
   folder whenever you get to it — the services are already declared."
4. **The command-map footnote is per-verb, not "reading works with lpm closed".** The
   ledger's own replacement sentence groups `lpm status` with `lpm list` and `lpm logs`,
   and that half is false: `cli/src/status.rs:14-21` pings first and prints "lpm app is
   not running — no live status." The footnote now names three writers that need the app
   (`lpm start`, `lpm stop`, `lpm service web restart`), three readers that do not
   (`lpm logs`, `lpm list`, `lpm wait --port` — `wait.rs:1-5`), and `lpm status` as the
   exception on the reading side. It also avoids every phrase the siblings use for the
   same fact ("keep lpm open", "from any shell", "cold shell", "read the running services
   directly"), so no eight-word run is shared.
5. **FAQ 5.** "which is why plenty of people run both" was an unsourceable popularity
   claim of exactly the kind ledger §5.4 struck elsewhere; "tmux keeps sessions alive" was
   an uncited competitor mechanism. Now: "PM2 restarts what dies" (PM2 restart strategies)
   and "tmux holds a detached session until you attach to it again" (the tmux manual),
   with the pairing framed as a conditional. The `/vs/tmux` link stays on "with no tmux
   underneath it".
6. **`pm2 describe web` → `pm2 show web`** in the command map. `describe` appears on none
   of the sources; `show` is documented in PM2's process-management docs.
7. **`--only web,api` → `--only "web,api"`** in the QuickAnswer code block, matching the
   quoted comma list in PM2's ecosystem-file reference.
8. **The crash cells are narrower than the brief's.** "the service stops and its pane
   shows the stack trace where it died" claimed something lpm does not do — a stack trace
   is the crashing program's output, if it prints one. Section A now reads "the service
   stays down; its pane keeps the last output and the exit code" (`InteractivePane.tsx:1010`),
   and the matrix cell is "stays down; the pane keeps its last output".
9. **Two conceded hedges the brief left out, now shipped.** The matrix footnote carries
   ledger §5.5's retained-logs trade-off, and the command map's worktree note carries
   §5.6's "a worktree does not carry `.env` or installed dependencies — say so".
   WhenToPick lpm bullet 5 carries §5.3's shared-ports/shared-database concession, written
   in this page's own words rather than the ledger's five-page sentence.
10. **`1–50 worktrees or standalone copies` → `up to 50 …`**, so the cell is no longer
   byte-identical to `/vs/overmind`'s. Same fact (`range(1..=50)`, `MAX_COUNT = 50`).
11. **Matrix row 17 re-labelled and re-worded.** The brief's "Scriptable from outside the
   app" / "lpm CLI over a Unix socket, JSON on every command" are the strings ledger §5.3
   assigns to `/vs/cmux`. This page ships "Scriptable from a shell, with JSON for the
   caller" / "lpm CLI, --json on nearly every verb" — and the quantifier matches the count
   in §6.2.
12. **FAQ 6 second sentence** replaced the brief's "avoids nesting two process
   supervisors" (banned positioning) with "Supervision stays with PM2, and local
   development gets lpm's service panes, project switcher, and parallel-agent copies."
13. **WhenToPick lpm bullet 2** ends "it can put the repo in front of Claude Code or Codex
   to draft the rest" rather than the brief's "hand the whole repo to Claude Code or Codex
   to write the rest", which shared a ten-word run with `/vs/iterm2`'s FAQ. Same
   mechanism (`aigen.rs:33-45`).
14. **`lpm wait` note** is "hold a script until the port is listening", not the brief's
   "block a script until the stack is listening" — that exact string is mandated for
   `/vs/tmux` too, and `/vs/tmux` shipped first. It is also the more precise description of
   `lpm wait --port 3000 --timeout 60`.
15. **The `Faq` section title** is `Keeping PM2, or moving off it` rather than
   `lpm vs PM2 — the honest FAQ`, which `/vs/iterm2` already ships in that shape.
16. **`RelatedPages` `/vs/tmux` teaser** is conditional ("If PM2 and tmux are both in your
   setup") for the same reason as §7 item 5.
17. **Strings the brief does not supply, written here:** the hero `description` (reuses
   `DESCRIPTION`), the hero `jumpLabel`, the `CommandMap` `description`, the
   `VerdictCards` `label` values, the `EcosystemToLpm` header, the five `RelatedPages`
   descriptions, and the two code samples. Backticks in brief copy that lands in a
   plain-string prop are dropped rather than rendered literally.
18. **Four files in `_components/`** beyond the brief's `survives-quit.tsx`:
   `verb-map.tsx`, `pm2-matrix.tsx`, `ecosystem-to-lpm.tsx` and `pm2-basis.tsx`. Moving
   the data arrays out keeps `page.tsx` at 344 lines.

---

## 8. Acceptance pass

- **Concession count**: six rows conceded; matrix `description`, `lpmNote`, `DESCRIPTION`
  and the OG subline all say six. `SurvivesQuit`'s "Two of those three go to PM2" matches
  its own three rows; the command map's "Two of them have no lpm equivalent, and three lpm
  verbs have no pm2 original" matches its twelve rows.
- **Duplicate row labels**: none. The only remaining `uniq -d` hits across `app/vs` are
  `VerdictCards` labels, competitor names and `ComparisonBasis` source labels.
- **Eight-word runs**: an 8-gram intersection of this page's prose against the seven
  siblings and the hub returns only code identifiers (`opengraph-image.tsx` exports,
  `const` declarations) and the shared `.lpm.yml` sample. No prose run is shared. Checked
  again at 7 and 6 words: the longest shared prose run is well under the limit.
- **Sources**: eleven, all fetched and read on the review date; §6.1 maps each competitor
  claim to one.
- **eslint**: `npx eslint app/vs/pm2` is clean. `npx tsc --noEmit` reports nothing in
  `app/vs/pm2`.
- **390px**: static reading only. Both tables sit in the shared components'
  `overflow-x-auto` wrappers, the `<dl>` in section A stacks at `sm`, both `CodeBlock`
  pairs stack to one column below `md`, and no file here sets a `min-width`.
- Not run, per instructions: `pnpm build`, `pnpm lint` (whole repo), `pnpm sitemap:dates`,
  and the live browser check.

### 8.1 Still open, and not fixable from this directory

1. **The hero jump link is not a 44px tap target.** `components/vs/comparison-hero.tsx:60-66`
   renders it as an `inline-flex … text-sm` anchor with no vertical padding, so it is about
   20px tall on every /vs page. `page.tsx` only passes `jumpHref`/`jumpLabel`; the fix
   belongs in the shared component.
2. **Part 7 blocking item 1 is still open.** `/config` documents the personal project file
   only (`grep -rn "lpm.yml" app/config` returns nothing). Both `/config` links here are
   anchored on "config reference" and `.lpm.yml`, never on "commit", and the CTA no longer
   promises the repo file works on its own — but the destination still under-delivers for a
   reader who followed the `.lpm.yml` link.
3. **Part 8's own duplicate-label check cannot come back empty as written.**
   `grep -rho 'label: "[^"]*"' app/vs | sort | uniq -d` also catches `VerdictCards` and
   `ComparisonBasis` labels. The property was verified by comparing matrix-row arrays only.
