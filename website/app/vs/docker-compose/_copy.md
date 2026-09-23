# /vs/docker-compose — Content & Copy Plan

Page route: `/vs/docker-compose`
Target primary keyword: **docker compose alternative for dev** (qualified; the bare "docker desktop alternative" head is container-runtime intent and is deliberately not targeted)
Intent: a developer who runs `docker compose up` every morning on a Mac and suspects the container boundary is costing them more than it buys in the inner loop.

**Angle:** the page is written for someone who knows Compose well enough to catch a strawman. It never claims a code edit forces an image rebuild, never calls Compose "CLI only" (Docker Desktop is how most Mac developers run it), and hands Compose five rows outright. The argument is the split-stack setup, not a migration.

Source of copy: `vs-upgrade-spec.md` §4.5, with the fact-check ledger (§5.3, §5.5, §5.6) as the whitelist — and, where §4.5's copy contradicts the app source or the ledger, **the source wins** (orchestrator ruling R1). Every such rewrite is listed at the end of this file.

---

## 1. Metadata

```ts
title: "Docker Compose Alternative for Local Dev on macOS"
// 49 chars (renders 55 with the layout's " — lpm" suffix); no title.absolute
description:
  "A Docker Compose alternative for the daily loop: run your stack natively on macOS, a pane per service, and keep compose for the containers that earn it."
// 152 chars
keywords: [
  "docker compose alternative for dev",
  "docker compose alternative mac",
  "docker compose slow mac",
  "docker compose vs lpm",
  "run dev stack without docker",
  "local development without docker desktop",
  "native local development macos",
  "docker compose local dev",
  "docker compose profiles alternative",
  "do i need docker desktop",
  "run claude code without docker",
] // 11
alternates.canonical: "/vs/docker-compose"
openGraph.title: TITLE
openGraph.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/docker-compose"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
twitter.title: TITLE
twitter.description: DESCRIPTION
```

`TITLE` and `DESCRIPTION` are declared once at the top of `page.tsx` and reused in
`metadata`, `openGraph`, `twitter` and `webPageJsonLd`.

OG image (`opengraph-image.tsx`):

```ts
headline: ["A Docker Compose alternative", "for fast local dev on macOS."] // = the H1
subline: "Run the stack natively with a pane per service, and keep compose for the containers that earn it."
alt: "Docker Compose alternative for local dev on macOS — lpm vs Compose."
```

The OG subline carries no row count, so it cannot drift from the matrix.

---

## 2. Section outlines

Rendered in the canonical /vs child order from spec part 2:

`ComparisonHero → ComparisonBasis → QuickAnswer → VerdictCards → CommandMap (unique A) → FeatureMatrix → SplitStack (unique B) → SectionVideo → WhenToPick → DemoSection → Faq → RelatedPages → Cta`

No deviation from that order. The two page-unique sections and the page's own matrix
data live in `app/vs/docker-compose/_components/`:

| File | Renders |
|---|---|
| `_components/compose-map.tsx` | slot 5 — the shared `CommandMap` with 14 page-local rows, `id="map"` |
| `_components/compose-matrix.tsx` | slot 6 — the shared `FeatureMatrix` with 16 page-local rows, `id="matrix"` |
| `_components/split-stack.tsx` | slot 7 — the split-stack argument, `id="split"` |

`compose-matrix.tsx` holds the matrix data rather than `page.tsx` so `page.tsx` stays
under the ~400-line limit; the renderer is still the shared `FeatureMatrix` and the
props are exactly the ones part 2 lists.

### Hero
Eyebrow `lpm vs Docker Compose`; gradient H1 `A Docker Compose alternative for fast local dev on macOS.`; subtitle; verdict line `Most people end up splitting it: app code native, stateful infrastructure still in compose.`; `HeroDownload source="vs-compose-hero"`; jump link → `#map`.

### Comparison basis
`reviewed={VS_REVIEWED}` / `reviewedIso={VS_REVIEWED_ISO}`, seven Docker/Compose sources (§6.4), and the note "The file-sharing and rebuild rows were re-checked against Docker's current defaults, not the osxfs era; every lpm cell was re-read in the app source on the same date."

### Quick answer
H2 is the query — `Can you run a dev stack on macOS without Docker Compose?` — and the first paragraph answers it without leading on the brand. Two paragraphs, a `.lpm.yml` `CodeBlock`, then the caption, which links `every field` → `/config`. No row count appears here.

### Verdict cards
Three equal-weight cards: run it natively / drive compose from lpm / keep compose. No highlight, no emerald. Card 3 states the concession count and it matches the matrix description (five).

### Unique A — command map (`id="map"`)
`docker compose` → `lpm`, 14 rows, notes in the third column. The footnote splits the lpm column into control verbs (need the window open) and read verbs (do not), and links the config reference.

### Feature matrix (`id="matrix"`)
16 rows. **Five go to Compose** — three outright (`Containerized service isolation`, `Identical runtimes on every teammate's machine`, `Own network namespace…`) and two on substance (`Declares startup order between services`, where Compose adds a health gate, and `Pins the exact service version the team runs`). The description names all five. The footnote states the isolation position, the worktree caveat, and links `/git-worktree-for-ai-agents`.

### Unique B — split stack (`id="split"`)
Two cards (native in lpm / left in compose) plus a three-step strip, then the page's own clip.

### Video
`SectionVideo clip="run-profile-project"` — profiles as the direct equivalent of compose profiles.

### When to pick
Title `When to keep compose, and when to go native`. Six lpm bullets, seven Compose bullets, both columns specific. No count is stated in prose, so the bullet counts cannot contradict anything.

### FAQ
Six items; the three with inline `<code>` or a link supply `answerText`.

### Related pages
The five links §6.1 assigns this page, plus `/terminal-with-project-sidebar` ("Which repos are up right now, which services each one is running, and one click to switch between them" — `desktop/frontend/src/components/Sidebar.tsx`, `cli/src/list.rs:1-3`) added 2026-09-23 so the grid holds six.

### CTA
`Keep compose where it earns it. Run the rest on the host.` with `HeroDownload source="vs-compose-cta"`.

---

## 3. Hero-specific

- Eyebrow: `lpm vs Docker Compose`
- H1: `A Docker Compose alternative for fast local dev on macOS.`
- Subtitle: "Compose gives every machine the same stack, at the cost of a Linux VM, a shared filesystem and a container to create before anything runs. lpm reads the repo, lists the same processes, and runs them straight on the host, one live pane each."
- Verdict line: "Most people end up splitting it: app code native, stateful infrastructure still in compose."
- Jump label: `See every compose command mapped` → `#map`

---

## 4. Comparison matrix

Columns: **lpm** first, then **Docker Compose**. **Five rows go to Compose**, and the
section description names them: container isolation, identical runtimes and its own
network namespace outright, plus health-gated start order and pinned image versions on
substance.

| Row | lpm | Docker Compose |
|---|---|---|
| Starts a multi-service dev stack in one command | click Start, or `lpm start` with the app open | ✓ |
| Declares startup order between services | `dependsOn` | order + health gate **(to Compose, on substance)** |
| Time from start to services listening | process start | container create + start |
| Rebuild needed when dependencies change | reinstall | image rebuild |
| Reads your source straight off the host filesystem | ✓ | through the VM's file sharing |
| Containerized service isolation | ✗ **(to Compose)** | ✓ |
| Pins the exact service version the team runs | whatever is installed on the host | pinned by image tag **(to Compose, on substance)** |
| Identical runtimes on every teammate's machine | ✗ **(to Compose)** | ✓ |
| Own network namespace, so two projects can both use 5432 | ✗ **(to Compose)** | ✓ |
| A live pane per service, open the whole time you work | ✓ | `docker compose logs`, or a container's Logs tab in Docker Desktop |
| Checks a declared port before start and names what holds it | ask, free, or fail | no pre-start check documented |
| Starts, stops and switches between many repos from one window | ✓ | `docker compose ls` lists them; switching means changing directory |
| Service graph committed to the repo | `.lpm.yml` | `docker-compose.yml` |
| Turns your compose file into something it runs | adds docker compose up as a service when you add the folder | that file is compose's own input |
| Your coding agent gets a tab next to the service panes | Claude Code and Codex report Working, Needs you or Done | the agent runs in a terminal you open yourself |
| Free to use inside a large company | MIT, at any company size | Compose is Apache-2.0; Docker Desktop needs a paid subscription above Docker's size threshold |

Rows deleted in the previous pass and why (ledger §5.3 / §5.5): "Cold start after a code
change — Compose: container rebuild" (false: a bind mount or `compose watch` sync needs
no rebuild); "Native macOS desktop app with shared config — Compose: CLI only" (false:
Docker Desktop groups containers by compose project and streams their logs);
"Prod-parity service versions (Postgres 15.3, Redis 7.2, etc.)" (version numbers date
the page); "Reproducible across team machines and OSes — lpm: partial" (one dash hiding
two truths, now two rows); "macOS file I/O speed for mounted source — Compose: volume
sync overhead" (osxfs-era framing, relabelled); "Visual project switcher — Compose ✗"
(too absolute, relabelled).

Rows changed **this** pass, and the ruling that forced each one:

| Was | Now | Why |
|---|---|---|
| lpm `one click, or lpm start while the app is open` | `click Start, or lpm start with the app open` | R5 — the ledger's sentence was byte-shared with `/vs/tmux`; the hedge is unchanged, the words are not |
| `Per-service live output pane in a native app` — Compose `docker compose logs` | `A live pane per service, open the whole time you work` — Compose `docker compose logs, or a container's Logs tab in Docker Desktop` | R1 + ledger §5.3. §4.5 dropped the ledger's Docker Desktop credit, leaving a "native app" label answered by a CLI command — the exact impression §5.3 corrected. The credit now lands in the cell where the false impression was, sourced to the Docker Desktop containers view |
| `Names the process holding a busy port before start` — Compose `start fails with the port in use` | `Checks a declared port before start and names what holds it` — Compose `no pre-start check documented` | R3 — Compose's docs do not document host-port-in-use behaviour (checked: the `ports` attribute page is silent on it), so the old cell was an unsourced competitor mechanism claim. Rule 5's "not documented" is the honest form. The label was also within one word of `/vs/foreman`'s |
| lpm `suggests a compose action`, Compose ✓ | lpm `suggests a docker compose up -d action`, Compose `that file is compose's own input` | The lpm cell names the actual template, so the detached caveat the FAQ makes is visible in the table. The competitor ✓ was a tick for a requirement rather than a capability, which R2 forbids — the cell now says what the file is to compose |
| `Built for parallel Claude Code and Codex sessions on the host` — Compose ✗ | `Your coding agent gets a tab next to the service panes` — lpm `Claude Code and Codex report Working, Needs you or Done`, Compose `the agent runs in a terminal you open yourself` | R3 — a bare ✗ was a negative claim about Compose that no Docker source can settle, and Rule 5 bans cells that name no mechanism. The new competitor cell describes where the agent runs, which needs no Docker source; the lpm cell names the two CLIs that actually report status |

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Can I use lpm and Docker Compose together?** — "Yes, and this is the common case. lpm can run compose up as one of your services alongside native processes. So you can keep Postgres and Redis in containers for prod parity while running your Rails or Next.js app natively, and watch every pane — container logs included — in the same desktop app. They are not mutually exclusive. Use the attached form — docker compose up, not -d — if you want the container output in an lpm pane; a detached start hands you nothing to watch."
2. **Does lpm replace Docker Compose?** — "For some workflows, yes; for others, no. If you're a solo or small-team dev doing native work on macOS and Compose was mostly a way to launch a process tree, lpm covers that with per-service panes and multi-project switching. If you rely on Compose for prod-parity service versions, cross-OS team reproducibility, or container-first deploy pipelines, keep using Compose. lpm doesn't try to be a container runtime."
3. **Why is Docker Compose slow on a Mac?** — "Your containers run in a Linux VM and your source is shared into it. VirtioFS narrowed that gap a lot and it is the default now, but the shared path still sits between your file watcher and your disk, and every start has to create and start containers rather than just a process. Native processes read the disk directly."
4. **Can lpm read my docker-compose.yml?** — "Partly. When you add the folder, lpm notices docker-compose.yml (or compose.yaml) and lists compose: docker compose up as one service — the attached form, so the container output has a pane — next to the native services it found in the same pass. It does not parse the compose service graph. To split the infrastructure further, edit the list, or press Generate with AI in the config editor for a second draft from Claude Code, Codex, Gemini CLI or OpenCode." (2026-09-23: rewritten — the old answer described the action-wizard suggestion and a hand-declared `db:` service; since commit `835443cb` adding the folder writes the service itself. This answer is also the page's FAQPage JSON-LD.)
5. **Two projects need port 5432 — what happens without containers?** — "One of them loses, and lpm tells you before it starts: it checks each declared port, names the process holding it, and either asks, frees it, or refuses to start depending on that service's portConflict setting. That is detection, not isolation. If you genuinely need both at once, that is a container's job."
6. **Does lpm run on Linux or Windows?** — "There is no Windows build, and no Linux desktop build either — the app itself is macOS only. A Linux machine can still be the host that runs your services and agent sessions, with the Mac window driving all of it." (links `/run-claude-code-on-a-remote-server` on "the host that runs your services and agent sessions")

FAQ 4's button name is the one the app shows (`Generate with AI`), not the spec's
shorthand "Generate". FAQ 6 keeps §4.5's fact and drops §4.5's sentence: the mandated
wording was byte-shared with `/vs/foreman` (R5).

---

## 6. Claims table — every lpm claim, with a source

Paths are relative to the repo root (`desktop/frontend/…`, `cli/…`). Ledger references
are to `vs-upgrade-spec.md` part 5. Every line below was re-read in the repo during this
pass, not carried over.

### 6.1 Matrix rows

| lpm cell | Cited at |
|---|---|
| click Start, or `lpm start` with the app open | `cli/src/start.rs:16` (`control::require_app`), `cli/src/control.rs:12-19` ("lpm app is not running — start it to control projects"), `desktop/frontend/src/components/project-detail/Controls.tsx:134-138` (the header's Start/Stop button), `services.rs:270` (`start_project`) |
| `dependsOn` | `config.rs:580-581` (field, `dependsOn`/`depends_on` alias), `config.rs:1745-1756` (start-order expansion), `services.rs:197` |
| process start | `services.rs:77-85` (a service is a cmd + cwd + env spawned as-is), `config.rs:566-582` (`ServiceFull` has no image or build field) |
| reinstall | `config.rs:566-582` — a service is a command; nothing in the schema builds or caches an image, so a dependency change is whatever the host command does |
| Reads your source straight off the host filesystem ✓ | `services.rs:77-85` (`cwd` passed straight through) |
| Containerized service isolation ✗ | conceded; no container or namespace code exists — `config.rs:566-582` is the whole service schema |
| whatever is installed on the host | `config.rs:566-582` — no version field anywhere in the service schema (ledger §5.5) |
| Identical runtimes on every teammate's machine ✗ | conceded; `src-tauri/tauri.conf.json:31-38` (macOS-only bundle: `targets: ["app","dmg"]`, `macOS` block) plus the absence of any runtime pin |
| Own network namespace ✗ | conceded; `ports.rs:1-12` is conflict **detection** feeding the start dialog, not allocation (ledger §5.3) |
| A live pane per service, open the whole time you work ✓ | `log_streaming.rs:1-14` (a poller captures each pane every 500 ms and emits `log-update`), `desktop/frontend/src/components/PaneView.tsx:382-400` (one header tab per service), `cli/src/logs.rs:1-4` ("pane N == service N") |
| ask, free, or fail | `ports.rs:26-33` (`portConflict` policy `"" \| "ask" \| "free" \| "fail"`), `ports.rs:258-279` (`check_port_conflicts…`), `ports.rs:333` (`resolve_port_conflict`), `config.rs:576-577` |
| Starts, stops and switches between many repos from one window ✓ | `desktop/frontend/src/components/Sidebar.tsx:548-553` (clicking a sidebar row selects that project), `desktop/frontend/src/store/app.ts:887-895` (`selectProject`), `services.rs:270` / `services.rs:322` |
| `.lpm.yml` | `config.rs:1508-1546` (`load_repo_yaml` parses `<root>/.lpm.yml` for `services`/`profiles`, merged under the personal project file) |
| adds docker compose up as a service when you add the folder | `desktop/frontend/src-tauri/src/detect/stacks.rs:169-179` (`docker-compose.yml`, `docker-compose.yaml`, `compose.yml` or `compose.yaml` → `Candidate::new("compose", "docker compose up", …)`), `detect/mod.rs:125` (added after the stack scanners, alongside the native services), `projects_crud.rs:48-67`, `:93`, `:261`. The detached `docker compose up -d` is still offered separately as an action-wizard suggestion (`projectSuggestions.ts:314-319`). |
| FAQ 4: "lpm notices docker-compose.yml (or compose.yaml) and lists compose: docker compose up as one service — the attached form… next to the native services it found in the same pass. It does not parse the compose service graph." | `detect/stacks.rs:169-179` (existence check only — the file's contents are never parsed); `detect/mod.rs:111-127`; redraft: `aigen.rs:33-41`, `ConfigEditor.tsx:183` |
| Claude Code and Codex report Working, Needs you or Done | `hooks.rs:1-9` (installs Claude Code and Codex hooks that pipe `set_status` / `clear_status`; `grep -n "gemini\|opencode" hooks.rs` → nothing), `desktop/frontend/src/agentStatus.ts:12-20` (`AGENT_STATE_LABEL`: Working / Needs you / Done / Problem / Idle) |
| MIT, at any company size (was "MIT, always" — a promise about the future no file can back) | `LICENSE:1` ("MIT License") |

### 6.2 Command map — the `lpm` column

| `lpm` value | Cited at |
|---|---|
| `lpm start` | `cli/src/main.rs:130-141`, `cli/src/start.rs:16-23` |
| `lpm service web start` | `cli/src/main.rs:151-163`, `services.rs:491-503` (`start_service` re-runs the service in its pane) |
| `lpm start --profile full` | `cli/src/main.rs:136-137`, `cli/src/start.rs:19-21`, `config.rs:809` (`profiles: BTreeMap<String, Vec<String>>`) |
| `lpm stop` | `cli/src/main.rs:142-149`, `cli/src/stop.rs:10` |
| `lpm project <name>` + "services, terminals, actions, live status" | `cli/src/main.rs:95-105` (the subcommand's own summary) |
| `lpm list` + "every project, its running state and service counts" | `cli/src/main.rs:88-94`, `cli/src/list.rs:1-3`, `list.rs:39-60` (running state from `sessions::running_sessions()`, per-service counts, agent tally `None` when the socket is unreachable) |
| `lpm logs web` + "prints that pane's recent output" | `cli/src/main.rs:106-121`, `cli/src/logs.rs:1-11` and `:70-110` (scrollback capture, `MAX_LINES = 10_000`) |
| an action, or `lpm run migrate` | `cli/src/main.rs:321-336` (`Run { action }`), `cli/src/run.rs:138-142` (`require_app`, so an action run needs the window too) |
| `dependsOn:` + "cycles are rejected when the config is validated" | `config.rs:1745-1756`, `cli/src/config_cmd.rs:1422` (`validate_dependency_graph`) |
| `lpm wait --port 5432` | `cli/src/main.rs:165-181` (`--port`: "Wait for this TCP port to be listening (needs no project)") |
| `profiles:` | `config.rs:809`, `desktop/frontend/src/components/ProjectDetail.tsx:504-508`, `project-detail/StartMenu.tsx:6-22` |
| `env:` per service | `config.rs:578-579` |
| `port: 3000` + `portConflict: ask \| free \| fail` | `config.rs:574-577`, `ports.rs:1-12`, `ports.rs:26-33` |
| committed `.lpm.yml` "merged underneath each developer's own project file, which also holds what lpm detected when they added the folder" | `config.rs:1861-1883`; `projects_crud.rs:93` |
| Footnote — control verbs need the open window; `lpm list` and `lpm logs` do not; services outlive the window | `cli/src/control.rs:12-19` (`require_app`, called by `start.rs:16`, `stop.rs:10`, `service_cmd.rs:50`) versus `cli/src/list.rs:1-3`/`:39-60` and `cli/src/logs.rs:1-4`/`:70-110`, neither of which calls `require_app`; services surviving the app is `sessiond.rs:1-13` ("Quitting lpm has always left your dev servers up"). **`lpm status` is deliberately absent** — see deviation 2 |

### 6.3 Prose claims

| Claim | Where | Cited at |
|---|---|---|
| "Add the folder and lpm lists the processes it recognises — Rails, Django, a Next.js or Vite dev server, Go, and the compose file itself — then starts them together, each in its own live pane" | QuickAnswer | detection: `detect/stacks.rs:41-52` (Rails), `detect/python.rs:46-63` (Django/FastAPI/Flask), `detect/node.rs:14-29` (Next.js 3000, Vite 5173 …), `detect/stacks.rs:104-124` (Go), `:169-179` (compose); start: `services.rs:77-85`, `log_streaming.rs:1-14`, `PaneView.tsx:382-400` |
| "`dependsOn` for start order and `profiles` for subsets of the stack" | QuickAnswer | `config.rs:580-581`, `config.rs:809` |
| "no pinned image versions, no separate network namespace" | QuickAnswer | conceded — `config.rs:566-582`, `ports.rs:1-12` |
| "Commit it at the repo root and a teammate who clones gets the same graph. lpm still adds what it detects when they add the folder, so they may find a double to delete." | QuickAnswer caption | `config.rs:1861-1883` (`merge_repo_services_profiles`: repo services merged under the personal project file); `projects_crud.rs:93` (detection runs on add with no `.lpm.yml` check, writing the personal file). The sample names its compose service `compose` — the name detection gives it (`detect/stacks.rs:178`) — so that one merges instead of doubling; a detected Rails or Node service under another name still doubles. |
| "the attached form — `docker compose up`, not `-d`" | QuickAnswer caption, FAQ 1, FAQ 4, split stack | `projectSuggestions.ts:314-319` (the suggested action is detached), `services.rs:77-85` (a service's own output is what a pane shows) — ledger §5.5 mandates this sentence |
| "No image, no volume, no container to create" | Verdict card 1 | `config.rs:566-582` — nothing container-shaped exists in the schema |
| "Adding the folder already makes docker compose up one lpm service, its output in a pane beside your native ones" / "lpm lists the compose file as one service in the attached form" | Verdict card 2, split stack | `detect/stacks.rs:169-179`; | `config.rs:559-565` (a service can be a bare command string), `log_streaming.rs:1-14` |
| "Five rows in the table go to Compose, and the description names them." | Verdict card 3 | counted against `_components/compose-matrix.tsx` this pass: three flat `false` lpm cells plus two substance rows, both named in the matrix `description` (R2) |
| "Each is one service with a pane of its own; the watcher inside it picks up your edits, and if the process dies its last output stays in the pane until you start it again." | Split stack, native card | `PaneView.tsx:382-400`; `sessions.rs:171-190` (a service is a command line typed into a login shell, so its last output stays and no exit code is printed — `[Process exited with code N]` is interactive tabs only, `InteractivePane.tsx:1019-1024`). 2026-09-23: "keeps the exit code on screen" was wrong for service panes. |
| "Add the folder. lpm reads the manifests, lists the native services — with the framework's default port where there is one — and adds docker compose up as one more. Generate with AI in the config editor is there if you want a different first pass." | Split stack, step 01 | `projects_crud.rs:48-67`, `:93`; `detect/mod.rs:111-130`; default ports: `detect/stacks.rs:51` (Rails 3000), `detect/python.rs:50` (Django 8000), `detect/node.rs:14-29`; compose: `detect/stacks.rs:169-179`; redraft: `ConfigEditor.tsx:183`, `aigen.rs:33-41` |
| "bring the project up with one click — or `lpm start`, with the window open" | Split stack, step 03 | same as the matrix row-1 cell: `Controls.tsx:134-138`, `cli/src/start.rs:16`, `control.rs:12-19` |
| "named subsets you switch between from the header" | SectionVideo description | `config.rs:809`, `ProjectDetail.tsx:504-508` (`handlePickProfile` starts the picked profile), `project-detail/StartMenu.tsx:6-22` (the header menu lists profiles) |
| "the file share into the VM still sits between your watcher and your disk" | WhenToPick, lpm bullet 1 | competitor claim — Docker Desktop's VM and file-sharing settings (§6.4) |
| "your Rails server, Next.js frontend, worker, and a Redis process each in their own live pane" | WhenToPick, lpm bullet 2 | `services.rs:77-85`, `log_streaming.rs:1-14`, `PaneView.tsx:382-400` |
| "would rather see which stack is up than remember which compose file you left running where" | WhenToPick, lpm bullet 3 | `Sidebar.tsx:548-553`, `store/app.ts:887-895`, `list.rs:39-60` (running state per project) |
| "Claude Code, Codex, Gemini CLI, or OpenCode … their output beside your services — with Claude Code and Codex also reporting Working, Needs you or Done on the tab" | WhenToPick, lpm bullet 4 | `aigen.rs:30-49` (all four recognised and launchable), `hooks.rs:1-9` (status hooks for Claude Code and Codex only), `agentStatus.ts:12-20` (the state labels). The four/two split is now **in** the sentence — see deviation 9 |
| "lpm can drive it as one service while you move the rest native" | WhenToPick, lpm bullet 5 | `config.rs:559-565`, `projectSuggestions.ts:314-319` |
| "it checks each declared port, names the process holding it, and either asks, frees it, or refuses to start" | FAQ 5 | `ports.rs:1-12`, `ports.rs:26-33`, `ports.rs:258-279`, `portsprobe.rs` (`lookup_holders`) |
| "There is no Windows build, and no Linux desktop build either — the app itself is macOS only. A Linux machine can still be the host that runs your services and agent sessions" | FAQ 6, related pages | `src-tauri/tauri.conf.json:31-38` (`app` / `dmg` targets and a `macOS` block, nothing else), `config.rs:597-611` (SSH project settings — the remote is driven from the Mac) |
| "copy it and the copy edits its own files … Nothing else is namespaced … A linked worktree starts from the tracked files only: an ignored `.env` is not in it, and Node packages are installed only if you turn on Install dependencies." | Matrix footnote | `projects_crud.rs:851-854` + `detect/node.rs:123-127` (install only when `package.json` exists; npm/yarn/pnpm/bun at `node.rs:77-84`); | `projects_crud.rs:509-522` (`git worktree add -b <branch> <path> HEAD` — tracked files at HEAD, nothing ignored), `projects_crud.rs:754` (`cp_clone` for the standalone-copy route), `projects_crud.rs:836-839` (deps installed after a worktree only when asked), `BulkDuplicateDialog.tsx:925-937` (the switch is titled "Install dependencies" in worktree mode), `ports.rs:1-12` + `portsprobe.rs` (the port check and the named holder) |
| "Add the folder, get a live pane per service, and docker compose up as one of those services when a container is the right answer." / "Free, open source, native macOS app." | CTA | `projects_crud.rs:93`, `detect/stacks.rs:169-179`, `log_streaming.rs:1-14`, `LICENSE:1`, `tauri.conf.json:31-38` |
| "lpm reads the repo, lists the same processes, and runs them straight on the host, one live pane each" | Hero subtitle (lpm half; the Compose half is §6.4) | `projects_crud.rs:48-67`, `:93`; `detect/mod.rs:73-109`; `services.rs:77-85`, `log_streaming.rs:1-14` |
| "Most of your stack runs fine as a host process, and you want to see each one." | WhenToPick, lpm headline | `services.rs:77-85`, `log_streaming.rs:1-14`, `PaneView.tsx:382-400` |
| "What `port`, `portConflict`, `env`, `dependsOn` and `profiles` each do inside a project file" / "Where Claude Code and Codex sit once the services are up, and what their tabs report while they work" / "Put the services and the agents on a Linux machine and drive all of it from the Mac app" | RelatedPages card descriptions | `config.rs:574-582`, `config.rs:809`; `hooks.rs:1-9` + `agentStatus.ts:12-20`; `config.rs:597-611` |

No claim about notifications, terminal scrollback limits or restart-on-crash appears on this page (stack detection is now claimed and cited above), so none is cited: the
scrollback number belongs to `/vs/overmind` and `/vs/pm2`, and lpm's lack of
auto-restart is stated (not claimed away) in the split-stack card above.

### 6.4 Competitor claims → sources

Seven sources, each fetched and read on the review date. Every Compose or Docker Desktop
claim on the page traces to one of them:

| Claim | Source |
|---|---|
| `docker compose up`, `up web`, `down`, `ps`, `ls`, `logs -f`, `run --rm`, `--profile`, and "create and start" as what a start does | the Compose CLI reference — `docs.docker.com/reference/cli/docker/compose/` |
| `depends_on` with `condition: service_healthy` (the "order + health gate" cell), `healthcheck`, `profiles:`, `environment:`, `ports:` host publishing, pinned image tags | the Compose file services reference — `docs.docker.com/reference/compose-file/services/` |
| containers run in a Linux VM ("Choose the VMM for creating and managing the Docker Desktop Linux VM"); source reaches them through file sharing; VirtioFS is the current default | Docker Desktop's VM and file-sharing settings — `…/settings-and-maintenance/settings/#file-sharing` |
| a code edit needs no rebuild — `sync`, `rebuild` and `sync+restart` are separate watch actions (why the old "container rebuild" row was deleted, and why the surviving rebuild row is scoped to dependency changes) | Compose file watch — `docs.docker.com/compose/how-tos/file-watch/` |
| Docker Desktop shows a container's logs ("Select **Logs** to view output from the container in real time") and inspects Compose apps | the Docker Desktop containers view — `docs.docker.com/desktop/use-desktop/container/` |
| Docker Desktop needs a paid subscription above Docker's size threshold ("Small businesses (fewer than 250 employees AND less than $10 million in annual revenue)") | Docker Desktop pricing — `…/subscription-billing/desktop-license/` |
| Compose is Apache-2.0 ("Apache License / Version 2.0, January 2004") | the Compose licence — `github.com/docker/compose/blob/main/LICENSE` |

Two competitor cells deliberately assert **no** Compose mechanism, because no source
supports one: `no pre-start check documented` (the `ports` reference is silent on
host-port conflicts) and `the agent runs in a terminal you open yourself` (a statement
about the reader's setup, not about Compose). Both replaced claims that had no source.

---

## Notes for engineers

- Components: `_components/compose-map.tsx` (`ComposeMap`), `_components/compose-matrix.tsx` (`ComposeMatrix`), `_components/split-stack.tsx` (`SplitStack`). Named exports, one component per file.
- Path constant: `vsPath("docker-compose")`. Canonical `https://lpm.cx/vs/docker-compose`.
- Analytics: `downloadSource="vs-compose-hero"` and `"vs-compose-cta"` — the slug in `DownloadSource` is `compose`, not `docker-compose`.
- Structured data is exactly `webPageJsonLd` (with `about[]` and `dateModified`), `breadcrumbJsonLd`, `screenRecordingJsonLd("run-profile-project")`. No `mentions` SoftwareApplication, no HowTo, no Review/Product. `FAQPage` comes from the `Faq` component.
- In-body links: `/config` (QuickAnswer caption, command-map footnote), `/git-worktree-for-ai-agents` (matrix footnote, immediately under the isolation rows), `/run-claude-code-on-a-remote-server` (FAQ 6). §4.5 asked for `/config` on the `profiles:` map row too; `CommandMapRow` takes plain strings, so the link sits on the footnote sentence that lists `profiles` — the nearest sentence that leads there (R7).
- Both matrix `overflow-x-auto` wrappers come from the shared components; the command map's monospace strings each sit in their own scroll box below `sm`.
- Checks run this pass: `npx eslint app/vs/docker-compose` (clean); 8-gram prose intersection against the other seven `/vs` directories and the hub (**0 hits**); `grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` (only `VerdictCards` side tags and `ComparisonBasis` source labels, which R4 exempts — no matrix row label collides).

### Deviations from the spec, and why

1. **`VerdictCard` needs three strings; §4.5 gives two per card.** Implemented as `label` = a short side tag (`lpm` / `Both` / `Docker Compose`), `title` = the brief's heading, `body` = the brief's sentence — matching `/vs/iterm2`, `/vs/cmux`, `/vs/foreman` and `/vs/overmind`. `/vs/tmux` instead passes `title: ""`, which renders an empty `<h3>`; unifying that means `title?: string` in `components/vs/verdict-cards.tsx`, which is outside this page's file list.
2. **The command-map footnote drops `lpm status` and re-words the rest.** §5.5 lists `lpm status` among the verbs that work from a cold shell; that is false — `cli/src/status.rs:14-21` pings the app first and prints "lpm app is not running — no live status." with an empty payload. `lpm list` (`list.rs:39-60`) and `lpm logs` (`logs.rs:70-110`) genuinely do work with the window shut, and neither calls `require_app`. The footnote also no longer shares §5.5's sentence with `/vs/tmux` and `/vs/pm2` (R5), and never says "session daemon" (banned implementation noun): it says services you already started keep running when you close the window, which is what `sessiond.rs:1-13` describes.
3. **Anti-cannibalization Rule 2 is now clean.** The seven 8-word runs the previous pass could not remove are gone, each rewritten in Compose's vocabulary with the fact intact (R5): the map footnote (was `/vs/tmux`), matrix row 1's hedge (was `/vs/tmux`), the matrix footnote's checkout/ports sentence (was `/vs/cmux`), verdict card 3 (was the hub's Compose router card), FAQ 6's platform sentence (was `/vs/foreman`), split-stack step 01 (was `/vs/cmux`), and the port row's label (was within a word of `/vs/foreman`'s). A fresh 8-gram intersection against all seven siblings and the hub returns nothing. Two 7-word runs remain by design: the mandated CLI list "Claude Code, Codex, Gemini CLI or OpenCode" and the RelatedPages card title "A terminal for Claude Code and Codex", which is the destination page's own name.
4. **"restarts on its own" is gone.** §4.5's split-stack card could be read as lpm restarting a dead service. It does not: there is no auto-restart path, a dead pane prints `[Process exited with code N]` (`InteractivePane.tsx:1005-1010`), and coming back means toggling the service on (`services.rs:448-461`) or `lpm service <name> restart`. The card now says the watcher inside the process picks up edits and the pane holds the exit code until you start it again (R1, R6).
5. **WhenToPick's Compose column keeps seven bullets, not six.** §4.5 says "keep all four and add" two; the page had five true, sourced Compose strengths, and dropping one to hit a number would weaken the concession. No prose states a bullet count, so nothing contradicts.
6. **The hero subtitle, the CTA and the WhenToPick title are not given in §4.5.** All three are written from cleared facts only (§6.3) and in Compose's vocabulary. The section title was changed from the cluster-wide "When each one is the right tool" to "When to keep compose, and when to go native" to cut a shared 7-word heading.
7. **`/config` still documents only `~/.lpm/projects/myapp.yml`.** This page's `.lpm.yml` `CodeBlock` and its "Service graph committed to the repo" row are true (`config.rs:1508-1546`), but a reader who follows the caption link will not find the repo file documented. §5.5 calls this a blocking dependency and part 7 tracks it; the link text is "every field", so it points at fields rather than at file locations. `/config` is not in this page's file list.
8. **`ComparisonBasis` sources went from four to seven.** §4.5 fixed the list at four, but R3 requires a source for every competitor mechanism claim: the Apache-2.0 half of the licence row had none, the new Docker Desktop log-view credit needed one, and the generic `docs.docker.com/compose/` root was replaced by the CLI reference and the file-services reference, which actually document the commands and attributes the page names. All seven were fetched and read on the review date; `app/vs/page.tsx:159` still links the pricing page's old `subscription/desktop-license/` URL, which 301s to the one used here.
9. **The four-CLI sentence now carries its own hedge.** §4.5 and ledger §5.4 mandate "…and want their status and output next to your services", but status comes from hooks lpm installs for Claude Code and Codex only (`hooks.rs:1-9`), while all four CLIs are launchable (`aigen.rs:30-49`). The bullet keeps the mandated list and splits the promise: output for all four, Working / Needs you / Done for the two that report (R1, R6).
10. **Page-unique word share.** `find app/vs/docker-compose -name '*.tsx' | xargs wc -w` = 3594 against 1948 for the shared `/vs` renderers this page actually mounts (64.9%), or 3895 counting all of `components/vs` plus `DemoSection`, `HeroDownload`, `GithubLink`, `SectionHeader`, `CodeBlock` and `RelatedPages` (48.0%). Rule 1 passes on both crude measures now, and on rendered prose.
