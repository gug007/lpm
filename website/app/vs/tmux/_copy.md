# /vs/tmux — Content & Copy Plan

Page route: `/vs/tmux`
Target primary keyword: **tmux alternative dev / tmuxinator alternative**
Intent: a developer who uses tmux (or tmuxinator) mainly to bring a multi-service dev stack up on a Mac, and wants to know whether something else does that part better.

**Angle:** tmux does three jobs — get the stack up, keep sessions alive on a box, and script windows/splits/keys. lpm takes the first and concedes the other two out loud. Every sentence is written in tmux's own vocabulary (`.tmux.conf`, `history-limit`, `respawn-pane`, `tmux ls`, tmuxinator `windows:`), which is also what keeps the page from reading like its siblings.

Reviewed: `VS_REVIEWED` / `VS_REVIEWED_ISO` from `components/vs/reviewed.ts` (September 23, 2026 / 2026-09-23). No date is typed in this page.

---

## 1. Metadata

```ts
title: "tmux & tmuxinator Alternative for Mac Dev Stacks"
// 48 chars (renders as 54 with the layout's " — lpm" suffix)
description:
  "Run your dev stack one pane per service, with no .tmux.conf and no tmuxinator YAML. lpm needs no tmux installed — and here is where tmux still wins."
// 148 chars
keywords: [
  "tmux alternative dev",
  "tmux alternative mac",
  "tmuxinator alternative",
  "tmuxinator vs lpm",
  "tmux without config",
  "tmux dev environment",
  "tmux dev stack",
  "run dev servers in panes",
  "zellij alternative mac",
  "tmux vs lpm",
  "tmux alternative for claude code",
  "do i need tmux",
] // 12
alternates.canonical: "/vs/tmux"
openGraph.title: TITLE          // same const
openGraph.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/tmux"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
twitter.title: TITLE
twitter.description: DESCRIPTION
```

`TITLE` and `DESCRIPTION` are declared once and used in `metadata`, `openGraph`, `twitter` and `webPageJsonLd`. `title: { absolute: … }` is gone, so the layout appends ` — lpm` once. The old title's "No Config" string is gone from all five surfaces (title, H1, OG title, Twitter title, WebPage JSON-LD) — ledger §5.3.

OG image (`opengraph-image.tsx`): `headline: ["A tmux alternative for Mac", "dev stacks — no .tmux.conf."]`, `alt` is the H1 verbatim, subline "One live pane per service, no tmux installed, and an honest list of what tmux still does better."

---

## 2. Section outlines

Canonical /vs child order, no deviations:

`ComparisonHero → ComparisonBasis → QuickAnswer → VerdictCards → Jobs (unique A) → FeatureMatrix (#matrix) → Migrate (#migrate, unique B) → CommandMap → SectionVideo → WhenToPick → DemoSection → Faq → RelatedPages → Cta`

Three sections are wrapped in local files so `page.tsx` stays under 400 lines. The wrapper renders the shared component and owns only this page's data:

| File | Renders |
|---|---|
| `_components/short-answer.tsx` | `QuickAnswer` + the three paragraphs + the config sample |
| `_components/matrix.tsx` | `FeatureMatrix id="matrix"` + the 16 rows + the sidebar footnote |
| `_components/jobs.tsx` | unique section A — the three jobs, each with a verdict chip |
| `_components/migrate.tsx` | unique section B — `id="migrate"`, the two YAML files side by side |
| `_components/commands.tsx` | `CommandMap` + the eight tmux/tmuxinator translations |

### Hero
Eyebrow `lpm vs tmux`. H1 `A tmux alternative for Mac dev stacks — panes without .tmux.conf.` Description: "tmux is a fine multiplexer and this page does not pretend otherwise. What it does not know is what a project is: which commands belong together, which order they start in, and which repo they came out of." (The earlier draft said "which four commands"; the page renders three-service YAML twice, so the count came out rather than the samples changing.) Verdict line: "Most people asking for a tmux alternative want one of tmux's three jobs. lpm takes that one." Jump link `Coming from tmuxinator` → `#migrate`. `downloadSource="vs-tmux-hero"`.

### Comparison basis
Sources: the tmux manual (`man7.org/linux/man-pages/man1/tmux.1.html`) and the tmuxinator README (`github.com/tmuxinator/tmuxinator`). Two sources, and every competitor claim on the page traces to one of them — which is why no card, FAQ or row asserts a mechanism belonging to Overmind, PM2 or zellij. `lpmNote`: "Where tmux is the better tool the comparison below says so, in three of its sixteen rows; every lpm cell was read off the app's own source." The count agrees with the matrix `description` (see §7 deviation 2).

### Quick answer
H2 is the query: `Is there a tmux alternative for running a local dev stack on a Mac?` First paragraph answers it in 55 words without opening on the brand. Then the scrollback/restart paragraph, the `~/.lpm/projects/myapp.yml` sample, and the "press Start" paragraph that concedes remote sessions, vim splits and keybindings.

### Verdict cards
Headings `Keep tmux for` / `Swap in lpm for` / `Run both`, over the labels `tmux` / `lpm` / `Both`. Equal weight, no highlight, no emerald.

### Jobs (unique A)
Eyebrow `Be specific about what you use it for`, title `tmux does three jobs. lpm replaces one of them.` Cards: *Getting the dev stack up* (chip **lpm takes this**), *Sessions that outlive the terminal* (chip **tmux keeps this**), *Windows, splits and keys* (chip **tmux keeps this**). Closing line: "Most people asking for a tmux alternative want job one and have never wanted jobs two and three."

### Feature matrix
`id="matrix"`, title `Where each tool earns its keep`, 16 rows (§4), footnote links `/terminal-with-project-sidebar`. Description names the three rows that go to tmux and the one neither tool does, so the count is checkable against the table rather than asserted.

### Migrate (unique B)
`id="migrate"`, eyebrow `Migration`, title `Coming from tmuxinator`. `~/.config/tmuxinator/myapp.yml` beside `~/.lpm/projects/myapp.yml`, then the note on `dependsOn`, `profiles`, `lpm wait --port 5432` and `.lpm.yml`, linking `every field` → `/config`.

### Command map
`fromLabel="tmux / tmuxinator"`, `toLabel="lpm"`, eight rows (§4). Footnote splits the verbs into the four that want lpm open (`lpm start`, `lpm stop`, `lpm service … restart`, `lpm status`) and the three that read your running services from any shell (`lpm list`, `lpm logs`, `lpm wait --port`). "Those four" is the count actually rendered.

### Section video
`clip="add-project"`, eyebrow `See it`, title `A project, defined once`.

### When to pick
lpm headline: "You mostly use tmux to get your dev stack running." tmux column keeps all six bullets, including the macOS-only concession.

### FAQ
6 items (§5). Two carry JSX answers and both supply `answerText`.

### Related pages
`/vs/overmind`, `/vs/pm2`, `/ssh-terminal-for-mac`, `/terminal-with-project-sidebar`, `/config` — exactly the five from spec §6.1.

### CTA
`Keep tmux. Let lpm bring the stack up.` `downloadSource="vs-tmux-cta"`.

---

## 3. Hero-specific

- Eyebrow: `lpm vs tmux`
- H1: `A tmux alternative for Mac dev stacks — panes without .tmux.conf.`
- Verdict line: `Most people asking for a tmux alternative want one of tmux's three jobs. lpm takes that one.`
- Primary CTA: `HeroDownload` with `source="vs-tmux-hero"`
- Secondary: `Coming from tmuxinator` → `#migrate`; GitHub link (`vs-hero`)

---

## 4. Comparison matrix

lpm column first — fifteen rows since 2026-09-23, when the two overlapping repo-reading rows merged into one detection row. **Three rows go to tmux outright** — your own shells across a restart, remapping keys and scripting layouts, and where you install each tool. One row (restarting a crashed service) goes to neither. Two are a straight ✓/✓ draw (one live pane per service, services surviving a quit). The rest go to lpm, four of them hedged in the cell rather than claimed flat: row 1 needs lpm running, row 6 concedes that only tmux's number is adjustable, row 13's tmux cell credits tmuxinator, and row 14 says lpm drives the remote box from a Mac instead of living on it. The matrix `description` names the three tmux rows so the count can be checked against the table; the `lpmNote` repeats the same three ("three of its sixteen rows"). Description in full: "tmux wins on persistence, portability and raw scriptability; lpm wins on projects, a drafted config and a desktop app. Three rows below go to tmux outright — your own shells across a restart, keys and layouts in a config file, and where you install each tool — and one goes to neither." The spec's "ubiquity" became "portability": "already installed" was the market claim cut from row 16, and the framing sentence had to stop implying it.

| Capability | lpm | tmux |
|---|---|---|
| One command brings the whole project up | Start button; `lpm start myapp` needs lpm running | via tmuxinator |
| Service list drafted from your repo, then yours to edit | package.json, Procfile, Gemfile, go.mod, compose and more, read as you add it | ✗ |
| Redrafts the whole config with your own agent CLI | Claude Code, Codex, Gemini CLI or OpenCode | ✗ |
| One live pane per service | ✓ | ✓ |
| Scrollback kept per service pane | 10,000 lines, and no setting to change it | 2,000 by default, raise it with `history-limit` |
| Restart one service without touching the others | `lpm service web restart` | `respawn-pane` by hand |
| Services keep running after you quit the app | ✓ | ✓ |
| Your own shells survive a restart too | tabs come back; Claude Code and Codex resume their conversation, shells start fresh | ✓ |
| Restarts a crashed service automatically | ✗ | ✗ |
| Which agent needs you, shown on its own tab | working, needs you, done or error, from Claude Code and Codex | ✗ |
| Runs with no tmux installed | ✓ | ✗ |
| Switch projects from a sidebar that remembers them | ✓ | via tmuxinator |
| Attach a remote box and run its services in the same window | from the Mac app | on the box itself |
| Remap every key and script custom layouts in a config file | three remappable app hotkeys, plus a shortcut per action | via `.tmux.conf` |
| Where you install it | a Mac app; a Linux box joins as a remote host | on each Unix box you use it on |

Deleted from the old page: `Zero config to run a detected stack` (false — a project cannot start without a `services:` map), `Auto-detect Rails, Next.js, Go, Django, Flask, Docker Compose` (false — nothing detects those frameworks), `Session detach / reattach across terminal restarts` (split into the services row and the own-shells row), `Works over SSH on any Unix box` (misleading label), `Tiny footprint, ubiquitous on Unix systems` (folded into "Where it runs"), `Native macOS desktop app with visual switcher`, `Multi-project management as a first-class concept`, `Start / stop / duplicate projects as first-class ops`, `Built for running AI agents (Claude Code, Codex) in parallel`, `Fully scriptable keybindings and layouts` (relabelled).

### Command map

| tmux / tmuxinator | lpm | note |
|---|---|---|
| `tmuxinator start myapp` | `lpm start myapp` | Or press Start on the project. |
| `tmux ls` | `lpm list` | Running state and service counts, plus agents when lpm is up. |
| `tmux attach -t myapp` | click the project in the sidebar | |
| `tmux kill-session -t myapp` | `lpm stop myapp` | |
| `tmux capture-pane -p -t myapp:web` | `lpm logs web -n 200` | Trailing lines of that service's pane. |
| respawn one pane | `lpm service web restart` | The other services keep running. |
| `set -g history-limit 2000` | nothing to set; 10,000 lines per pane | |
| — | `lpm wait --port 3000` | Block a script until the stack is listening. |

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Do I need tmux installed to use lpm?** — No — tmux is not a dependency. lpm runs each service in a pane it owns, and it never installs tmux for you. If tmux is already on your machine, keep it: your .tmux.conf and your existing sessions are untouched.
2. **Does lpm use tmux under the hood?** — No. Quit lpm and your dev servers keep running; reopen it and it finds them again. Each service keeps 10,000 lines of scrollback — tmux ships with 2,000 until you raise history-limit — and there is no .tmux.conf to maintain, no prefix key to learn, and no session name to attach to. You do write a config for lpm — the services map above — but it is names and commands, not keybindings.
3. **Can I keep using tmux alongside lpm?** — Absolutely. lpm manages your project's services — it has no opinion on your editor, shell, or terminal setup. Keep tmux for SSH, long-lived sessions, vim splits, and anything else you already use it for. Let lpm handle the boring part: starting the dev stack when you open a project.
4. **Is this basically tmuxinator with a GUI?** — Overlapping goals, different shape. tmuxinator gives you named, YAML-defined tmux layouts per project. lpm gives you managed projects with live pane output, a visual switcher, and first-class start / stop / duplicate. If your tmuxinator file is mostly rails s, npm dev, redis, and sidekiq, lpm will feel like a shortcut. If you lean on custom layouts, splits, and keybindings, tmuxinator will still suit you better.
5. **What about my remote or SSH workflow?** — lpm can attach a remote dev box as an SSH project: its services run in panes beside your local ones, and each port a service declares is forwarded to localhost once it starts listening. The box needs SSH and bash — no tmux server to install there either. lpm does not detect an SSH project's services, so you list them yourself. If your whole session lives inside SSH and you reach it from arbitrary machines, tmux on that box is still the right tool.
6. **What about zellij?** — Same answer as tmux: lpm does not use zellij either, and does not need it installed. If zellij is where you live, keep it — lpm's job is bringing a project's services up in its own panes, and it has no opinion on what you attach to for everything else.

---

## 6. Claims table

Every lpm cell and every lpm sentence on the page, with the source that makes it true. Paths are relative to the repo root.

| Claim (where it appears) | Source |
|---|---|
| Start button; `lpm start myapp` needs lpm running (matrix row 1, quick answer, command-map footnote) | `cli/src/start.rs:16` `control::require_app`; `cli/src/control.rs:12-19` errors "lpm app is not running — start it to control projects"; `cli/src/main.rs:131-141`. Same for `lpm stop` (`cli/src/stop.rs:10`) and `lpm service … restart` (`cli/src/service_cmd.rs:50`) |
| `lpm list`, `lpm logs` and `lpm wait --port` read your running services from any shell, lpm up or not (command-map footnote, `lpm wait` row) | `cli/src/list.rs:42-46` reads `sessions::running_sessions()` with no `require_app`; `cli/src/logs.rs:78-110` checks `sessions::session_exists` then captures the pane; `cli/src/wait.rs:1-5` — "the port/service/ready modes poll client-side (250ms) and never touch the app", and the only `require_app` in the file is inside `run_agent` (`:197`) |
| `lpm status` wants lpm open (command-map footnote) | `cli/src/status.rs:14-21` pings the app first and prints "lpm app is not running — no live status." — which is why the footnote groups it with the control verbs, not with `lpm list` |
| `lpm list`'s agent column needs lpm open, its running state does not (command-map row 2 note) | `cli/src/list.rs:42-60` — running state and service counts come from the session list; the agent tally comes from `statussock::list_status` |
| Service list drafted from your repo, then yours to edit — "package.json, Procfile, Gemfile, go.mod, compose and more, read as you add it" (matrix row 2); "a services map drafted from your repo when you add it" (Jobs card 1); "For most repos lpm writes that list itself as you add the folder, reading package.json, a Procfile, a Gemfile or go.mod" (quick answer); FAQ 2 "which it drafts from the repo when you add it"; CTA "Add the folder, check the services it lists" | `desktop/frontend/src-tauri/src/projects_crud.rs:48-67` (`services_for` → `crate::detect::detect_services`), `:93` (add), `:261` (clone); `detect/mod.rs:111-130` (`scan_dir`: Procfile, `node::scan`, `python::scan`, Rails, Laravel, Phoenix, Spring, .NET, Go, Cargo, compose, make/just fallback); `desktop/frontend/src/store/adoptProject.ts:41` ("Found N services" toast). Editable afterwards in the config editor. |
| (row merged into row 2 on 2026-09-23 — it described the action wizard's command suggestions, `useProjectSuggestions.ts:72-74`, which the page no longer claims as the service list) | — |
| Redrafts the whole config with Claude Code, Codex, Gemini CLI or OpenCode (matrix row 3) | `desktop/frontend/src-tauri/src/aigen.rs:33-41` (`check_aicl_is` probes `claude`, `codex`, `gemini`, `opencode` on PATH); `desktop/frontend/src/components/ConfigEditor.tsx:183` ("Generate with AI") |
| One live pane per service (matrix row 5, quick answer, hero) | `desktop/frontend/src-tauri/src/sessions.rs:1-3` ("a project is one session, a service is one pane, and the Nth pane is the Nth service"); `desktop/frontend/src/components/Pane.tsx:50-59` |
| 10,000 lines of scrollback per service pane (matrix row 6, quick answer, FAQ 2, command map) | `desktop/frontend/src/components/Pane.tsx:58` `scrollback: 10000`; `desktop/frontend/src/components/InteractivePane.tsx:543` for terminal tabs; `cli/src/main.rs:113` caps `lpm logs -n` at `1..=10000` |
| "10,000 lines, and no setting to change it" (matrix row 6) | `Pane.tsx:58` is a literal; `grep -rn scrollback desktop/frontend/src/settings-registry.ts desktop/frontend/src/types.ts desktop/frontend/src-tauri/src/config.rs` returns nothing, so no user-facing knob exists. This is the honest half of the hedge: only tmux's number is adjustable |
| Restart one service without touching the others, `lpm service web restart` (matrix row 7, quick answer, command map) | `cli/src/main.rs:150-162` (`Service { service, op }`, "Start, stop, or restart one service via the running app"); `desktop/frontend/src-tauri/src/services.rs:466` `restart_service_at` |
| Services keep running after you quit the app; reopen and it finds them again (matrix row 8, quick answer, FAQ 2) | `desktop/frontend/src-tauri/src/sessiond.rs:1-13` ("One process, outside the app's process group, holding every project's service panes … Quitting lpm has always left your dev servers up, and relaunching it has always found them again") |
| Your own shells: "tabs come back; Claude Code and Codex resume their conversation, shells start fresh" (matrix row 8) | `desktop/frontend/src/hooks/terminals/useSessionRestore.ts:48-52` (restore re-launches each saved tab), `:162` (`t.resumeCmd ?? t.startCmd` — a saved resume command wins); `resumeCmd` is recorded by the `SessionStart` hooks lpm installs for Claude Code and Codex only (`desktop/frontend/src-tauri/src/hooks.rs:381-383` claude, `:639-652` codex, `:851-855` `capture_resume_cmd` → `set_resume`); `persistedTree.ts:231-284` (label/startCmd/resumeCmd persisted, PTY ids are not). A plain shell has no resume command, so it starts fresh. |
| lpm does not restart a crashed service (matrix row 10, `/vs/pm2` card) | No restart-on-exit path exists: `grep -rn "auto_restart\|autoRestart\|respawn" desktop/frontend/src-tauri/src cli/src` returns nothing service-related; a dead pane just prints `desktop/frontend/src/components/InteractivePane.tsx:1005-1010` `[Process exited with code N]` |
| Which agent needs you, shown on its own tab — working, needs you, done or error, from Claude Code and Codex (matrix row 11, When to pick, verdict card 2) | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (installs Claude Code and Codex hooks only); `desktop/frontend/src/agentStatus.ts:12-21` (`AgentState` = needs-you / error / working / done / idle, with those labels) |
| Runs with no tmux installed; lpm does not use tmux; tmux is not a dependency and lpm never installs it (matrix row 12, H1, description, quick answer, FAQ 1, FAQ 2, CTA) | `desktop/frontend/src-tauri/src/sessiond.rs:1-13` (lpm holds the panes itself); `desktop/frontend/src-tauri/src/tmuxmigrate.rs:12` ("this is lpm's last tmux call, not a dependency"), `:18` skips the path entirely when `!which("tmux")`; no install path exists anywhere — that one `which` is the only tmux call in the tree. Stated as a dependency-and-install claim, never as "nothing checks for tmux", which `:18` would make untrue |
| lpm does not use zellij and does not need it installed (FAQ 6) | `grep -rin zellij desktop cli` returns zero hits |
| "lpm imports it once, when the folder is added" (RelatedPages `/vs/overmind` card) | `detect/stacks.rs:21-39` (`Procfile.dev`, else `Procfile`, one service per line, `release` skipped); `projects_crud.rs:93`, `:261` (the only callers) |
| lpm does not restart a service that dies (RelatedPages `/vs/pm2` card) | same as matrix row 10 above |
| Switch projects from a sidebar that remembers them; folders and order persist (matrix row 13, footnote, When to pick, related card) | `desktop/frontend/src/components/Sidebar.tsx:124`, `:197` (`projects`, `groups`, `sidebarOrder`); `desktop/frontend/src-tauri/src/projects_crud.rs:1390` (persists `projectOrder`/`sidebarOrder`); `desktop/frontend/src-tauri/src/remote.rs:4072-4091` (groups.json + settings.json `sidebarOrder`) |
| Attach a remote box from the Mac app and run its services in the same window (matrix row 14, FAQ 5, Jobs card 2) | `desktop/frontend/src-tauri/src/config.rs:596-611` (`SshSettings` host/user/port/key/dir, `is_remote`); `desktop/frontend/src-tauri/src/peerssh.rs:44-53` (a host runs its services in lpm's own session layer; `REQUIRED_TOOLS = ["git"]`) |
| "each port a service declares is forwarded to localhost once it starts listening" (FAQ 5) | `desktop/frontend/src-tauri/src/portforward.rs:720-747` (`observe_port`: declared → `auto_forward`, undeclared → suggestion), `:750-777`; poller started per remote project at `services.rs:217`, `:304`. (The file header at `portforward.rs:1-8` still says "deferred"; the code is live.) |
| "The box needs SSH and bash — no tmux server to install there either. lpm does not detect an SSH project's services, so you list them yourself." (FAQ 5) | `desktop/frontend/src-tauri/src/config.rs:1431` (`bash -ilc` wraps the remote command), `:1461-1475` (`ssh_command_line`); `peerssh.rs:48-53` (tmux no longer required on a host); detection runs only in `create_project` / `run_clone` on a local folder (`projects_crud.rs:93`, `:261`). 2026-09-23: "nothing but git" was wrong — git is not needed to run services, bash is. |
| "three remappable app hotkeys, plus a shortcut per action" / "splits, three remappable app hotkeys and a shortcut you can bind to any action — not a scripting surface" (matrix row 14, Jobs card 3) | `desktop/frontend/src/hotkeys.ts:15-34` (`HOTKEYS` is exactly Activity, Next tab, Previous tab); per-action shortcut: `desktop/frontend/src/components/project-detail/ActionWizard.tsx:411`, `:528` (with clash warnings against the action tree, `:297`); no layout scripting anywhere |
| lpm has splits (Jobs card 3) | `desktop/frontend/src/paneTree.ts:72`, `:332-341` (`kind: "split"`, `splitAtPane`) |
| "a Mac app; a Linux box joins as a remote host" (matrix row 16, When to pick) | `desktop/frontend/src-tauri/tauri.conf.json:31-38` (`targets: ["app", "dmg"]`, `macOS.minimumSystemVersion`); `desktop/frontend/src-tauri/src/peerssh.rs:44-53` (a Linux host runs the same session layer, driven from the Mac) |
| `dependsOn` orders starts and does not wait for readiness; `lpm wait --port 5432` is the gate (Migrate note, Jobs card 1) | `desktop/frontend/src-tauri/src/config.rs:580-581` (`dependsOn`, alias `depends_on`); `:1745-1776` (topological start order, unknown dep is an error); `cli/src/main.rs:164-181` (`Wait` with `--port`, "needs no project") |
| `profiles` start a named subset (Migrate note, Jobs card 1) | `desktop/frontend/src-tauri/src/config.rs:809` (`profiles: BTreeMap<String, Vec<String>>`); `cli/src/main.rs:131-141` (`lpm start --profile`) |
| A `.lpm.yml` in the repo gives the team the same services (Migrate note, When to pick) | `desktop/frontend/src-tauri/src/config.rs:1508-1520` (parses `<root>/.lpm.yml` for `services`/`profiles`), `:1522-1546` (merged under the personal project file) |
| A service is a name and a command; `cmd`, `cwd` are per-service fields (quick answer, Migrate) | `desktop/frontend/src-tauri/src/config.rs:569-582` (`ServiceFull`: `cmd`, `cwd`, `port`, `dependsOn`) |
| `lpm logs web -n 200` prints a service pane's recent output (command map) | `cli/src/main.rs:106-121` (default `-n 200`, capped at 10,000) |
| Free, MIT-licensed, native macOS app (CTA) | `LICENSE:1` (MIT License); `desktop/frontend/src-tauri/tauri.conf.json:31-38` |

### Competitor claims

All trace to the two `ComparisonBasis` sources — the tmux manual and the tmuxinator README.

| Claim | Source |
|---|---|
| tmux keeps 2,000 lines by default and you raise it with `history-limit` (matrix row 6, FAQ 2, command map) | tmux manual, `history-limit` under `set-option` |
| `.tmux.conf` is where keys and layouts are scripted; prefix keys and copy mode are tmux's | tmux manual, `bind-key`, `copy-mode`, `source-file` |
| `respawn-pane` is how one pane is restarted by hand | tmux manual, `respawn-pane` |
| `tmux ls`, `tmux attach -t`, `tmux kill-session -t`, `tmux capture-pane -p -t` | tmux manual, the corresponding commands |
| tmux sessions outlive the terminal that started them, on the box tmux runs on | tmux manual, "the tmux server … clients attach to sessions" |
| You install tmux on each Unix box you use it on (matrix row 16) | tmux manual (it documents a separately installed program, and the page no longer says "already installed" — that was a market claim with no source) |
| tmuxinator defines a project as a YAML `windows:` list and starts it with `tmuxinator start <name>` | tmuxinator README |
| A tmuxinator project is what gives tmux one-command start and a project switcher ("via tmuxinator" cells) | tmuxinator README |

---

## 7. Notes for engineers

- One component per file; `page.tsx` is 298 lines and no file in `_components/` passes 115.
- `id="matrix"` lives on `FeatureMatrix` (via `_components/matrix.tsx`) and `id="migrate"` on the migrate section, which is the hero jump target. Both carry `scroll-mt-20` — `FeatureMatrix` adds it itself when `id` is passed.
- Structured data is exactly `webPageJsonLd` (with `about[]` and `dateModified`), `breadcrumbJsonLd` and `screenRecordingJsonLd("add-project")`. `FAQPage` comes from `components/vs/faq.tsx`; do not also pass the items to `faqJsonLd`. No `HowTo` on the migration section — spec §6.2 excludes it.
- In-body links: `/config` (Migrate note, on "every field"), `/ssh-terminal-for-mac` (FAQ 5), `/terminal-with-project-sidebar` (matrix footnote), plus the `#migrate` anchor on "translating" in the quick answer.
- **RelatedPages card descriptions assert nothing about Overmind, PM2 or zellij.** A card is prose on this page, so anything it claims about a competitor would need a source in this page's `ComparisonBasis` — and the two sources here are tmux's. Both sibling cards were rewritten to carry an lpm claim instead: "lpm will not read that file" (zero `Procfile` hits in `desktop/` and `cli/`) and "lpm does not restart a service that dies" (no restart-on-exit path). The tool names stay in the card titles, where they are navigation, not assertion.
- **Anti-cannibalization, re-checked after every edit in this pass.** 8-gram intersection against all seven siblings and the hub: zero shared runs. `grep -rhoE 'label: "[^"]*"' app/vs --include="*.tsx" | sort | uniq -d` returns only `VerdictCards` labels (`lpm`, `Both`, tool names) and `ComparisonBasis` source labels, none of which is a matrix row label; this page contributes no duplicate row label.
- No emerald anywhere. Every colour is defined for light first and re-stated under `dark:`.
- 390px: both YAML blocks stack (`md:grid-cols-2`), `CodeBlock` scrolls its own `<pre>`, the matrix falls back to cards below `md`, the command map to cards below `sm`, and `VerdictCards`/`Jobs` are one column below `md`.

### Deviations from the spec, and why

1. **`CommandMap` footnote rewritten twice over.** Spec §4.2 and §5.5 give "`lpm list`, `lpm logs` and `lpm status` read the session daemon directly". Two problems: the noun is banned in user-facing copy (§8), and the grouping is wrong — `cli/src/status.rs:14-21` pings the app and prints "lpm app is not running — no live status.", so `lpm status` belongs with the control verbs. The footnote now names the four verbs that want lpm open (`lpm start`, `lpm stop`, `lpm service … restart`, `lpm status`) and the three that do not (`lpm list`, `lpm logs`, `lpm wait --port`, the last verified at `cli/src/wait.rs:1-5` where only `--agent` calls `require_app`). It also no longer shares its opening sentence with `/vs/docker-compose`.
2. **`ComparisonBasis` `lpmNote` re-aimed; the scrollback hedge moved into the table.** Spec §4.2 gives "tmux's 2,000-line default history limit and lpm's 10,000 are both defaults you can change", whose second half is false (`Pane.tsx:58` is a literal, no setting anywhere). The concession now sits in the row where the numbers are — lpm "10,000 lines, and no setting to change it" against tmux "2,000 by default, raise it with `history-limit`" — which is where a reader comparing numbers will look. The `lpmNote` spends its one sentence on the concession count instead, and agrees with the matrix `description`: three of sixteen rows go to tmux.
3. **`VerdictCards` `label` is the tool name, `title` is the brief's heading.** `VerdictCard` requires `label`, `title` and `body`, and spec §4.2 supplies only a heading and a sentence per card. Rather than ship an empty `<h3>`, the page follows the shape every sibling already uses (`/vs/iterm2`, `/vs/pm2`): `label` is the short name being judged (`tmux` / `lpm` / `Both`), `title` is the brief's heading verbatim (`Keep tmux for` / `Swap in lpm for` / `Run both`), `body` is the brief's sentence verbatim. No prose was invented.
4. **Verdict-card bodies lost their backticks.** `VerdictCard.body` is typed `string`, so `.tmux.conf` renders as text rather than `<code>`. Widening it to `ReactNode` is a shared-component change and was left alone. Wording is unchanged.
5. **The `#migrate` link sits on "translating" in the quick answer, not in FAQ 4.** Spec §4.2 says to link the word "translating" inside FAQ 4 while also saying to keep FAQ 4's existing answer verbatim — and that answer contains no such word. The quick answer's "translating a tmuxinator window list" is the only occurrence, so the link went there and FAQ 4 is untouched.
6. **FAQ 1 no longer claims "nothing checks for tmux".** The absolute is untrue: one `which("tmux")` call survives, on the first launch after the move off tmux, purely to clear panes an older build left behind (`tmuxmigrate.rs:18`). That is an implementation detail no page should describe, so the sentence became the dependency-and-install claim the ledger mandates: tmux is not a dependency, and lpm never installs it.
7. **FAQ 2 no longer says "there is no config to write".** Ledger §5.3 killed the zero-config family for this page, and that clause was the one item a skimmer could read as being about lpm rather than about `.tmux.conf`. It now names what you do not write (a `.tmux.conf`, a prefix key, a session name) and admits, in the same breath, the services map you do.
8. **FAQ 6 dropped "a multiplexer with friendlier defaults" and "the layer above".** The first is a judgement about zellij with no source on this page; the second is the "above / on top of" framing ledger §5.3 bans for every competitor. What survives is checkable: lpm does not use zellij either (zero hits in `desktop/` and `cli/`), and it has no opinion on what you attach to.
9. **Three matrix labels and one cell rewritten for uniqueness, cells intact.** "Agent status on the tab (working, needs you, done, error)" was byte-identical to a `/vs/iterm2` row → "Which agent needs you, shown on its own tab", with the four states moved into the lpm cell. "Where it runs" and its `macOS app; Linux boxes as remote hosts` cell are mandated on `/vs/overmind` and `/vs/foreman` too → "Where you install it", "a Mac app; a Linux box joins as a remote host". Row 1's cell "one click, or lpm start while the app is open" was identical on `/vs/docker-compose` → "Start button; lpm start myapp needs lpm running". Every fact is unchanged; only the sentences are this page's own.

### Still open, and not fixable from this directory

- `components/vs/verdict-cards.tsx` types `body` as `string`, so the three `.tmux.conf` mentions in the cards render unstyled. Needs the shared component widened to `ReactNode`.
- `components/vs/comparison-hero.tsx` renders the jump link as bare `inline-flex text-sm` with no vertical padding — about 20px tall, under the 44px tap target part 8 asks for. Shared component.
- `/config` still has no `.lpm.yml` section (spec §7). This page's migrate note tells the reader a committed `.lpm.yml` gives the team the services and links `/config` on "every field" — deliberately not on the word "commit", which is what §5.5 blocks until that section exists.
- The 390px DevTools pass in light and dark, and the `scrollWidth <= innerWidth` assertion, still need a browser. Code-level: every table sits in its own `overflow-x-auto`, both `CodeBlock`s scroll their own `<pre>`, and every card grid is one column below `md`.

## Truth pass, 2026-09-23

Service detection (commit `835443cb`) landed after this page shipped. Changes: matrix rows
2 and 3 merged into one detection row (the old row 3 described action-wizard suggestions),
row 3 is now "Redrafts…" since the agent CLI is optional; the shell-restart row now says
Claude Code and Codex tabs resume; the hotkey row counts per-action shortcuts; FAQ 5 drops
"you forward remote ports" and "nothing but git"; FAQ 2, the quick answer, Jobs card 1, the
video caption, the Overmind RelatedPages card and the CTA stop saying the user writes the
service map. Matrix is **fifteen rows, three to tmux, one to neither** — the `lpmNote` says
"three of its fifteen rows". The add-project clip (June 2026) predates detection; its caption
now says "Adding a project in lpm and editing its services in the built-in editor", which the
footage still shows. Re-recording it with the "Found N services" toast is an open follow-up.
RelatedPages went from five to six (`/best-terminal-for-claude-code-and-codex`).

## Verifier pass — 2026-09-23

- Quick answer: "For most repos lpm writes that list itself…" made an unmeasured claim about "most repos" and implied any Gemfile or package.json is enough. Now: "When the repo has a package.json dev script, a Procfile, a Rails Gemfile or a go.mod, lpm writes that list itself as you add the folder". Source: `detect/node.rs:9`, `:177-193` (needs a `dev`/`start`/`serve` script); `detect/stacks.rs:41-52` (Rails needs `gem 'rails'` **and** `bin/rails`); `:104-124` (go.mod); `:21-39` (Procfile).
- Migrate: "Put the same file at `.lpm.yml`" → "Put the same services in a `.lpm.yml` at the repo root". The example beside it carries `name:`/`root:`, which a repo file does not use (`config.rs:1844-1883` reads only `services` and `profiles` from it).
