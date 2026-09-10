# /vs/foreman — Content & Copy Plan

Page route: `/vs/foreman`
Target primary keyword: **foreman vs overmind**
Intent: a Rails developer running `bin/dev` or `foreman start` who is deciding between the two Procfile runners, and has not heard of a third shape.

**Angle:** the one re-aimed page in the cluster. "foreman alternative" is a dead term (the SERP is Contractor Foreman and theforeman.org), while "foreman vs overmind" returns blog posts and zero product pages. So this page genuinely compares three tools — Foreman, Overmind, lpm — instead of arguing the Procfile case a second time against `/vs/overmind`.

Source of truth, in this order: the app source under `/Users/gug007/Projects/lpm/desktop` and `/cli`, then the fact-check ledger (part 5), then the brief (part 4.6). The orchestrator's rulings R1–R8 reverse the earlier "the spec wins" instruction, so where part 4's copy contradicted the source or shipped an unsourced competitor claim, the copy was rewritten. Every such rewrite is listed under "Rulings applied".

---

## 1. Metadata

```ts
title: "Foreman vs Overmind: Procfile Dev for Rails on Mac"
// 50 chars (renders 56 with the layout's " — lpm")
description:
  "Foreman interleaves one log stream; Overmind needs tmux. Both read your Procfile. lpm converts the lines into live panes on macOS — all three compared."
// 151 chars
keywords: [
  "foreman vs overmind", "foreman alternative rails", "run procfile locally",
  "procfile.dev", "bin/dev rails", "foreman ruby gem", "foreman start",
  "heroku local alternative", "restart one process foreman",
  "rails procfile setup mac", "procfile runner mac", "foreman vs overmind vs lpm",
] // 12
alternates.canonical: "/vs/foreman"
openGraph.title / twitter.title: TITLE          // same const, four uses
openGraph.description / twitter.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/foreman"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
```

`title: { absolute: … }` is gone. `TITLE` / `DESCRIPTION` are defined once and used in `metadata`, both OG/Twitter blocks and `webPageJsonLd`.

**OG image** (`opengraph-image.tsx`, edited in place):
- `headline: ["Foreman vs Overmind for a", "Rails Procfile — and a third option."]` — matches the H1.
- `subline: "One interleaved stream, one tmux-backed runner, one Mac app. What each does with the same three lines."` — the brief said "four"; the `Procfile.dev` sample has three lines (R2).
- `alt: "Foreman vs Overmind for a Rails Procfile — and a third option."` — matches the H1.

**JSON-LD:** `webPageJsonLd` (with `about[]` and `dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd`, `screenRecordingJsonLd("add-action")`. Nothing else — no `HowTo` for the migration steps, no page-level `SoftwareApplication`, no `Review`/`Product`. `FAQPage` is emitted inline by `components/vs/faq.tsx`.

`about`: `["Procfile-based local development", "Foreman versus Overmind", "running a Rails stack on macOS", "per-process restart in local development", "parallel Claude Code and Codex sessions"]`

---

## 2. Section outlines

Rendered order, matching the canonical /vs order in spec part 2 with the one documented exception in slot 6:

1. `ComparisonHero` — eyebrow, H1, description, verdict line, `jumpHref="#matrix"`, `downloadSource="vs-foreman-hero"`
2. `ComparisonBasis` — `VS_REVIEWED` / `VS_REVIEWED_ISO`, seven competitor sources, `lpmNote`
3. `QuickAnswer` — H2 is the query; two paragraphs, two `CodeBlock`s, closing line
4. `VerdictCards` — Foreman / Overmind / lpm, equal weight
5. **`_components/one-terminal.tsx`** — "Four things that happen in one terminal" (page-unique A)
6. **`_components/procfile-matrix.tsx`**, `id="matrix"` — three columns (page-unique; see the exception note below)
7. **`_components/migrate.tsx`**, `id="migrate"` — "Your Procfile, line by line" (page-unique B), then `SectionVideo` with `clip="add-action"`
8. `WhenToPick` — lpm vs "Foreman or Overmind"
9. `DemoSection`
10. `Faq` — 6 items
11. `RelatedPages` — 5 links
12. `Cta` — `downloadSource="vs-foreman-cta"`

### The documented exception (slot 6)

Slot 6 renders `app/vs/foreman/_components/procfile-matrix.tsx` — three columns, **lpm · Foreman · Overmind** — instead of the shared two-column `components/vs/feature-matrix.tsx`. Reason, per spec part 2: this page is re-aimed at the brand-pair query `foreman vs overmind`, so it must genuinely compare all three tools, and a two-column table cannot carry a three-way comparison. It is the only permitted deviation in the cluster; every other page keeps the shared matrix. Consequences the page owns itself, because the shared component's props do not reach it: `id="matrix"` plus `scroll-mt-20` on the `<section>` (the hero's jump target), the `overflow-x-auto` wrapper around the desktop table, and the `md:hidden` card list for 390px. Cell/label styling is copied from `feature-matrix.tsx` (check = `text-gray-900 dark:text-white`, lpm column = `bg-gray-100/70 dark:bg-white/[0.04]`) rather than from `isolation-matrix.tsx`, whose emerald highlight is banned in this pass.

### Hero

- Eyebrow: `Procfile dev on macOS`
- H1: `Foreman vs Overmind for a Rails Procfile — and a third option.`
- Description (not supplied by the brief, written here): "Both read the same Procfile.dev. Foreman interleaves everything on one stdout stream, Overmind gives each process a tmux window, and lpm gives every line a live pane of its own." The earlier "panes you click" was dropped with the attach row (R1): clicking a service pane focuses output, so the sentence sat in the same family as the claim the source contradicts.
- Verdict line: `If your Procfile.dev is two lines and nothing ever crashes, Foreman is still the answer.`
- Jump: `#matrix` / "See all three side by side" (label written here; the brief fixes the target, not the wording)

### Quick answer

H2 — reused verbatim as FAQ 1's question in intent, and its first paragraph is FAQ 1's answer: `Foreman or Overmind for a Rails Procfile?`

Paragraph 1 (the extractable answer; names Overmind and Foreman before lpm): "Overmind, if you want to attach to or restart one process without touching the rest — it runs each process in its own tmux window to make that possible, and `-m web=2,worker=3` scales one of them. Foreman, if one interleaved stream on stdout is all you need, if you would rather not install tmux, or if your deploy depends on `foreman export`." ("colour-prefixed" was cut — the man page documents no colour or prefix option, R3.)

Paragraph 2: "There is a third shape. `foreman start` puts your whole stack in one terminal, and when the CSS watcher dies it takes Rails with it. lpm runs the same `web`, `css` and `worker` lines as separate live panes on macOS — restart one, leave the rest alone, and quit the app without killing anything. It will not read your Procfile; you copy the lines into a `services:` block once, and the shape is identical."

`CodeBlock filename="Procfile.dev"` → the three Procfile lines. `CodeBlock filename=".lpm.yml"` → the same three as a `services:` map.

Closing line: "That is the whole migration. What changes is not the declaration — it is that `worker` can crash without taking `web` down with it."

In-body link: **Overmind → `/vs/overmind`** in paragraph 1.

### Verdict cards

Three equal-weight cards. `VerdictCard` requires `label` + `title` + `body`; the brief supplies a heading and a body sentence, so the tool name is the eyebrow `label` and the brief's heading is the `title` (see Deviations — no third copy string was invented).

| label | title | body |
|---|---|---|
| Foreman | Keep Foreman | Two lines in Procfile.dev, $PORT assigned for you, .env loaded automatically, and foreman export generating the launchd or systemd units your deploy needs. |
| Overmind | Keep Overmind | overmind connect web to attach one process, restart it without the rest, -m web=2 to scale it, and Linux or *BSD support. |
| lpm | Switch to lpm | A pane per process, a project switcher across repos, services that outlive the app, and Claude Code or Codex in the next tab. macOS only, and it converts the Procfile rather than reading it. |

### Page-unique section A — `one-terminal.tsx`

Eyebrow `Why people leave foreman start`, title `Four things that happen in one terminal`. Four cards, *what you see* → *what fixes it*:

1. **The CSS watcher dies and takes Rails with it** / "One process exits and the whole formation shuts down mid-request." → per-service panes, the project's Services menu or `lpm service css restart`, and two concessions: Overmind restarts one too, and a dying process there interrupts the rest unless you list it under `-c`. ("from the sidebar" became "from the project's Services menu": the per-service toggle lives in the project header's Start menu, `StartMenu.tsx:58-69`.)
2. **Closing the window ends your stack** → services run outside the app; Overmind's tmux session detaches and keeps going, a foreman formation ends with the command that started it.
3. **Address already in use, and you do not know who** → declared ports checked before start, holder named, free it or stop.
4. **Postgres has to be up before the worker** → `dependsOn: [db]` orders starts, cycles error out, `lpm wait --port 5432` is the readiness gate.

### Page-unique section B — `migrate.tsx`

Eyebrow `Migration`, title `Your Procfile, line by line`, `id="migrate"`. One `.lpm.yml` `CodeBlock` showing the full conversion with `port:`, `env:`, `dependsOn:` and `profiles:`, then the four gotchas as a `<dl>`: `$PORT` is not set for you · `.env` is not loaded automatically · `foreman start -m web=2,worker=0` becomes a profile · Keep `foreman export`. Closes with the CLI hedge (which verbs need the app open). In-body link: **config reference → `/config`** in the section description.

Three corrections this pass: the section description now says what the sample actually shows (three Procfile lines, a Redis line a Procfile usually leaves out, and the two fields it has no room for) rather than "the same three lines" over a four-service sample; the `.env` gotcha says Overmind reads `.overmind.env` **and then** `.env`, which is what its README documents; and the profile example in the gotcha now lists `redis`, matching the YAML above it.

Then `SectionVideo`: eyebrow `See it`, title `rails db:migrate as a button`, description "The one-off commands you run with foreman run become actions you click, or call with lpm run.", `clip="add-action"`.

### When to pick

Title `When each one is the right tool`, description `Both start the same commands from the same one-line declaration. The split is what happens after they are running.`

lpm headline: `Your stack has more than two processes, or a second agent is about to want its own copy of it.`
Competitor column is headed **Foreman or Overmind** and every bullet names which; its headline ("The Procfile runner you already have is enough.") is written here. Three bullets moved off the brief's wording:

- lpm bullet 2, "Four panes side by side beats scrolling one stream…" → "A pane per process beats scrolling one stream to find which one printed the error." The `Procfile.dev` sample has three lines, so "four panes" contradicted it (R2).
- lpm bullet 5 now ships the caveat ledger §5.6 asks for (R6): "…anywhere from 1 to 50 of them, and a linked worktree arrives without your `.env` or your installed gems."
- competitor bullet 6, "Your team is on Linux or Windows as well as macOS (both)." → "Someone on the team develops on Windows, or on Linux (Foreman runs on both; Overmind on Linux and \*BSD)." Overmind does not run on Windows, so "(both)" was wrong on half the sentence.

### CTA

Title "Three lines in a Procfile. Three panes on your Mac." / description "lpm starts the same commands your Procfile.dev already names, one pane each, and leaves them running when you quit the app. Free, MIT-licensed, macOS." Written here — the brief supplies no CTA copy, and the verified hub CTA line could not be reused without sharing an eight-word run with `/vs`.

---

## 3. Three-way matrix (slot 6)

Columns left to right: **lpm** (highlighted) · **Foreman** · **Overmind**.
SectionHeader: eyebrow `All three, side by side`, title `The same three lines, three ways`, description "Nine of these twenty-one rows go to Foreman or Overmind. They are the first nine."

Rows are ordered so every concession comes first, which is what lets the description state an exact count (R2). Twenty-one rows; the first nine go against lpm.

| # | Row | lpm | Foreman | Overmind |
|---|---|---|---|---|
| 1 | Runs your Procfile.dev untouched | ✗ | ✓ | ✓ |
| 2 | Sets $PORT for each process type | you write it in env: | -p base, +100 a line | -p base, -P step |
| 3 | Reads a .env file without being asked | ✗ | .env in the working directory | .overmind.env, then .env |
| 4 | All output interleaved on one stdout stream | ✗ | ✓ | ✗ |
| 5 | Exports launchd or systemd units for deploy | ✗ | foreman export | ✗ |
| 6 | Installs on a Windows or Linux workstation | Mac app; Linux only as a remote host | anywhere Ruby runs | Linux, *BSD, macOS |
| 7 | Attach a shell to one running process | panes are read-only | ✗ | overmind connect |
| 8 | Run two copies of web from one line | one entry, one process | -m web=2 | -m web=2 |
| 9 | One command brings the whole stack up | one click, or lpm start with the app running | ✓ | ✓ |
| 10 | A live pane per process, all visible at once | ✓ | ✗ | a tmux window each |
| 11 | Restart css without restarting web | lpm service css restart | ✗ | overmind restart css |
| 12 | One process dying leaves the others alive | ✓ | one exit ends the formation | only with -c or --any-can-die |
| 13 | The stack outlives the terminal you started it in | quit the app, services stay up | ✗ | its tmux session, detach with Ctrl-b d |
| 14 | What you install before the first run | the app; no tmux, no Ruby | Ruby, then the gem | tmux, then the binary |
| 15 | Sidekiq waits for Redis before it starts | dependsOn: [redis] | ✗ | ✗ |
| 16 | Names what is already holding :3000 | ✓ | ✗ | ✗ |
| 17 | Run a named subset instead of a per-run flag | profiles: | -m web=2,worker=0 | -l web,worker |
| 18 | Two Rails apps up at once in one window | ✓ | ✗ | ✗ |
| 19 | A second Claude Code or Codex agent gets its own checkout | 1–50 worktrees or copies | ✗ | ✗ |
| 20 | A desktop window rather than a foreground command | ✓ | a foreground command | a foreground command plus tmux |
| 21 | Licence on the gem, the binary and the app | MIT | MIT | MIT |

**Nine rows conceded, and the description says nine.** Rows 1–6 are the brief's original six. Row 7 joined them when the attach row was corrected (R1): a service pane is output-only, so lpm loses a row it had been claiming. Row 8 (scaling) is the concession the reviewer found the description undercounting. Row 9 is a concession too, and counting it is the point of the ledger's hedge: `lpm start` needs the app running, while `foreman start` and `overmind start` are cold-shell one-liners.

**What changed from the brief's table, and why**

- **"Reads an existing Procfile as-is" → "Runs your Procfile.dev untouched"**, **"Runs on Linux or Windows" → "Installs on a Windows or Linux workstation"**, **"License" → "Licence on the gem, the binary and the app"** — all three were byte-identical to a label on another /vs page (the hub's eight-tool matrix, `/vs/iterm2`, `/vs/cmux`). R4 makes rule 3 binding, so they are rewritten here in Foreman/Overmind vocabulary. Six more labels were reworded for the same reason after `/vs/overmind` rewrote its own six.
- **"Attach to one process interactively — click the pane" → "Attach a shell to one running process — panes are read-only"** (R1). `Pane.tsx:56` is `disableStdin: true`; the only surface that takes keystrokes is `InteractivePane` (`:542`, `disableStdin: false`), used for terminal tabs, never for a service. Clicking a service pane or its label focuses output. The row now reads as the loss it is.
- **"Needs tmux installed — lpm ✗ / Foreman ✗ / Overmind ✓" → "What you install before the first run"** (R2). A ✓ in the competitor column for a *requirement* reads as a win. The row now names what each tool actually asks you to install, and carries the ledger's mandated dependency claim in lpm's cell: no tmux.
- **"One interleaved, colour-prefixed log stream" → "All output interleaved on one stdout stream"** (R3). The man page says "interleave the output on stdout" and documents no colour or prefix option; the README mentions neither. The sourced half of the claim survives, the unsourced half is gone — here and in the QuickAnswer, FAQ 1 and the hero.
- **"Loads .env automatically — Overmind `.overmind.env`" → "Reads a .env file without being asked — Overmind `.overmind.env, then .env`"** (R3/R1). Overmind's README lists `~/.overmind.env`, `./.overmind.env`, `./.env`, `$OVERMIND_ENV`. Crediting it with only the dotted file understated the competitor.
- **"A crashed process leaves the rest running — Overmind ✓" → "only with -c or --any-can-die"** (R3). The README: "Usually, when a process dies, Overmind will interrupt all other processes"; you opt out per process with `-c`, or globally with `--any-can-die`. Foreman's cell names the mechanism instead of a bare ✗, and is cited to the engine source.
- **"Assigns $PORT per process — Foreman ✓" → "-p base, +100 a line"** (rule 5). The man page: "$PORT value starts as the base port as specified by `-p`, then increments by 100 for each new process line."
- **"Stack survives closing the terminal — Overmind `tmux session`" → "its tmux session, detach with Ctrl-b d"** (R3). That is the mechanism the Overmind README documents; the tmux manual is not one of this page's sources, so the cell stays inside what the README says.
- **"Desktop app — ✗ / ✗" → "A desktop window rather than a foreground command"** with the competitor cells naming the shape. Rule 5: a bare ✗ against a CLI is not a mechanism.
- **"One command starts the whole stack — one click, or lpm start"** gained the hedge the ledger requires. `/vs/tmux` and `/vs/docker-compose` both ship the ledger's exact cell string, so this one is worded "with the app running" instead of "while the app is open" (rule 2).

Every competitor cell names a real mechanism from a source below; nothing says "via custom commands".

---

## 4. Claims table — every lpm claim, with a source line

Paths are relative to `/Users/gug007/Projects/lpm`. Re-verified independently 2026-09-10; a bare `lpm: true` cell is treated as a hard claim.

| Claim, as it appears on the page | Citation |
|---|---|
| "Runs your Procfile.dev untouched — ✗", "It will not read your Procfile", "lpm never parses the file" | `grep -rn Procfile desktop/frontend/src desktop/frontend/src-tauri/src cli/src` → 0 hits |
| "Sets $PORT for each process type — you write it in env:", "`port:` is what it watches for conflicts, not something it exports", "lpm exports exactly the `env:` map you write" | `desktop/frontend/src-tauri/src/config.rs:1051-1061` — `build_local_script` emits `export k=v` for the `env:` map and the command, nothing else; `config.rs:575` (`port` is a declared integer); nothing anywhere in `src-tauri/src` injects `PORT` |
| "Reads a .env file without being asked — ✗", FAQ 4 | same `config.rs:1051-1061`: the only environment a service gets is the `env:` map it declares |
| "All output interleaved on one stdout stream — ✗", "A pane per process beats scrolling one stream" | `desktop/frontend/src-tauri/src/log_streaming.rs:1-14` — a per-project poller captures **each pane** every 500 ms and emits a per-pane event; there is no aggregation step |
| "Exports launchd or systemd units for deploy — ✗", "lpm has no export; it is the local loop only" | no unit-file writer exists: `grep -rni "launchd\|systemd" desktop/frontend/src-tauri/src/*.rs cli/src/*.rs` returns only PATH/comment/test hits |
| "Mac app; Linux only as a remote host", FAQ 6 ("its window opens on a Mac and nowhere else… a Linux server can still be where your Rails processes actually run") | `desktop/frontend/src-tauri/tauri.conf.json:31-42` (bundle targets `app`/`dmg`, a `macOS` block with `minimumSystemVersion`); `config.rs:597-612` (`SshSettings` / `is_remote`); `peerssh.rs:53` (`REQUIRED_TOOLS = ["git"]` — a host runs its services from the same binary) |
| "Attach a shell to one running process — panes are read-only" | `desktop/frontend/src/components/Pane.tsx:56` (`disableStdin: true`) and `:58` (`scrollback: 10000`); `InteractivePane.tsx:542` is the only `disableStdin: false` surface and is used for terminal tabs, never for a service; `services.rs` has no path that writes user input into a service pane — `sessions::restart_service_pane` (`sessions.rs:157-166`) only re-types the service's own command |
| "Run two copies of web from one line — one entry, one process", "no process scaling: one entry is one process" | `config.rs:807` — `services` is a `BTreeMap<String, ServiceDef>` keyed by name, with no instance count anywhere in the shape |
| "One command brings the whole stack up — one click, or lpm start with the app running"; the migrate footnote's app-needed list | `cli/src/start.rs:16` and `cli/src/stop.rs:10` and `cli/src/service_cmd.rs:50` and `cli/src/run.rs:140` all open with `control::require_app(ctx)?`; `cli/src/control.rs:12-19` — a missing app is a usage error, "lpm app is not running — start it to control projects" |
| "`lpm list` and `lpm logs css` go straight to the services and answer from any shell, open app or not" | `cli/src/list.rs:40-45` — reads `config::project_names` and `sessions::running_sessions()` with no `require_app`; `cli/src/logs.rs:76-110` — `sessions::session_exists` then `sessions::capture_pane`, again with no `require_app` |
| "`lpm status`, which reports what your agents are doing, needs it too" | `cli/src/status.rs:14-21` — pings the app first and prints "lpm app is not running — no live status." when the ping fails. **This corrects the previous version of this page, which grouped `lpm status` with the two verbs that work from a cold shell** (R1). |
| "A live pane per process, all visible at once — ✓", "each service is its own pane" | `desktop/frontend/src/components/PaneView.tsx:534-556` (one `Pane` per service, tiled); `desktop/frontend/src-tauri/src/sessions.rs:210-213` (one `PaneSpec` per service) |
| "Restart css without restarting web — lpm service css restart", "you bring that one back from the project's Services menu" | `desktop/frontend/src-tauri/src/services.rs:466-489` (`restart_service_at`) and `:508-527` (`restart_service_by_name`, the socket verb the CLI uses); `cli/src/main.rs:151-163` (`lpm service <name> <op>`); the UI path is the project header's Start menu, `desktop/frontend/src/components/project-detail/StartMenu.tsx:58-69` → `services.rs:448-462` (`toggle_project_service` flips one service off and on) |
| "One process dying leaves the others alive — ✓", "`worker` can crash without taking `web` down with it", "nothing stops the siblings when one exits" | `desktop/frontend/src-tauri/src/sessionpane.rs:117-133` — each pane owns its own reader thread, and its `on_exit` fires for that pane id alone; the handler at `sessiond.rs:124-126` does exactly one thing with it, `drop_pane(&pane_id)`. The only teardown paths in `services.rs` are the explicit `stop_service` / `stop_all` ones, so a crash neither cascades to the siblings nor auto-restarts |
| "The stack outlives the terminal you started it in — quit the app, services stay up", "leaves them running when you quit the app" | `desktop/frontend/src-tauri/src/sessiond.rs:1-13` — one process outside the app's process group holding every project's service panes |
| "What you install before the first run — the app; no tmux, no Ruby" | `desktop/frontend/src-tauri/src/tmuxmigrate.rs:12` ("this is lpm's last tmux call, not a dependency") and `:18-20` (the whole handover is skipped when the marker exists **or** tmux is absent). Written as a dependency-and-install claim per ledger ruling 1; the migration itself is an implementation detail and appears nowhere on the page. No Ruby: lpm ships as a signed `.app` with an embedded CLI binary, `tauri.conf.json:34` |
| "Sidekiq waits for Redis before it starts — dependsOn: [redis]", "`dependsOn: [db]` gives a real start order, with a clear error instead of a hang if you write a cycle" | `config.rs:580-581` (`dependsOn`, alias `depends_on`); `config.rs:1745-1770` — topological order, and `Err("service dependency cycle: …")` when the graph has one (`config.rs:2353` tests it) |
| "It orders starts; `lpm wait --port 5432` is the readiness gate." | `cli/src/wait.rs:1-5` — the port/service modes poll client-side every 250 ms and never touch the app (only `--agent` calls `require_app`, `wait.rs:197`); `cli/src/main.rs:165-182` |
| "Names what is already holding :3000 — ✓", "checks the ports your services declare before it starts, names the process holding one, and offers to free it or stop the start" | `desktop/frontend/src-tauri/src/ports.rs:1-20` (local conflict detection feeding the start dialog) with holder lookup at `portsprobe.rs:218` (`lookup_holders`); the dialog itself is `PortConflictDialog.tsx:29-31` ("Stop the holder below to start the project", each row printing "used by <description>") with `Cancel` / `Stop & start` at `:60-73`; `config.rs:576-577` (`portConflict`) |
| "Run a named subset instead of a per-run flag — profiles:", "`lpm start --profile full`" | `config.rs:809` (`profiles: BTreeMap<String, Vec<String>>`); `cli/src/main.rs:132-141` (`Start { profile }`); the picker is `StartMenu.tsx:41-56` |
| "Two Rails apps up at once in one window — ✓", "Two or three repos are up at once" | `desktop/frontend/src-tauri/src/services.rs:22-24` (run state is a map keyed by project file name, so several projects hold running state at once); `cli/src/list.rs:1-3,40-45` ("every project with its running state") |
| "A second Claude Code or Codex agent gets its own checkout — 1–50 worktrees or copies", "anywhere from 1 to 50 of them" | `desktop/frontend/src-tauri/src/projects_crud.rs:509-521` (`git worktree add -b`); `desktop/frontend/src/components/BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`); `cli/src/main.rs:239-246` (`--count` parsed `1..=50`) |
| "a linked worktree arrives without your `.env` or your installed gems" (the hedge ledger §5.6 requires) | `projects_crud.rs:517` is a plain `git worktree add -b`, which carries no ignored files; the app's own dialog says so — `BulkDuplicateDialog.tsx:925-936`, "Install dependencies in the copy after Git creates it" (worktree) vs "Copy without dependencies, then install them fresh" (standalone) |
| "Claude Code or Codex in the next tab" (and every Claude Code / Codex mention) | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (status hooks are installed for Claude Code and Codex); `desktop/frontend/src/types.ts:247` |
| "A desktop window rather than a foreground command — ✓", "macOS" | `desktop/frontend/src-tauri/tauri.conf.json:31-42` |
| "Licence … — MIT", "MIT-licensed" | `LICENSE:1` ("MIT License") |
| "The one-off commands you run with foreman run become actions you click, or call with lpm run." | `config.rs:824` (`actions` map); `cli/src/main.rs:321-336` (`lpm run <action>`), gated by `cli/src/run.rs:140` (`require_app`) — which is why `lpm run` is in the migrate footnote's app-needed list |
| ".lpm.yml conversion sample is a valid config" | `config.rs:568-582` (`cmd`, `cwd`, `port`, `portConflict`, `env`, `dependsOn`), `config.rs:807-809` (`services`, `profiles`), `config.rs:1508-1546` (a repo `.lpm.yml` merges under the personal project file) |

### Competitor claims — each one, and the source it came from

Fetched and read this pass; all seven URLs are in `ComparisonBasis`.

| Claim on the page | Source |
|---|---|
| "interleave the output on stdout" (row 4, hero, QuickAnswer, FAQ 1) | the foreman man page, EXAMPLES: "Start one instance of each process type, interleave the output on stdout" |
| Foreman `-m web=2,worker=0` / `-m web=2` (rows 8, 17) | the man page: `-m, --formation` — "the number of each process type to run… `process=num,process=num`" |
| Foreman `$PORT` "base port as specified by `-p`, then increments by 100 for each new process line" (row 2, verdict card, migrate) | the man page, `-p, --port` |
| Foreman reads `.env` "from the working directory" (row 3, migrate, FAQ 4) | the man page: "If a `.env` file exists in the current directory, the default environment will be read from it" |
| `foreman export` generates upstart / systemd / launchd units (row 5, verdict card, FAQ 5, migrate) | the man page, EXPORTING |
| "one exit ends the formation" (row 12), "the CSS watcher dies and takes Rails with it", "One process exits and the whole formation shuts down mid-request", "a foreman formation ends with the command that started it" | Foreman's engine source: a child dying breaks the run loop into `terminate_gracefully`, which sends SIGTERM to **all** children and then SIGKILL after `--timeout` |
| Foreman is MIT (row 21) | the Foreman README: "Foreman is licensed under the MIT license" |
| Foreman "anywhere Ruby runs" / "a Ruby gem" (row 6, FAQ 6, verdict card) | the Foreman README (a gem, installed with `gem install foreman`) and the gem's own version list |
| `overmind connect` gives you input on one process (row 7, QuickAnswer, verdict card) | the Overmind README: `connect` — "Access process input via tmux window" |
| `overmind restart css` (row 11, one-terminal card 1, verdict card) | the Overmind README: `restart` — "Relaunch processes without stopping others" |
| Overmind `-p` base / `-P` step (row 2, migrate) | the Overmind README: `-p`/`OVERMIND_PORT` base (default 5000), `-P`/`OVERMIND_PORT_STEP` (default 100) |
| Overmind `-l web,worker` (row 17) | the Overmind README: `-l`/`OVERMIND_PROCESSES` — "Running only the specified processes" |
| Overmind `-m web=2` / `-m web=2,worker=3` (rows 8, QuickAnswer, verdict card) | the Overmind README: `-m`/`OVERMIND_FORMATION` |
| Overmind reads `.overmind.env`, then `.env` (row 3, migrate) | the Overmind README's env-file order: `~/.overmind.env`, `./.overmind.env`, `./.env`, `$OVERMIND_ENV` |
| "a tmux window each" / "its tmux session, detach with Ctrl-b d" / "tmux, then the binary" (rows 10, 13, 14, hero, QuickAnswer) | the Overmind README: "Overmind starts processes in a tmux session, so you can easily connect to any process and gain control over it"; you "safely disconnect from the window by hitting Ctrl b… and then d"; tmux must be installed |
| "only with -c or --any-can-die" (row 12, one-terminal card 1) | the Overmind README: "Usually, when a process dies, Overmind will interrupt all other processes", with `-c`/`OVERMIND_CAN_DIE` per process and `--any-can-die` globally |
| Overmind is MIT (row 21), "Linux, *BSD, macOS" (row 6, FAQ 6, verdict card) | the Overmind README |
| "`bin/dev` shells out to Foreman with `Procfile.dev`" (FAQ 3), and the `bin/rails tailwindcss:watch` line in the sample | the tailwindcss-rails README: "Running `bin/dev` invokes Foreman to start both the Tailwind watch process and the rails server in development mode based on your `Procfile.dev` file" |
| "The foreman gem sits at 0.90.0 from July 2025" (`lpmNote`) | the foreman gem's version list: 0.90.0, 27 July 2025 |
| "Overmind's newest tag, v2.5.1, is from March 2024" (`lpmNote`) | Overmind's release tags: v2.5.1, 26 March 2024 |

Two competitor claims from the brief were **deleted** rather than sourced (R3/R8): "colour-prefixed" (no colour or output-format option is documented anywhere in the man page or README) and "both still work, neither is moving fast" (a maintenance judgement no source supports — the two release dates now do the work, and the reader draws their own conclusion). The brief's fourth source, the Rails getting-started guide, was **replaced**: it mentions neither `bin/dev`, `Procfile.dev` nor foreman, so it could not carry FAQ 3.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Foreman or Overmind — which should I use?** — the QuickAnswer's first paragraph, verbatim (JSX links Overmind to `/vs/overmind`; `answerText` carries the plain string). "colour-prefixed" is now "on stdout" in both copies.
2. **Does lpm read my Procfile?** — "No. lpm never parses the file. You copy the lines into a `services:` block — a minute for a normal Rails app — and the Procfile stays in the repo for Heroku and `foreman export`."
3. **What replaces bin/dev in a Rails app?** — "`bin/dev` shells out to Foreman with `Procfile.dev`. With lpm you press Start, or run `lpm start`, and the same lines come up as separate panes. Keep `bin/dev` working — nothing removes it."
4. **Does lpm load .env the way foreman start does?** — "No. lpm exports the `env:` map you write on each service, so move the variables you need there or keep loading `.env` inside the command with dotenv."
5. **Does lpm replace foreman export?** — the existing answer, verbatim from the previous page.
6. **Does it run on Linux or Windows?** — rewritten (R5). "Foreman is a Ruby gem, so it goes wherever Ruby goes, and Overmind covers Linux, \*BSD and macOS. lpm is the odd one out — its window opens on a Mac and nowhere else. A Linux server can still be where your Rails processes actually run, with the Mac driving them." The fact is unchanged and the link still lands on `/run-claude-code-on-a-remote-server`, anchored on "where your Rails processes actually run". It is written this way because the brief's sentence, and then a first rewrite of it, both collided with `/vs/docker-compose`'s answer to the same question — see "Rulings applied".

Questions 3 and 4 drop the brief's backticks because `FaqItem.question` is a plain string; the code spans are preserved in the answers.

---

## 6. Links

`RelatedPages` (5, per spec §6.1): `/vs/overmind`, `/vs/docker-compose`, `/config`, `/best-terminal-for-claude-code-and-codex`, `/git-worktree-for-ai-agents`. Card descriptions are written here — the brief assigns the targets only.

In-body: `/vs/overmind` from the QuickAnswer and from FAQ 1, `/config` from the migrate section's description, `/run-claude-code-on-a-remote-server` from FAQ 6. Every one of the four lands on a sentence that is still in the copy (R7); the hero's `jumpHref="#matrix"` lands on `procfile-matrix.tsx`'s `<section id="matrix" className="scroll-mt-20">`. `/git-worktree-for-ai-agents` carries the worktree caveat's context and stays a `RelatedPages` card, because `WhenToPick.points` is `string[]` and cannot hold a link.

---

## Notes for engineers

- Components: `_components/one-terminal.tsx` (`OneTerminal`), `_components/procfile-matrix.tsx` (`ProcfileMatrix`), `_components/migrate.tsx` (`Migrate`). One component per file; the matrix keeps its `ROWS` const in the same file (282 lines). `page.tsx` is 390 — the next section added to this page needs its own file.
- Rhythm: the two new sections are `py-16 sm:py-20`; `procfile-matrix.tsx` keeps `py-20 sm:py-24` because it stands in the shared `FeatureMatrix` slot and that component's rhythm is not being churned this pass.
- No emerald anywhere: the matrix helpers were re-tinted to `feature-matrix.tsx`'s neutral palette when cloned from `isolation-matrix.tsx`.
- 390px: the desktop matrix table is `hidden md:block` inside `overflow-x-auto`; below `md` each row is a card with a three-row `<dl>`, and an all-equal row collapses to one "All three" line. `CodeBlock` scrolls its own `<pre>`.
- Dates: `VS_REVIEWED` / `VS_REVIEWED_ISO` from `components/vs/reviewed.ts`. No date literal in the page.
- String cells in the matrix render as plain text, not monospace — several are prose ("anywhere Ruby runs", "Mac app; Linux only as a remote host") and mono would misread them as commands. This matches `feature-matrix.tsx`; `CommandMap`'s all-monospace rule does not apply here.

## Deviations from the brief, and why

1. **`VerdictCard.title` vs the brief's two strings.** `components/vs/verdict-cards.tsx` requires `label` + `title` + `body`; the brief gives a heading and one sentence. No third copy string was invented: the eyebrow `label` is the tool's name (Foreman / Overmind / lpm), the brief's heading is the `title`, the sentence is the `body`. Backticks inside the bodies are dropped because `body` is a plain string.
2. **The CLI hedge sentence is this page's own wording.** Ledger §5.5 mandates "…ask the running app, so keep lpm open — it is where the panes live. `lpm list`, `lpm logs` and `lpm status` read the session daemon directly." Three things block it verbatim: "session daemon" is a banned implementation noun; `/vs/tmux` and `/vs/iterm2` already ship that sentence, which would break rule 2; and — per R1 — the second half is **factually wrong**, because `lpm status` pings the app first. The shipped footnote splits the three verbs correctly and adds `lpm run`, which the `SectionVideo` above it depends on. It also no longer says "the panes live inside it", which contradicted the page's own "services run outside the app".
3. **`SectionVideo` description drops the brief's backticks** — the prop is a plain string, not `ReactNode`.
4. **Copy written here, because the brief supplies none:** the hero description, the hero jump label, the migrate section's description, the competitor column's `WhenToPick` headline, the five `RelatedPages` descriptions, the `Faq` title, and the CTA title and description. Every factual claim in them is in the claims table.
5. **The foreman man-page source link is `https://`, not the brief's `http://`.** Same host and path; the plain-HTTP form only bought an outbound redirect from an HTTPS page.

## Rulings applied (this pass)

The reviewer left six defects in place because it had been told the spec outranked the source. R1–R8 reverse that. All six are now fixed; nothing is left open against the spec.

1. **R1 — "Attach to one process interactively — lpm: `click the pane`" was contradicted by the source.** Now "Attach a shell to one running process — lpm: `panes are read-only`", and the hero's "panes you click" is gone with it. `Pane.tsx:56` is `disableStdin: true`. The row moved into the concession block, which is why the stated count went from six to nine rather than to eight. `/vs/overmind` carries the same premise in ledger §5.5 and is another engineer's page; this fix does not depend on theirs, and the two pages now disagree until theirs lands.
2. **R2 — the concession count.** Rows reordered so all nine concessions come first; the description says "Nine of these twenty-one rows go to Foreman or Overmind. They are the first nine." Nothing else on the page states a concession count. The other numeric framing, "the same four lines", was wrong against the three-line sample in two places (matrix title, OG subline) and is now "three" in both; the CTA and QuickAnswer already said three. The `Needs tmux installed` row's misleading competitor ✓ was re-polarised into "What you install before the first run".
3. **R3 — sourcing.** Two claims deleted ("colour-prefixed"; "both still work, neither is moving fast"), one source replaced (the Rails guide, which mentions neither `bin/dev` nor foreman, → the tailwindcss-rails README), three sources added and read (Foreman's engine source for the formation-teardown claim; the foreman gem's version list and Overmind's release tags for the two dates in the `lpmNote`). Reading the Overmind README properly also **corrected two cells in Overmind's favour or against it**: it reads `.env` as well as `.overmind.env`, and by default a dying process there interrupts the rest. Every competitor claim on the page now appears in the table in §4 beside the source it came from.
4. **R4 — duplicate row labels.** `grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` no longer reports any matrix row label; the remaining duplicates are `VerdictCards` labels (tool names, "Both", "lpm") and `ComparisonBasis` source labels, both exempt. Nine labels were rewritten here, in Foreman/Overmind vocabulary.
5. **R5 — shared eight-word runs.** An 8-gram scan of this page's prose against all seven siblings and the hub returns nothing once metadata scaffolding and identifiers are filtered out. FAQ 6 took two rewrites: the brief's version shared thirteen words with `/vs/docker-compose`, and a first rewrite ("There is no Windows build and no Linux desktop build…") collided with that page's own concurrent rewrite of the same answer. The shipped version leads with Foreman and Ruby instead of with the negative. The CLI/app sentence, the Procfile-conversion sentence and the `one click, or lpm start …` cell were all reworded off the strings the siblings use.
6. **R6 — the hedge that was dropped.** Ledger §5.6 says a worktree carries neither `.env` nor installed dependencies and "say so". It is now in the `WhenToPick` lpm column, in this page's vocabulary: "a linked worktree arrives without your `.env` or your installed gems."
7. **R8 — nothing invented to fill a slot.** The two deleted claims were not replaced with substitutes; the row count went from 21 to 21 because the reworked rows carry more information, not because anything was padded to keep a number.

### Still worth an orchestrator's eye

- **`/vs/overmind`'s attach line.** Ledger §5.5 clears "takes focus with 10,000 lines of scrollback and a live prompt, so you can hit a debugger or open a `pry` session in that one process" for `/vs/overmind`. The "live prompt" half is the same claim this page just retired: `Pane.tsx:56` is `disableStdin: true`, and `:58` is where the 10,000 comes from, so the scrollback half is right and the prompt half is not. That page is owned by another engineer; flagged, not touched.
- **Seven sources in one `ComparisonBasis` line.** The component renders them as an inline comma list, which is legible at 390px but long. Trimming it would mean dropping a claim, so it stays.
