# /vs/iterm2 — Content & Copy Plan

Page route: `/vs/iterm2`
Target primary keyword: **iterm2 alternative**
Intent: a Mac developer who searched for an iTerm2 alternative, expects an emulator, and needs to be told in the first paragraph that lpm is not one — then shown the thing it does instead.

**Angle:** the page concedes the emulator category outright (Ghostty, Kitty, WezTerm, Alacritty, Warp, and iTerm2 3.7 itself), then argues one narrow claim: the project — services, ports on the service tabs, a checkout per agent — is a thing no emulator owns. Every other /vs page argues against a tool that already starts processes; this one argues against a tool that never tried to.

Source of truth: **the app source and the fact-check ledger first, spec part 4.3 second.** Where part 4.3's copy contradicted `desktop/` / `cli/` or ledger §5.3–§5.5, the copy was rewritten (see §8). The rest of part 4.3 ships as written.

---

## 1. Metadata

```ts
title: "iTerm2 Alternative for Mac: Projects, Not Just Panes"
// 52 chars; renders 58 with the layout's " — lpm"
description: "iTerm2 is the better emulator. lpm runs the project instead: one click brings up every service, with Claude Code and Codex in the next tab. Keep both."
// 150 chars. Rewritten: part 4.3's "lpm is the project layer above it" is banned by ledger §5.3 row 1.
keywords: [
  "iterm2 alternative", "iterm alternative", "iterm2 alternative mac",
  "iterm2 vs lpm", "free iterm2 alternative", "iterm2 alternative for claude code",
  "iterm2 vs warp", "iterm2 project management", "run multiple services in iterm2",
  "mac terminal for multiple projects", "iterm2 vs ghostty",
]
// 11 entries. `best terminal for mac` and `mac terminal alternative` are removed
// per spec §6.4 — /best-terminal-for-mac owns them.
alternates.canonical: "/vs/iterm2"
openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: PATH, siteName: "lpm" }
twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION }
```

`TITLE` and `DESCRIPTION` are declared once and used in `metadata.title`, `openGraph`, `twitter` and `webPageJsonLd({ title, description })`.

**OG image** (`opengraph-image.tsx`):
- `headline: ["An iTerm2 alternative that runs", "whole projects, not just panes."]` — the two lines joined are the H1 verbatim.
- `subline: "One click starts every service, ports on each service tab, a checkout per agent. Keep iTerm2 for the shell."` (107 chars) — rewritten twice over: part 4.3's subline used the banned "project layer above your terminal" **and** "ports on every tab", which overstates by one word (`PaneView.tsx:382-407` puts ports on service tabs only).
- `alt: "An iTerm2 alternative that runs whole projects, not just panes."`

---

## 2. Section outlines

Rendered order — the canonical /vs child order from spec part 2, no deviations:

`ComparisonHero → ComparisonBasis → QuickAnswer → VerdictCards → KeepGiveUp → Matrix → EmulatorShelf → SectionVideo → WhenToPick → DemoSection → Faq → RelatedPages → Cta`

Slot 5 (page-unique A) is `_components/keep-give-up.tsx`. Slot 6 is the shared `FeatureMatrix`, wrapped in `_components/matrix.tsx` so its rows and footnote live in the page's own directory. Slot 7 (page-unique B) is `_components/emulator-shelf.tsx`, closed by the shared `SectionVideo`.

### Hero
- eyebrow `lpm vs iTerm2`
- H1 `An iTerm2 alternative that runs whole projects, not just panes.`
- subtitle: "iTerm2 is the more capable emulator, and nothing here argues with that. lpm owns the project instead: one click brings up every service, each service tab carries the ports it is listening on, and a second agent gets a checkout of its own."
- verdict line `Most people should keep iTerm2 and add the project layer.`
- `jumpHref="#matrix"` (lands on `FeatureMatrix id="matrix"`), `jumpLabel="Jump to the iTerm2 rows"`, `downloadSource="vs-iterm2-hero"`

### Comparison basis
`reviewed={VS_REVIEWED}` `reviewedIso={VS_REVIEWED_ISO}`, eight sources (§6), `lpmNote` "iTerm2 3.7 shipped on 8 September 2026; the agent-integration row reflects that release."

### Quick answer
H2 `Is there a real iTerm2 alternative?`. Paragraph 1 names the emulator shelf before it names lpm. Paragraph 2 is the what-lpm-is paragraph. Then the `~/Projects/shop/.lpm.yml` `CodeBlock`, then the closing paragraph — which now names **both** config files (§5.5) and keeps `/config` linked on `Every field`, never on the word "commit" (part 7 blocker still open).

### Verdict cards
`Keep iTerm2 for` · `Add lpm for` · `Run both`. `label` = entity, `title` = heading, `body` = the sentence — the pattern all eight pages now use.

### KeepGiveUp (page-unique A)
Eyebrow `The real question`, title `What you keep, and what you give up`. Left column: eight things lpm's own terminal keeps. Right column: six things iTerm2 has that do not come with it — the vague "renderer knobs" item was cut (no source) and replaced with the scrollback concession, which is sourced.

### Feature matrix
`id="matrix"`, **12 rows** (§4), title `iTerm2 and lpm, feature by feature`, description "Twelve rows. Three of them go to iTerm2 — scrollback, emulator scripting, control mode — and one of those three is the reason to keep it." Footnote carries the in-body `/vs/tmux` link off the control-mode row.

### EmulatorShelf (page-unique B)
Eyebrow `Be honest`, three cards (iTerm2 · Warp · the four remaining names, full width), a closing paragraph, and the demoted in-body `/best-terminal-for-mac` mention (spec §6.1). The Ghostty/Kitty and WezTerm/Alacritty *characterisations* were cut rather than sourced — see §8 item 4.

### SectionVideo
`clip="duplicate-project"`, eyebrow `See it`, title `The thing a terminal window cannot do`.

### When to pick
Five lpm bullets, iTerm2's four kept verbatim. The config bullet was rewritten to name the mechanism that actually drafts a service list (your own agent CLI), per §5.5.

### FAQ
Six items (§5). Items 3 and 5 are JSX and carry `answerText`.

### Related pages
Exactly five: `/terminal-with-project-sidebar`, `/vs/tmux`, `/vs/cmux`, `/git-worktree-for-ai-agents`, `/config`. `/best-terminal-for-mac` stays demoted to the in-body mention.

### CTA
`Keep iTerm2. Add the project layer.` + `downloadSource="vs-iterm2-cta"`.

---

## 3. Structured data

`webPageJsonLd` (with `about[]` and `dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd` (Home → Compare → iTerm2), `screenRecordingJsonLd("duplicate-project")`. `FAQPage` comes from `components/vs/faq.tsx` inline. Nothing else.

`about: ["iTerm2 alternatives for macOS", "terminal emulator versus project manager", "running multiple dev services on a Mac", "Claude Code and Codex in a terminal"]`

---

## 4. Comparison matrix

Columns: lpm (highlighted) then iTerm2. **Twelve rows.**

| Label | lpm | iTerm2 |
|---|---|---|
| Start every service in a project with one command | one click, or lpm start from any shell with the app open | you run each command yourself |
| Listening ports on each service tab | the ports that service's process tree owns | ✗ |
| Dev servers keep running once the window is gone | its own session layer — tmux is neither used nor needed | only if you started them under tmux |
| Bring up the frontend only, and leave the rest down | a named profile in the project file | its profiles set the shell and the appearance, not a set of services |
| Lint, migrate or seed without retyping the command | action buttons in the project, or lpm run | shell history and aliases |
| Copy a repo for a parallel agent | up to 50 linked worktrees or standalone copies | ✗ |
| Seeing what an agent is doing without switching to it | working, needs you, done or error on the terminal tab — Claude Code and Codex | working, waiting or idle in the Session Status panel — Claude Code only, since 3.7 |
| Project control from any shell or agent | the lpm command, with --json for whatever reads it | Python API |
| Emulator scripting: triggers, smart selection, output hooks | ✗ | ✓ |
| tmux control mode rendered as native tabs | ✗ | ✓ |
| Scrollback you can raise, or leave unbounded | 10,000 lines a pane, fixed | as many lines as you set, or unlimited |
| Licence and price | MIT, free | GPLv2, free |

**Rows conceded to iTerm2 — three, and the description says three:** scrollback (10,000 fixed vs any number or unlimited), emulator scripting (✗/✓), tmux control mode as native tabs (✗/✓). The agent-state row additionally concedes that iTerm2 ships a Claude Code integration of its own, and the control row concedes iTerm2 has a scripting API, but both rows still land with lpm, so neither is counted. No other surface on the page repeats a count; FAQ 3's "three things" is checked against the three things it then lists.

**Changed from the previous pass** (why, in one line each):
- Row 1's lpm cell is no longer a bare ✓ — ledger §5.5 (`cli/src/start.rs:16` → `control::require_app`).
- Row 3's label and cells moved into iTerm2's vocabulary (window, not "the app"), Rule 3 collision with `/vs/tmux` and `/vs/pm2` avoided.
- Rows 4, 5, 7 and 12 relabelled: `Run a subset of services (profiles)`, `One-shot tasks (lint, migrate, seed)`, `Agent status on the tab (working, needs you, done, error)` and `License` were byte-identical to `/vs/cmux`, `/vs/tmux` and `/vs/foreman` labels (Rule 3).
- Row 7's cells now say **where** each product shows the state, because iTerm2's renders in the Session Status toolbelt panel and lpm's on the tab.
- Row 8's lpm cell dropped "over a Unix socket" (implementation noun) and "JSON on every command" (14 of the CLI's subcommands take `--json`, not all).
- Row 11 (scrollback) is new: the third honest concession, from `Pane.tsx:58` against iTerm2's own scrollback setting.

**Deleted from the old matrix, per spec §4.3 and ledger §5.3/§5.4:** `Primary object`, `Per-project config`, `Auto-detect stack on init`, `Live status per service on the tab`, `Embedded browser`, `Years of terminal-emulator polish`, `Native SSH workspaces`, `Platforms`, `Pre-built agent hooks`.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Is lpm a replacement for iTerm2?** — kept verbatim; it opens with the verdict.
2. **Can I keep using iTerm2 alongside lpm?** — kept, including "lpm has an Open in iTerm action, so the project directory is one click from your own shell."
3. **What does lpm do that iTerm2 cannot?** — rewritten. Opens "Three things, and not one of them is about the emulator" (was "all above the terminal layer", banned by §5.3). Names the agent CLI as the thing that writes the service list and the built-in scan as the thing that offers one-shot commands (§5.5). Says "that service's tab", not "each tab". Carries the duplicate caveat in full — a standalone copy brings ignored files and installed packages; a linked worktree starts from the commit and does not; both share ports and one database — with `/git-worktree-for-ai-agents` linked on the worktree clause.
4. **How does lpm compare to Warp, Ghostty, or Kitty?** — rewritten: "those are emulators, and lpm is not one" (was "lpm is the layer above one").
5. **Can I run lpm from the iTerm2 command line?** — rewritten. Two groups: `lpm start` / `lpm stop` / `lpm service web restart` / `lpm run` / `lpm duplicate` need the app open; `lpm list` and `lpm logs` answer from a cold shell; `lpm status` needs the app too, because it reports agent state the app owns (`cli/src/status.rs:14-21`).
6. **Do I lose my iTerm2 profiles and keybindings?** — kept.

---

## 6. Sources on the page (`ComparisonBasis`)

1. iTerm2 documentation — https://iterm2.com/documentation.html
2. the iTerm2 scripting API docs — https://iterm2.com/python-api/
3. the iTerm2 tmux integration docs — https://iterm2.com/documentation-tmux-integration.html
4. the iTerm2 release notes — https://iterm2.com/news.html
5. its Claude Code integration docs — https://iterm2.com/claude-code-integration.html
6. its scrollback setting — https://iterm2.com/documentation-preferences-profiles-terminal.html
7. iTerm2's licence — https://github.com/gnachman/iTerm2/blob/master/LICENSE
8. Warp's repository — https://github.com/warpdotdev/Warp

Sources 5 and 6 were added this pass and both were fetched and read on the review date:

- **5** confirms the whole agent row: the hook "lets iTerm2 detect Claude's state (busy/working/idle) and show it in the Session Status tool"; "the Session Status tool in the toolbelt lists your sessions with the status each one reports"; states are **working** / **waiting** / **idle**; the integration requires "the Claude Code CLI installed and runnable as `claude`" and mentions no other agent CLI, which is what "Claude Code only" rests on.
- **6** confirms the scrollback row: "The number of lines of scrollback buffer to keep above the visible part of the screen. Unlimited scrollback will allow it to grow indefinitely, possibly using all available memory."
- **4** confirms the `lpmNote`, the QuickAnswer's "not standing still", and the shelf's iTerm2 card: 3.7, 8 September 2026, whose highlights are "a companion iOS app…, a Claude Code integration, and support for creating groups of tabs".

Every competitor statement on the page now traces to one of the eight: emulator scripting and the Python API to 1–2, control mode to 3, the 3.7 facts to 4, the agent row to 5, scrollback to 6, GPLv2 to 7, and Warp's licensing to 8 — which says "Warp's client codebase is open source", AGPL v3 with the `warpui` crates under MIT. It carries no open-sourcing **date**, so the shelf card no longer claims one; part 4.3's "in April 2026" was cut rather than left uncited. The shelf's third card names Ghostty, Kitty, WezTerm and Alacritty and makes no claim about any of them, so it needs none.

---

## 7. Claims table — every lpm claim, with a `desktop/` or `cli/` citation

Paths are relative to the repository root; every line was re-checked against the source this pass.

| Claim as it appears on the page | Where | Citation |
|---|---|---|
| One click starts and stops every service in a project | hero, QuickAnswer, matrix row 1, WhenToPick | `desktop/frontend/src-tauri/src/services.rs:270` (`start_project`), `:322` (`stop_project`), `:492`/`:531` (`start_service` / `stop_service`); `desktop/frontend/src-tauri/src/socketsrv.rs:10-14` |
| `lpm start` works from any shell **with the app open** *(ledger hedge §5.5)* | matrix row 1, FAQ 5 | `cli/src/start.rs:16` (`control::require_app`); `cli/src/control.rs:12-19` ("lpm app is not running — start it to control projects", exit 2) |
| Each service tab carries the ports that service's process tree is listening on *(ledger)* | hero, QuickAnswer, FAQ 3, matrix row 2 | `desktop/frontend/src/components/PaneView.tsx:382-407` (service tab renders name + a `:port` list, nothing else); `desktop/frontend/src-tauri/src/ports.rs:36-42` ("Ports a running service's process tree is currently listening on") |
| Dev servers keep running once the window is gone; lpm has its own session layer and neither uses nor needs tmux *(ledger ruling 1)* | QuickAnswer, matrix row 3, EmulatorShelf, WhenToPick | `desktop/frontend/src-tauri/src/sessiond.rs:1-13`; `desktop/frontend/src-tauri/src/tmuxmigrate.rs:12` ("this is lpm's last tmux call, not a dependency") |
| A named profile brings up a subset of services *(ledger)* | matrix row 4, QuickAnswer code sample | `desktop/frontend/src-tauri/src/config.rs:809` (`profiles: BTreeMap<String, Vec<String>>`); `cli/src/main.rs:135-137` (`lpm start --profile`) |
| A `.lpm.yml` in the repo travels with the branch and gives a teammate the same services; the same lines can live in your own project file instead *(ledger §5.5)* | QuickAnswer closing paragraph | `desktop/frontend/src-tauri/src/config.rs:1508-1520` (parses `<root>/.lpm.yml`), `:1522-1546` (merges its services + profiles **under** the personal project file) |
| One-shot commands are action buttons in the project, or `lpm run` | matrix row 5 | `desktop/frontend/src/components/ActionButton.tsx:15-30`; `cli/src/main.rs:321-336` (`Run { action, command, prompt }`), `cli/src/run.rs:140` (`require_app`) |
| Copies a repo for a parallel agent — up to 50 linked worktrees or standalone copies *(ledger)* | QuickAnswer, matrix row 6, FAQ 3, video | `desktop/frontend/src-tauri/src/projects_crud.rs:509-531` (`git worktree add -b … HEAD`), `:731-796` (standalone copy via `cp_clone`); `desktop/frontend/src/components/BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`); `cli/src/main.rs:243` and `:283` (`--count` range `1..=50`) |
| A standalone copy brings your ignored files and installed packages along; a linked worktree starts from the commit and does not *(R6 hedge)* | FAQ 3 | `desktop/frontend/src-tauri/src/projects_crud.rs:409-424` (`cp_clone` copies the tree, pruning `node_modules` only when reinstalling) vs `:509-531` (`git worktree add … HEAD` — tracked files only), `:836-840` (deps only if you ask for a reinstall); the same concession ships at `app/git-worktree-for-ai-agents/_components/what-breaks.tsx:14-28` |
| Both copies answer on the same ports and talk to the same database *(ledger)* | FAQ 3 | `desktop/frontend/src-tauri/src/ports.rs:1-8` (conflict **detection** only); `app/git-worktree-for-ai-agents/_components/what-breaks.tsx:46-53` |
| Agent state — working, needs you, done or error — on the terminal tab, from Claude Code and Codex *(ledger)* | matrix row 7 | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (installs Claude Code and Codex hooks only); `desktop/frontend/src/agentStatus.ts:11-20`; `desktop/frontend/src/components/PaneView.tsx:413-434` (badges on terminal tabs) |
| Project control from any shell or agent: the `lpm` command, `--json` for whatever reads it | matrix row 8, FAQ 5 | `desktop/frontend/src-tauri/src/socketsrv.rs:1-38`; `cli/src/main.rs` — 14 subcommands declare `json: bool` (e.g. `:90-93` list, `:150-164` service, `:321-336` run). Deliberately **not** "JSON on every command": not every verb has the flag |
| `lpm list` and `lpm logs` answer from a cold shell; `lpm start`, `lpm stop`, `lpm service … restart`, `lpm run`, `lpm duplicate` and `lpm status` need the app open | FAQ 5 | no `require_app`: `cli/src/list.rs:41-42` (`sessions::running_sessions()`), `cli/src/logs.rs:76-110` (`session_exists` → `capture_pane`). Needs the app: `cli/src/start.rs:16`, `cli/src/stop.rs:10`, `cli/src/service_cmd.rs:50`, `cli/src/run.rs:140`, `cli/src/duplicate.rs:48`; `cli/src/status.rs:14-21` pings first and prints "lpm app is not running — no live status." **This corrects the previous pass**, which shipped ledger §5.5's sentence claiming `lpm status` works with the app closed |
| Restart one service without the rest (`lpm service web restart`) *(ledger)* | FAQ 5, matrix row 5 context | `desktop/frontend/src-tauri/src/services.rs:466-470` (`restart_service_at`), `:508` (`restart_service_by_name`); `cli/src/main.rs:150-164` |
| lpm starts ordinary processes through your login shell; nothing is captured or wrapped | VerdictCards "Run both", FAQ 2, CTA | `desktop/frontend/src-tauri/src/pty.rs:346` (`builder.arg("-l")` — login shell) |
| There is an Open in iTerm action that drops you into the project directory *(ledger)* | VerdictCards, FAQ 2 | `desktop/frontend/src-tauri/src/openin.rs:103` (`label: "iTerm"`), `:212`, `:484` (`create window` … `cd <dir>; clear`) |
| Point Claude Code or Codex at the repo — package.json scripts, Makefile targets, justfile recipes, compose files — and it writes the service list; the built-in scan offers the commands it finds as one-shot buttons *(ledger §5.5)* | FAQ 3, WhenToPick | `desktop/frontend/src-tauri/src/aigen.rs:1-6` (shells out to claude / codex / gemini / opencode), `:33-45`; `desktop/frontend/src/components/project-detail/useProjectSuggestions.ts:68-118` (returns `ActionTemplate[]` — **action** templates) and `projectSuggestions.ts:255-320` |
| One view of everything running across every project, with the ports each service holds *(ledger)* | WhenToPick | `desktop/frontend/src/components/FleetView.tsx`; `desktop/frontend/src/components/FleetServiceRow.tsx:6-9` ("A running service and the port it answers on") |
| 10,000 lines of scrollback in every pane, fixed *(ledger)* | KeepGiveUp, matrix row 11 | `desktop/frontend/src/components/Pane.tsx:58` and `desktop/frontend/src/components/InteractivePane.tsx:543` (`scrollback: 10000`); no scrollback row exists in `desktop/frontend/src/settings-registry.ts`, which is why the cell says "fixed" |
| Search inside any pane | KeepGiveUp | `desktop/frontend/src/components/Pane.tsx:67` (`SearchAddon`) |
| Clickable links | KeepGiveUp | `desktop/frontend/src/components/Pane.tsx:70` (`WebLinksAddon`); `desktop/frontend/src/components/terminal/pathLinkProvider.ts:164` |
| Eight terminal themes including one-dark, dracula, nord and solarized-dark *(ledger)* | KeepGiveUp | `desktop/frontend/src/terminal-themes.ts:1-10` (exactly eight names) |
| A font size you zoom with ⌘+ and ⌘− | KeepGiveUp | `desktop/frontend/src/components/TerminalView.tsx:686-688` (⌘=, ⌘+, ⌘− registered), `:700-701` (wired to the zoom steps); `desktop/frontend/src/hooks/useTerminalFontSize.ts:31-32` (`zoomIn` / `zoomOut`, clamped 8–24). Narrowed from part 4.3's "font size per window": the setting is one app-wide terminal font size |
| Splits and tabs | KeepGiveUp | `desktop/frontend/src/components/PaneView.tsx:470-476` (Split right, ⌘D), `:413-434` (tab strip) |
| Full Unicode | KeepGiveUp | `desktop/frontend/src/components/Pane.tsx:71` (`Unicode11Addon`, `unicode.activeVersion = "11"`) |
| Copy that works from a remote shell | KeepGiveUp | `desktop/frontend/src/components/InteractivePane.tsx:766` (OSC 52 handler, write-only) |
| lpm ships a terminal of its own | EmulatorShelf | `desktop/frontend/src/components/Pane.tsx:1-12` (`@xterm/xterm`) |
| MIT, free | matrix row 12, CTA | `LICENSE:1` |
| Free macOS app; macOS only | QuickAnswer, WhenToPick | `desktop/frontend/src-tauri/tauri.conf.json:31-42` (`app` + `dmg` targets, `macOS` block only) |

---

## 8. Rulings applied this pass

The previous pass shipped five spec-versus-ledger conflicts unresolved, on the instruction that the spec outranked the source. That instruction was reversed; all five are now fixed in the copy.

1. **"above" / "on top of" (ledger §5.3 row 1) — fixed on all four surfaces.** `DESCRIPTION` is a new 150-char string; the OG subline is new; the EmulatorShelf description now says lpm "runs beside it in a window of its own, and hands you straight back to it whenever you want a shell" (which is what `openin.rs:103,:484` actually does); FAQ 3 opens "and not one of them is about the emulator"; FAQ 4 says "those are emulators, and lpm is not one". "Add the project layer" survives in the verdict line and the CTA: it describes adding a layer to your setup, not lpm running on top of iTerm2, which is the relationship §5.3 bans.
2. **Matrix row 1's bare ✓ — fixed.** The cell is now "one click, or lpm start from any shell with the app open" (§5.5, `start.rs:16`), worded so it shares no run with the four pages §5.5 gives the mandated string to.
3. **"each tab" / "ports on every tab" — fixed.** FAQ 3 now says "onto that service's tab" and the OG subline says "ports on each service tab". Every surface on the page now uses the service-tab form.
4. **Unsourced shelf characterisations — cut, not sourced.** "Where most people who found iTerm2's options overwhelming end up" was an unfalsifiable market claim of the class §5.4 rejected, and "a small configuration surface" is dubious for Kitty in particular, so both cards went. Ghostty, Kitty, WezTerm and Alacritty are still named — in one full-width card that makes no claim about any of them — and the two cards that remain (iTerm2, Warp) are sourced by 4 and 8. Four new sources for a decorative section would have cost the reader more than the sentences were worth.
5. **`lpm status` — fixed.** FAQ 5 no longer claims it works with the app closed; it is grouped with the verbs that need the app, with the reason a reader can check (it reports agent state, which the app owns). `lpm list` and `lpm logs` keep the cold-shell claim, which the source supports.

Also settled this pass:

- **Concession count (R2).** Twelve rows, three conceded, and the matrix description names which three. The previous pass claimed three and rendered two.
- **Rule 3 (R4).** No matrix row label on this page is byte-identical to a label on another /vs page: `grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` now returns only `VerdictCards` entity labels and `ComparisonBasis` source labels, which are exempt.
- **Rule 2 (R5).** A prose 8-gram diff of this page against the other seven /vs directories returns nothing. The four runs the previous pass shipped are gone: the Open in iTerm sentence in `Run both`, the worktree/standalone sentence in the QuickAnswer, the CLI cell in matrix row 8, and the agent-status label. Each fact survives in this page's own words.
- **`lpm run` added to FAQ 5's app-needed list** — `cli/src/run.rs:140` is `require_app`, so listing only start/stop/service/duplicate understated it.
- **KeepGiveUp** lost "The renderer knobs" (no source, and vague) and gained "Scrollback you can set as high as you like, or leave unlimited", which source 6 supports and which pairs with the new matrix row.

### Still open, and not fixable from inside this directory

- Part 7's `/config` blocker: `grep -rn "lpm.yml" app/config` still returns nothing, so `/config` is linked on "Every field" and never on the word "commit". The QuickAnswer's commit claim is carried by the page's own prose and cited above (`config.rs:1508-1546`) instead.
- Inline in-body links (`Every field`, the worktree caveat, `tmux comparison`, `What it includes is listed here`) are prose links at body line-height, not 44px tap targets. Making them taller means changing shared prose components, not this page.

---

## Notes for engineers

- Files: `page.tsx`, `_components/keep-give-up.tsx`, `_components/matrix.tsx`, `_components/emulator-shelf.tsx`, `opengraph-image.tsx`, this file. No shared component was edited. `page.tsx` stays under 400 lines with the matrix extracted.
- Both page-unique components are server components and render their own `py-16 sm:py-20` section, max-width container and `px-6` gutter — do not wrap them.
- `VerdictCard`: `label` = entity (`iTerm2`, `lpm`, `Both`), `title` = heading, `body` = sentence. `/vs/tmux` has since adopted the same shape, so the cluster is consistent.
- 390px: the matrix renders its own stacked card list below `md` (and its table sits in `overflow-x-auto` above it), the `CodeBlock` scrolls inside itself, and every card grid is one column below `sm`. The shelf's fourth card is `sm:col-span-2`, which is a no-op at phone width.
- No emerald anywhere; every colour is defined outside the `dark:` variant as well as inside it.
- `npx eslint app/vs/iterm2` is clean.
