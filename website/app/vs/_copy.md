# /vs — Content & Copy Plan

Page route: `/vs`
Target primary keyword: **cross-tool "how should I run a local dev stack on a Mac" intent** (no single-tool "X alternative" term — each of those belongs to the child that owns it)
Intent: a Mac developer with four processes in one repo who is choosing between a terminal emulator, a multiplexer, a Procfile runner, a container stack and a supervisor.

**Angle:** the hub is the only page on the site — and, as far as we can find, on the internet — that puts all seven tools plus lpm in one table. It bids on the cross-tool query no child can hold, routes the reader to the child that matches the tool they already run, and states the three rows that go against lpm on the page itself.

Source of truth: `vs-upgrade-spec.md` §4.1 (copy), §5 (fact-check ledger), §6 (SEO), §8 (acceptance) — **as amended by the orchestrator's rulings R1–R8**, which outrank §4.1's copy wherever the app source, the ledger or a count disagrees with it. Every deviation from §4.1 below is one of those rulings and is labelled with it.

---

## 1. Metadata

```ts
title: "tmux, iTerm2 & PM2 Alternatives for Mac Dev Stacks"
// 50 chars; renders 56 with the layout's " — lpm" suffix
description:
  "tmux, iTerm2, cmux, Docker Compose, Foreman, Overmind, PM2 — compared for Mac local dev and for running Claude Code and Codex beside your services."
// 147 chars
keywords: [
  "lpm alternatives",
  "tmux vs docker compose local dev",
  "foreman vs overmind",
  "pm2 vs docker compose development",
  "best way to run local dev stack mac",
  "run multiple services locally mac",
  "local dev stack manager mac",
  "procfile runner alternative",
  "terminal multiplexer vs procfile runner",
  "run claude code and codex beside dev servers",
]
// 10 entries. Every single-tool "X alternative" term the old hub carried is gone (§6.4 fix 1).
alternates.canonical: "/vs"
openGraph.title / twitter.title: TITLE (one const, four uses)
openGraph.description / twitter.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
```

`opengraph-image.tsx`:

```
headline: ["tmux, iTerm2, Docker Compose:", "seven ways to run a Mac dev stack."]   // = H1
subline:  "Seven tools and lpm in one table, an honest verdict on each, and the three rows that go against lpm."
alt:      "tmux, iTerm2 and PM2 alternatives for Mac dev stacks — seven tools compared."   // = title
```

The subline was `"One table across seven tools, …"`. Changed under **R2**: the table has eight columns (seven tools *and* lpm), and the hero now says the same thing the same way, so no surface claims a different arithmetic than the one the reader can count.

---

## 2. Section outlines

Rendered in the canonical **hub** order from spec §2 ("Canonical /vs hub order"), which is deliberately not the child order:

`Hero → QuickAnswer → ToolMatrix (id="matrix") → ComparisonBasis → Router → SectionVideo → Faq → RelatedPages → Cta`

Written reasons for the three ways the hub departs from the child template:

1. **No `ComparisonHero`.** Its "← All comparisons" backlink would point at this page. The hub ships its own `_components/hero.tsx` with the same eyebrow pill, gradient H1, `HeroDownload` and jump-anchor treatment, minus the backlink.
2. **No `DemoSection`.** All seven children render it; rendering it here would make the hub indistinguishable from them (P3/P4 in spec §1). The hub's own footage is the `SectionVideo` clip instead.
3. **No `VerdictCards`.** §4.1 supplies no verdict-card copy and the canonical hub order does not list the component; the Router section is the hub's per-tool verdict surface (three labelled lines per tool). See "Notes for engineers".

| # | Section | File |
|---|---|---|
| 1 | Hero | `app/vs/_components/hero.tsx` |
| 2 | Quick answer | `components/vs/quick-answer.tsx` + copy in `page.tsx` |
| 3 | Eight-column matrix | `app/vs/_components/tool-matrix.tsx` + `tool-matrix-data.ts` |
| 4 | Comparison basis | `components/vs/comparison-basis.tsx` |
| 5 | Router | `app/vs/_components/router.tsx` |
| 6 | Video | `components/vs/section-video.tsx` |
| 7 | FAQ | `components/vs/faq.tsx` |
| 8 | Related pages | `components/related-pages.tsx` |
| 9 | CTA | `components/vs/cta.tsx` |

### Hero
- Eyebrow `Mac dev stacks · seven tools`, H1, subtitle, `HeroDownload source="vs-hub-hero"`, jump anchor `#matrix`, GitHub link `source="vs-hero"`.

### Quick answer
- H2 phrased as the query, three paragraphs (the first answers it without naming lpm), then the three-shapes `CodeBlock` and its caption with the one in-body `/config` link.

### Eight-column matrix
- `id="matrix"`, `scroll-mt-20`, thirteen rows × eight tools, lpm column highlighted, footnote in three blocks: how to read the lpm column, macOS-only + Linux host (`/run-claude-code-on-a-remote-server`), and the duplicate/ports/worktree caveat (`/git-worktree-for-ai-agents`).

### Comparison basis
- `reviewed={VS_REVIEWED}`, `reviewedIso={VS_REVIEWED_ISO}`, fourteen competitor sources, `lpmNote` naming the three rows that go against lpm.

### Router
- One H2, six uppercase prompts, seven cards — one per child page (`lpm vs {name}` as `<h3>`), three labelled lines each: What it is / Switch if / Stay if. In-body links: `/best-terminal-for-mac`, `/ssh-terminal-for-mac`, `/config`, `/best-terminal-for-claude-code-and-codex`.

### Video
- `clip="start-project"` (shared only with `/vs/overmind`, different label per spec Rule 4).

### FAQ
- 6 items. Items 2, 4 and 6 are JSX (commands in `<code>`, two outbound citation links) and each carries the verbatim plain-text `answerText`.

### Related pages
- Six cards (the hub's allocation in §6.1), which keeps the grid on the `lg:grid-cols-3` path.

### CTA
- Spec title, the verified description shipped unchanged, `downloadSource="vs-hub-cta"`.

---

## 3. Hero-specific

- Eyebrow: `Mac dev stacks · seven tools`
- H1: `tmux, iTerm2, Docker Compose: seven ways to run a Mac dev stack.`
- Subtitle: "Four processes, one repo, twenty times a day. Terminal tabs, a multiplexer, a Procfile runner, a container stack, a production supervisor — each solves part of it. Here is the whole field in one table, an honest verdict on each, and where lpm fits."
- Primary CTA: `HeroDownload` (`vs-hub-hero`)
- Secondary link: "Jump to the table: seven tools and lpm" → `#matrix`

Two **R7 / R2** changes here. The link read "Jump to the eight-tool table", which fought the eyebrow's "seven tools" in the same block; it now names both halves of the eight columns. And the link (plus the GitHub link under it) was a ~20px inline target: both now carry `min-h-11 px-3 py-2`, i.e. ≥44px, with the surrounding `mt-*` clamps reduced so the hero's vertical rhythm is unchanged. This is a fix inside the hub's own hero file, not in `components/vs/comparison-hero.tsx`.

---

## 4. Comparison matrix

Columns, lpm first and highlighted: **lpm · iTerm2 · tmux · cmux · Docker Compose · Foreman · Overmind · PM2**

SectionHeader: eyebrow `Every tool, side by side`, title `The capabilities that actually differ`, description "Thirteen rows, each one a place where the eight columns genuinely differ. Three of them go against lpm."

| Capability | lpm | iTerm2 | tmux | cmux | Docker Compose | Foreman | Overmind | PM2 |
|---|---|---|---|---|---|---|---|---|
| Has a desktop app, not just a command line | ✓ | ✓ | ✗ | ✓ | Docker Desktop | ✗ | ✗ | ✗ |
| One live pane per process, no scripting | ✓ | you split them | you script it | you script it | interleaved | interleaved | one tmux window each | pm2 logs |
| Many repos as switchable projects | ✓ | profiles | sessions | workspaces | ✗ | ✗ | ✗ | ✗ |
| Restart one process without the rest | ✓ | ✗ | respawn by hand | ✗ | ✓ | ✗ | ✓ | ✓ |
| **Brings a crashed process back on its own** | **✗** | ✗ | ✗ | ✗ | **with a restart policy** | ✗ | **start -r** | **✓** |
| Drafts the service list from your repo | your own agent CLI | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Duplicates the project for a second agent | worktree or full copy, 1–50 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Says whether an agent is working, needs you or done | Claude Code, Codex | not documented | ✗ | when it needs you | ✗ | ✗ | ✗ | ✗ |
| Runs services natively, no containers | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Services survive quitting the app | ✓ | only via tmux | ✓ | reopens panes | detached | ✗ | ✓ | ✓ |
| **Starts from a Procfile you already have** | **✗** | ✗ | ✗ | ✗ | ✗ | **✓** | **✓** | ✗ |
| **Available outside macOS** | **macOS only** | ✗ | Linux, \*BSD | ✗ | Linux, Windows | Linux | Linux, \*BSD | Linux, Windows |
| Free and open source | MIT | GPLv2 | ✓ | GPL-3.0-or-later | Apache-2.0 | ✓ | MIT | ✓ |

**Rows conceded to a competitor: exactly three** — the crash row (Compose with a policy, Overmind with `-r`, PM2 outright), the Procfile row (Foreman and Overmind), and the platform row (five tools). Every other row is a win or a tie; the qualified drafting cell is a row lpm wins, not a row it loses, so it is *not* counted. The three surfaces that repeat the number — the matrix `description`, the OG subline and the `ComparisonBasis` `lpmNote` — all say three, and now agree with the table (**R2**).

### Deviations from §4.1's row list, and why

- **Row 1 relabelled** "Desktop app, not a CLI" → **"Has a desktop app, not just a command line"** (**R1**). lpm ships a CLI (`cli/`, bundled as `externalBin` at `tauri.conf.json:34`), so the old label made lpm's own ✓ assert something false about lpm.
- **Row 2, Overmind cell** `✓` → **"one tmux window each"** (**R2**). A bare ✓ on a row whose label ends "no scripting" hid the install Overmind's README opens with; the cell now names the mechanism that is also the requirement.
- **New row, "Brings a crashed process back on its own"** (**R1**, ledger §5.6: "A crashed service leaves the rest running, and lpm does not restart it… Concede the second half every time you claim the first"). The table claims the restart-one-service row four rows above it, so the ledger requires this concession beside it. lpm ✗ is verified by grep; every competitor cell is sourced (see the claims table).
- **Row 6 lpm cell** "your agent CLI" → **"your own agent CLI"**: the generator shells out to a CLI *you* installed (`aigen.rs:1-6`, `:32-40`), which is the whole reason the cell is not a ✓.
- **Row 8 relabelled** "Reports Claude Code / Codex status per tab" → **"Says whether an agent is working, needs you or done"**, with the iTerm2 cell `"Claude Code only"` → **"not documented"** (**R1/R3**). iTerm2 3.7's release notes confirm a Claude Code integration and say nothing about per-session status, so the old cell asserted a competitor capability no source supports. The integration itself is stated in FAQ 4, where it is cited.
- **Row 11 relabelled** "Reads an existing Procfile as-is" → **"Starts from a Procfile you already have"** (**R4**): the old string was byte-identical to `app/vs/foreman/_components/procfile-matrix.tsx`.
- **Row 12 relabelled** "Runs on Linux or Windows" → **"Available outside macOS"**, with per-tool platforms in the cells (**R4**, same collision with `/vs/foreman`). The cells now carry the detail the old bare ✓s hid, and they match FAQ 3 exactly: Linux for tmux, Compose, Foreman, Overmind and PM2; Windows only for Compose and PM2; \*BSD for tmux and Overmind.

### Engineer notes
- Data lives in `tool-matrix-data.ts` so the renderer stays under 130 lines.
- Eight columns cannot become eight mobile cards without 104 label/value lines, so the single table sits in `overflow-x-auto` with the capability column `sticky left-0` on a solid `bg-background`. The page body never scrolls at 390px; the table scrolls inside its own box (`min-w-[60rem]` is on the `<table>`, and the only other `min-w` is `12rem` on the label column).
- The sticky column's separator is `shadow-[1px_0_0_0_var(--hairline)]`, not `border-r`. Tailwind preflight sets `border-collapse: collapse`, and Chrome does not repaint a sticky cell's collapsed border while the table scrolls; the shadow does repaint. `--hairline` is defined in both themes (`app/globals.css:12` light, `:24` dark), so no colour is defined only inside a `dark:` variant.
- The footnote `<p>` carries `[&_code]:font-mono [&_code]:text-xs` because the footnote now names three commands and one filename.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **What is the difference between a multiplexer, a Procfile runner, and a container stack?** — "A multiplexer (tmux) gives you panes and keeps them alive; you decide what runs in them. A Procfile runner (Foreman, Overmind) starts a fixed list of named processes with one command. A container stack (Docker Compose) also builds the environment those processes run in. Three different layers, and it is normal to want two of them."
2. **Foreman or Overmind — which Procfile runner should I use?** — "Overmind, when you need to get at one process on its own — reattach to it, or bounce it — while the others carry on. Each Procfile line gets its own tmux window, which is also why tmux has to be on the machine first, and `-m web=2` runs a line twice. Foreman, when one stream in one terminal is enough, when you would rather not add tmux to your setup, and when `foreman export` is part of how you deploy."
3. **Which of these run on Linux or Windows?** — "tmux, Docker Compose, Foreman and PM2 all run on Linux, and Compose and PM2 run on Windows too; Overmind covers Linux, \*BSD and macOS. iTerm2, cmux and lpm are Mac apps. lpm can drive a Linux machine as a headless host from the Mac, but the app itself is macOS only."
4. **Which of them will launch Claude Code or Codex for me?** — "cmux and lpm, and as of September 2026 iTerm2 has a Claude Code integration too. cmux is built around agent sessions in the terminal. lpm looks for the agent CLIs you already have installed, opens each one in its own tab alongside the running services, marks that tab working, needs-you or done as the agent goes, and can copy the whole project so two agents never edit the same files. The rest are process runners with no opinion about agents."
5. **Can I run more than one of these at once?** — "Usually yes, and most people do. Keep iTerm2 or tmux for SSH and ad-hoc shells, keep PM2 for anything that has to stay alive, keep compose for the services that need a container — and let one tool own starting and stopping the project. Nothing here holds your processes hostage."
6. **Which of them are free and open source?** — "tmux, Foreman, Overmind, PM2 and Docker Compose are all open source and free; iTerm2 is free under GPLv2 and lpm is free under MIT. cmux ships under GPL-3.0-or-later, and an organisation that cannot live with that can buy commercial terms instead, with early-access features behind a subscription. Docker Desktop — how most Mac developers get Compose — is the one that can cost money: past Docker's size and revenue thresholds a company needs a paid subscription."

Items 2, 4 and 6 were rewritten from §4.1's wording under **R5** (each shared an ≥8-word run with a sibling: FAQ 2 with `/vs/foreman`, FAQ 4's agent-status clause with the cluster's agent-status sentence, FAQ 6's cmux licence clause with `/vs/cmux`). Every fact in all three survives the rewrite; FAQ 2 gains the tmux-install requirement its own source states, and FAQ 6 drops "above Docker's company-size threshold" for the licence page's actual two-part test, still without numbers.

The `Faq` component emits `FAQPage` itself; `faqJsonLd` is not called on this page.

---

## 6. Claims table

Every lpm cell and every lpm sentence on the page, with the file:line it was checked against. Paths are relative to the repo root (`desktop/` and `cli/`). Re-verified by grep on 2026-09-10 for this pass.

| Claim as rendered | Where on the page | Checked against |
|---|---|---|
| Has a desktop app, not just a command line — lpm ✓ | matrix row 1 | `desktop/frontend/src-tauri/tauri.conf.json:31-38` (bundle `targets: ["app","dmg"]`, `macOS` block) plus `:34` (`externalBin: ["binaries/lpm-cli"]` — the app ships the CLI, which is why the label no longer says "not a CLI") |
| One live pane per process, no scripting — lpm ✓ | matrix row 2 | `desktop/frontend/src-tauri/src/sessions.rs:1-3` ("a project is one session, a service is one pane, and the Nth pane is the Nth service") |
| Many repos as switchable projects — lpm ✓ | matrix row 3 | `desktop/frontend/src-tauri/src/config.rs:2130` (`list_projects`); `desktop/frontend/src-tauri/src/commands_real.rs:186` |
| Restart one process without the rest — lpm ✓ | matrix row 4 | `desktop/frontend/src-tauri/src/services.rs:466` (`restart_service_at`), `:503`, `:508` (`restart_service_by_name`), `:527`; `cli/src/main.rs:151` (`Service { op }`) |
| Brings a crashed process back on its own — lpm ✗ | matrix row 5 | `grep -rniE "auto_restart\|autoRestart\|restart_on\|keep_alive\|keepAlive\|respawn" desktop/frontend/src desktop/frontend/src-tauri/src cli/src` → no service-supervision hit (the matches are SSH-transport respawn, a job guard, and log-streaming comments). A dead pane writes `[Process exited with code N]` into its own buffer: `desktop/frontend/src/components/InteractivePane.tsx:1005`, `:1010`. Nothing restarts it. |
| Drafts the service list from your repo — lpm "your own agent CLI" | matrix row 6 | `desktop/frontend/src-tauri/src/aigen.rs:1-6` (shells out to the user's own CLI), `:32-40` (`claude`/`codex`/`gemini`/`opencode` looked up on PATH via `sys::which`), `:1028` (reads package.json, Gemfile, compose files, Makefile to detect services). Deliberately **not** ✓: a new project is created with a placeholder command, `projects_crud.rs:41` |
| Duplicates the project for a second agent — lpm "worktree or full copy, 1–50" | matrix row 7 | `desktop/frontend/src-tauri/src/projects_crud.rs:509-519` (`create_linked_worktree`; `git worktree add -b` at `:517`), `:876` (`duplicate_project`), `:895` (`duplicate_worktree_project`); `desktop/frontend/src/components/BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`); `cli/src/main.rs:239` |
| Says whether an agent is working, needs you or done — lpm "Claude Code, Codex" | matrix row 8 | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (installs Claude Code and Codex hooks **only**); `desktop/frontend/src/agentStatus.ts:12` (`AgentState = needs-you \| error \| working \| done \| idle`), `:14-20` (labels); rendered on terminal tabs at `desktop/frontend/src/components/PaneView.tsx:423-434` (`shimmer`/`done`/`waiting`/`error`/`agentStatus` per tab). Gemini CLI and OpenCode are launchable but install no hooks, so the cell names two CLIs, not four. |
| Runs services natively, no containers — lpm ✓ | matrix row 9 | `desktop/frontend/src-tauri/src/config.rs:569-582` (a service is a command string plus cwd/port/env/dependsOn); `sessions.rs:1-3` (a pane is a shell in a directory); containers appear only as a suggested command, `desktop/frontend/src/components/project-detail/projectSuggestions.ts:317` |
| Services survive quitting the app — lpm ✓ | matrix row 10 | `desktop/frontend/src-tauri/src/sessiond.rs:1-13` ("Quitting lpm has always left your dev servers up") |
| Starts from a Procfile you already have — lpm ✗ | matrix row 11, Foreman router card | `grep -rn Procfile desktop/frontend/src desktop/frontend/src-tauri/src cli/src` → **0 hits** |
| Available outside macOS — lpm "macOS only" | matrix row 12, footnote, FAQ 3 | `desktop/frontend/src-tauri/tauri.conf.json:31-38` (only `app`/`dmg` targets and a `macOS` block); remote hosts are driven from the Mac: `config.rs:597-606` (`SshSettings`), `peerssh.rs:44-52` |
| Free and open source — lpm MIT | matrix row 13, FAQ 6, CTA | `LICENSE:1` ("MIT License") |
| "The lpm column covers the app and its `lpm` command together. Anything that changes what is running — starting, stopping, restarting — is the app's job, and the command hands it over, so keep lpm open for those; reading what is already running (`lpm list`, `lpm logs`) works either way." | matrix footnote, block 1 | `cli/src/control.rs:1-3` ("asks the running app over the unix socket"), `:12-19` (`require_app` → "lpm app is not running — start it to control projects"); `require_app` is called by `start.rs`, `stop.rs`, `service_cmd.rs`, `run.rs`, `duplicate.rs`, `job.rs`, `wait.rs`, `remove.rs`, `config_cmd.rs`, `setstatus.rs`, `pair.rs`, `mobile.rs`. **No** `require_app` in `cli/src/list.rs:40-46` (reads `sessions::running_sessions()`) or `cli/src/logs.rs:67-110` (reads `sessions::capture_pane`). `lpm status` is deliberately not named as cold-shell-safe: it pings first and prints "lpm app is not running — no live status." (`cli/src/status.rs:14-21`). |
| "A Linux box can take the other end of it — the services and the agents run there, the Mac drives them" | matrix footnote, block 2 | `tauri.conf.json:31-38` (macOS bundle only); `config.rs:597-606` (`SshSettings`); `peerssh.rs:44-52` (a host runs its services from the same binary) |
| "Duplicating a project gives each agent its own checkout, so two of them never save over each other's work; the ports and the database underneath stay shared, and lpm checks the ports a project declares before it starts and names whatever process is holding one." | matrix footnote, block 3 | Own checkout: `projects_crud.rs:509-519`, `:813`. No port allocation anywhere: `ports.rs:1-8` is conflict **detection** feeding the start dialog, and `config.rs:569-582` shows `port` is a declared integer used for checks. The holder is named: `portsprobe.rs:18-21` (`Holder { pid, command }`), `:218` (`lookup_holders`), surfaced at `desktop/frontend/src/components/PortConflictDialog.tsx:30-31` ("Stop the holder below to start the project."). |
| "A worktree copy brings across only the files git tracks — no `.env`, and dependencies only if you ask lpm to install them" | matrix footnote, block 3 | `projects_crud.rs:813` (`create_linked_worktree` is the only file-producing step — `git worktree add` checks out tracked files, and `grep -rn "\.env" projects_crud.rs` → 0 hits, so nothing copies it), `:836-839` (`if reinstall_deps { detect_package_manager → run_install }`, i.e. dependencies arrive only on that opt-in) |
| "lpm is a shape of its own: the project is the object — start it, stop it, duplicate it, and give Claude Code or Codex a tab of its own next to the services." | QuickAnswer ¶2 | `services.rs:1-7` (start/stop per project); `projects_crud.rs:509-519`; `desktop/frontend/src/types.ts:247` (`AICLI = "claude" \| "codex" \| "gemini" \| "opencode"`); tabs at `PaneView.tsx:423-434` |
| "Three of these tools start from a file you already have — a Procfile for Foreman and Overmind, a compose file for Docker Compose. Five of them run somewhere other than a Mac. lpm does neither, and the table below says so." | QuickAnswer ¶3 | Counted against the rendered table (**R2**): the Procfile row has two ✓s and Compose reads its own file, hence "three… a Procfile for Foreman and Overmind, a compose file for Docker Compose"; the platform row has five non-✗ competitor cells. The previous wording ("Three of these tools read a file you already have. Two of them run on Linux and Windows.") invited a count the Procfile row could not settle. |
| The `.lpm.yml` block in the code sample (`services:` → name: command) | QuickAnswer `CodeBlock` | `config.rs:155` (`<root>/.lpm.yml`), `:1508-1511` (parsed for `services`/`profiles`), `:809` (`profiles` map), `:569-582` (`name: cmd` shorthand) |
| "For the lpm side of it, see the full field list." | QuickAnswer caption | Links `/config`, which documents the same keys |
| "lpm ships its own, and its Open in iTerm action hands the project directory straight to yours." | Router, iTerm2 | `desktop/frontend/package.json:32` (`@xterm/xterm`, lpm's own terminal); `desktop/frontend/src-tauri/src/openin.rs:103` (`label: "iTerm"`) |
| "lpm does not need tmux installed, and does not use it — which also means there is nothing on that box for you to attach to." | Router, tmux | `sessiond.rs:1-13` (lpm's own replacement for the tmux server); ruling **R1** — this is the dependency-and-install claim the ledger mandates, and the page no longer says "lpm has no tmux anywhere in it", which the one-time upgrade cleanup in `tmuxmigrate.rs:18` contradicts. That cleanup is an implementation detail and appears nowhere in the copy. |
| "A Procfile is not something lpm reads — the names and commands move across once, by hand." | Router, Foreman | same zero-hit `Procfile` grep as matrix row 11 |
| "lpm will run `docker compose up` as one of its services when you want both." | Router, Docker Compose | `config.rs:569-582` (any command is a service); `projectSuggestions.ts:317` (`docker compose up -d` is the suggested action form) |
| "you want the project managed too — services, a port check before they start, and a separate checkout per agent" | Router, cmux | `config.rs:569-582` (`port`, `portConflict`); `ports.rs:1-8` + `PortConflictDialog.tsx:30-31` (the check happens at start); `projects_crud.rs:509-519`. Reworded from "services, ports, …" so it cannot be read as per-copy port assignment, which does not exist. |
| "lpm looks for the agent CLIs you already have installed, opens each one in its own tab alongside the running services, marks that tab working, needs-you or done as the agent goes, and can copy the whole project so two agents never edit the same files." | FAQ 4 | `aigen.rs:32-40`; `hooks.rs:1-9`; `agentStatus.ts:12`, `:14-20`; `PaneView.tsx:423-434`; `projects_crud.rs:509-519`; `BulkDuplicateDialog.tsx:42`. "never edit the same files" is the checkout claim only — the shared-ports half is conceded in the matrix footnote. |
| "let one tool own starting and stopping the project. Nothing here holds your processes hostage." | FAQ 5, CTA | `cli/src/start.rs`, `cli/src/stop.rs`; `services.rs:1-7` (ordinary processes, explicit stop paths only) |
| "every service comes up at once, each in its own live pane" | SectionVideo label | `sessions.rs:1-3`; `services.rs:1-7`; the clip itself (`/screenrecording/start-project.mp4`) |
| "a tab per agent, its status, and the services still running underneath" | RelatedPages, agents card | `hooks.rs:1-9`; `agentStatus.ts:12`; `PaneView.tsx:423-434`; `sessions.rs:1-3` |
| "Reach a machine over SSH and keep it in the sidebar beside your local projects" | RelatedPages, SSH card | `config.rs:597-606` (`SshSettings` — host, user, port, key, dir); `peerssh.rs:44-52` |
| "Driving a headless Linux host from the Mac" | RelatedPages, remote-server card | same as matrix row 12: `tauri.conf.json:31-38`; `config.rs:597-606`; `peerssh.rs:44-52` |

Not claimed anywhere on this page, on purpose (spec §5.3/§5.5): no zero-config start, no per-duplicate ports, no framework auto-detection, no interleaved log stream, no crash restart (the matrix now concedes it in a row of its own), no native-banner claim, and no cold-shell claim for any mutating verb.

The three remaining `RelatedPages` blurbs describe other pages on this site rather than the app: `/best-terminal-for-mac` really does compare lpm with iTerm2, Terminal.app, tmux, Hyper and Warp (`app/best-terminal-for-mac/_components/comparison.tsx:10-16`), `/config` documents both the project file and `~/.lpm/global.yml` (`app/config/page.tsx`), and `/git-worktree-for-ai-agents` is where what a worktree leaves behind is spelled out (`app/git-worktree-for-ai-agents/_components/what-breaks.tsx:14-28` for `.env` and dependencies, `:46-51` for shared ports and databases — the same two caveats the matrix footnote states). The seven `itemListJsonLd` descriptions are one-line summaries of the child pages and assert no lpm capability beyond the rows above.

### Competitor claims and the source each one traces to

Fourteen `ComparisonBasis` sources, up from §4.1's seven. **R3** required the additions: every claim below either traces to one of them or is gone. Each new URL was fetched and read on 2026-09-10.

| Claim on the page | Source it traces to |
|---|---|
| iTerm2's triggers, smart selection, Python API, tmux control mode; "only via tmux" for surviving a quit | iTerm2's documentation |
| iTerm2 3.7 ships a Claude Code integration (FAQ 4), and its release notes describe **no** per-session status (matrix cell "not documented") | iTerm2's 3.7 release notes — "version 3.7… a Claude Code integration", 8 September 2026 |
| tmux panes and sessions survive a disconnect; respawn is manual; runs on Linux and \*BSD | the tmux manual |
| cmux is macOS-only, has workspaces, a programmable browser pane, a CLI and Unix socket, restores panes on relaunch, signals a pane that needs attention, GPL-3.0-or-later | the cmux README — "macOS only, for now", "cmux can split a real browser pane… navigate, snapshot the DOM, click, type, evaluate JavaScript", "Every action is available through the cmux CLI and a Unix socket", "cmux restores windows, workspaces, panes… when you relaunch", "notification rings around panes", "GPL-3.0-or-later" |
| Compose interleaves output, runs detached, restarts one service, pins image versions, has its own network | the Docker Compose docs |
| Compose brings a crashed container back only with a restart policy (default `no`) | the Compose file reference — `"no"` is "The default restart policy… does not restart the container under any circumstances"; `always` / `on-failure` / `unless-stopped` are the opt-ins |
| Docker Desktop costs money past a company-size and revenue test (FAQ 6) | Docker Desktop's licence terms — the free tier is "fewer than 250 employees AND less than $10 million in annual revenue" |
| Foreman: one command, output interleaved in one terminal, `foreman export` for launchd, systemd and five other init formats, no way to restart one process in a running formation | the Foreman man page — "interleave the output on stdout"; "bluepill, inittab, launchd, runit, supervisord, systemd, upstart" (seven formats); the page documents `start`, `export`, `check` and `run` and no per-process restart |
| Overmind needs tmux installed first, runs each Procfile line in its own tmux window, `overmind connect`, `overmind restart`, `-m web=2,worker=3`, a PORT per process, `start -r` auto-restart | Overmind's README — "Overmind works with tmux, so you need to install it first"; "connect to its tmux window"; "restart a single process without restarting all the other ones"; "-m web=2,worker=5"; "assigns the port base (5000 by default) to PORT… and increases PORT by port step"; "tell Overmind to restart them automatically when they die: overmind start -r rails,webpack" |
| `pm2 logs`, PM2 as a long-running supervisor whose processes outlive the shell | PM2's process-management docs |
| PM2 keeps a process alive with backoff, and brings a crashed one back on its own | its restart strategies — "applications are automatically restarted on auto exit, event loop empty (node.js) or when application crash"; "the exponential backoff restart will increase incrementally the time between restarts" |
| cluster mode across cores, zero-downtime reload | cluster mode — "scaled across all CPUs available, without any code modifications"; "`reload` achieves a 0-second-downtime reload" |
| boot persistence, `pm2 startup` | startup scripts — "generate startup scripts… to keep your process list intact across expected or unexpected machine restarts"; "PM2 will automatically restart at boot" |
| log rotation | log management pages — "The module pm2-logrotate automatically rotate and keep all the logs file using a limited space on disk" |

Two competitor claims from §4.1 were **cut rather than sourced** (**R3/R8**):

- iTerm2's "deepest configuration surface on the platform" is a superlative no document can settle. The card now reads "a deep configuration surface: triggers, smart selection, a Python API, tmux control mode" — same four features, no ranking.
- Foreman's "colour-prefixed" logs. The man page documents the interleaving and not the colour, so every instance on this page (router card, its Switch-if line, FAQ 2) now says "one stream" / "interleaved into one stream". Foreman still wins the row; the page just stops describing a detail it cannot cite.

---

## Notes for engineers copying this file

- Files: `app/vs/page.tsx`, `app/vs/_components/{hero,tool-matrix,router}.tsx`, `app/vs/_components/tool-matrix-data.ts`, `app/vs/opengraph-image.tsx`.
- Path constant: `VS_BASE_PATH` (`lib/links.ts`); child URLs via `vsPath(slug)`. Canonical `https://lpm.cx/vs`.
- Structured data, exactly four entries: `webPageJsonLd` (with `about[]` and `dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd`, `itemListJsonLd` (hub only, seven children), `screenRecordingJsonLd("start-project")`. `FAQPage` comes from the `Faq` component. Nothing from §6.2's excluded list.
- `itemListJsonLd` will not render a carousel (§6.2) — it is there for entity extraction, not a SERP feature.
- Analytics: hero `vs-hub-hero`, CTA `vs-hub-cta`. Both already exist in `DownloadSource`.
- Emerald appears nowhere in this page's own files.
- **Rule 2 (≥8-word runs) is clean as of this pass.** An 8-gram intersection of `app/vs/page.tsx` + `app/vs/_components/*` + `app/vs/opengraph-image.tsx` against every sibling's `.tsx` files reports only code scaffolding: the `metadata` object shape, the `og-template` boilerplate, the `Cell` helper's identifiers, and shared `ComparisonBasis` source URL/label pairs. All seven prose overlaps the reviewer found are rewritten on the hub side — FAQ 2, FAQ 4's agent-status clause, FAQ 6's cmux clause, the iTerm2 "Open in iTerm" line, the tmux "remote box" line, the Foreman Procfile line, the Compose "production parity" line, and (introduced and then fixed in this pass) the footnote's CLI sentence against `/vs/iterm2` and the cmux card's browser-pane phrasing against `/vs/cmux`. Siblings are being edited in parallel, so the check is a snapshot: re-run `grep`-based 8-gram intersection over `app/vs` after the other seven pages land.
- **Rule 3 (row labels) is clean.** `grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` now reports only tool-column labels, `VerdictCards` labels, `ComparisonBasis` source labels and `openin`'s `"iTerm"` — none of which are matrix rows.
- **Deviation from §3.2 / the brief's mention of `VerdictCards`:** §4.1 supplies no verdict-card copy and the canonical hub order omits the component, so the hub does not render it. Inventing three strings per card would be unreviewed copy (**R8**).
- **Known shared-layer issue, not fixable from this page:** `components/vs/comparison-basis.tsx` renders a bare `<div>` with no section padding, so on the hub it sits flush between the matrix (`py-16 sm:py-20`) and the router (`py-16 sm:py-20`). It looks the same on all eight pages; a wrapper belongs in the shared component.
- **Worth eyeballing at 390px:** the sticky capability column while the table is scrolled. The separator is now a `box-shadow` for exactly this reason, but the interaction between a sticky `<th>` and a collapsed-border table is the one place this table can look wrong.
