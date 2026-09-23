# /vs/cmux — Content & Copy Plan

Page route: `/vs/cmux`
Target primary keyword: **cmux alternative**
Intent: a Mac developer already running Claude Code or Codex in cmux (or shopping for a
terminal that is built for agents) who wants to know whether anything also brings the
project's services up and runs several agents at once.

**Angle:** cmux owns the terminal; lpm owns the project the agents run inside. Written in
cmux's own vocabulary — `cmux.json`, `cmux ssh`, `cmux notify`, libghostty, the browser
pane, the socket API — so it does not read as generic lpm marketing and does not repeat a
sibling /vs page. Every cmux claim traces to a `ComparisonBasis` source; every lpm claim
traces to a `desktop/` or `cli/` file:line in §7 below.

Source of every string on this page: `vs-upgrade-spec.md` part 4.4 — except where the app
source, the fact-check ledger or the second-pass rulings R1–R8 overrule its copy, which is
now the standing order. Those overrules are listed in §8, and every one of them is a
rewrite towards something checkable. Where this file adds copy the spec did not supply, §8
lists that too.

---

## 1. Metadata

```ts
title: "cmux Alternative for Claude Code & Codex"
// 40 chars — renders as "cmux Alternative for Claude Code & Codex — lpm" (46) via
// app/layout.tsx's `template: "%s — lpm"`. No `title: { absolute: … }`.
description: "cmux gives Claude Code and Codex a scriptable Mac terminal. lpm adds the project around them: services, per-tab agent status, and 1–50 parallel copies."
// 151 chars
keywords: [
  "cmux alternative",
  "cmux alternative mac",
  "cmux vs lpm",
  "manaflow cmux",
  "is cmux open source",
  "parallel claude code agents",
  "run multiple codex agents",
  "claude code agent manager",
  "run multiple claude code agents at once",
  "agent terminal macos",
  "claude code multiple projects",
  "does cmux use tmux",
]
// 12 entries. `terminal for claude code` and `terminal for codex` are deliberately
// REMOVED (§6.4): /best-terminal-for-claude-code-and-codex owns both and is nav-linked.
alternates.canonical: "/vs/cmux"
openGraph.title: TITLE            // same const
openGraph.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/cmux"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
twitter.title: TITLE
twitter.description: DESCRIPTION
```

`TITLE` and `DESCRIPTION` are declared once and used in `metadata.title`,
`openGraph.title`, `twitter.title`, `metadata.description`, both OG/Twitter descriptions
and `webPageJsonLd({ title, description })` — six uses, one string each.

`opengraph-image.tsx`: `headline: ["A cmux alternative that runs", "Claude Code and Codex on projects."]`,
`subline: "Services, per-tab agent status, and one prompt fanned out to 50 project copies. Both free, both macOS."`,
`alt` = the H1 verbatim.

**Structured data** — exactly three entries: `webPageJsonLd` (with `about[]` and
`dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd`, `screenRecordingJsonLd("agent-duplicate-fanout")`.
`FAQPage` is emitted inline by `components/vs/faq.tsx`. No `ItemList` (§6.2 excludes it on
child pages), no `HowTo`, no page-level `SoftwareApplication`, no `Review`/`Product`.

`about: ["cmux alternatives", "parallel Claude Code agents", "parallel Codex agents", "AI agent terminal for macOS", "project-level service control"]`

---

## 2. Section outlines

Rendered order, matching the canonical /vs child order in part 2 of the spec:

`ComparisonHero → ComparisonBasis → QuickAnswer → VerdictCards → FanOut → SectionVideo →
Matrix (#matrix) → Migrate → WhenToPick → DemoSection → Faq → RelatedPages → Cta`

**One documented deviation from part 2's slot order.** Part 2 puts the page's clip at the
end of unique section B (slot 7, after the matrix). Part 4.4 instead assigns the clip to
unique section A — "Close with `SectionVideo`" appears at the end of the fan-out brief — so
the video sits between `FanOut` and the matrix. The per-page brief is the more specific
instruction and it reads better: the fan-out section describes Duplicate, and the clip
shows it before the reader reaches the table. Nothing else moves.

### Hero (`components/vs/comparison-hero.tsx`)

- eyebrow `cmux alternative · macOS`
- H1 `A cmux alternative that runs Claude Code and Codex on whole projects.`
- description (2026-09-23, replaces the reused meta `DESCRIPTION` so the hero has copy of
  its own): "cmux is a programmable terminal for agents. lpm is the project they work in: it
  starts the services, checks the ports, and can split the repo so each Claude Code or Codex
  session edits its own checkout."
- verdictLine `cmux owns the terminal. lpm owns the project the agents run inside.`
- `jumpHref="#matrix"`, `jumpLabel="Jump to the row-by-row table"`
- `downloadSource="vs-cmux-hero"`

### Comparison basis (`components/vs/comparison-basis.tsx`)

- `reviewed={VS_REVIEWED}` / `reviewedIso={VS_REVIEWED_ISO}` from `components/vs/reviewed.ts`
- sources, three, each fetched and read on the review date: cmux's documentation
  (`https://cmux.com/docs`), its configuration reference
  (`https://cmux.com/docs/configuration`), the cmux repository
  (`https://github.com/manaflow-ai/cmux`). The configuration page is new this pass: it is
  what the repo-config row and the `.cmux/cmux.json` mention rest on (R3).
- `lpmNote`: "Every cmux row traces to those three; lpm's own rows were read back out of
  the app's source that day. Tell us what has drifted."
- The spec's `lpmNote`, "cmux ships weekly; tell us where this is out of date.", is **cut**
  under R3 — a release-cadence claim about the competitor with nothing behind it.

### Quick answer (`components/vs/quick-answer.tsx`)

- H2 = the query: `Is there a cmux alternative that also runs my dev services?`
- Paragraph 1 is the extractable answer and names cmux first, not lpm.
- Paragraph 2: both free to use, both macOS-only, running both is normal. "free to use"
  rather than "free", because FAQ 2 names cmux's paid Founder's Edition.
- `CodeBlock filename="Three agents, one prompt"` — `lpm start api` /
  `lpm worktree api --count 3 --run claude --prompt "fix the flaky auth test"` /
  `lpm status --json`.

### Verdict cards (`components/vs/verdict-cards.tsx`)

Three equal-weight cards, no emerald, no highlight: cmux / lpm / Both. See §7 for how the
brief's two strings per card were fitted to the component's three required fields.

### Unique section A — `_components/fan-out.tsx`

- eyebrow `One prompt, three agents`, title `Where a tab stops being enough`,
  description "Three agent tabs in one folder are three agents editing the same files."
- Body paragraph: Duplicate turns the count into projects.
- Two cards: **Worktree** / **Standalone copy**.
- Honesty panel: ports and databases are not isolated — a check at the door, not a
  partition. In-body link to `/git-worktree-for-ai-agents` on "the isolation models
  compared". Re-voiced this pass: the spec's sentence shares a nine-word run with the
  ports/duplicate caveat mandated verbatim on `/vs/docker-compose` and three other
  siblings (R5), so this page states the same fact in its own words.
- The worktree card keeps the concession the ledger asks for and names the switch that
  undoes half of it: neither `.env` nor installed dependencies travel, and **Install
  dependencies** is the control (R6).

### Video (`components/vs/section-video.tsx`)

- eyebrow `See it`, title `One prompt, three project copies`, `clip="agent-duplicate-fanout"`.

### Feature matrix (`_components/matrix.tsx`, rendering `components/vs/feature-matrix.tsx`, `id="matrix"`, `scroll-mt-20`)

- the rows and the render moved into `_components/matrix.tsx` this pass, which is what
  `/vs/iterm2` already does; `page.tsx` drops from 399 lines to 294
- title `cmux and lpm, row by row`
- description "Seventeen rows. Two go to cmux — the browser it can script and the emulator
  underneath it." Seventeen is the row count since the 2026-09-23 PR row, two is the count
  of conceded rows, and naming them means no reader has to reverse-engineer the arithmetic
  (R2). The agent-CLI row stopped being a concession on 2026-09-23: the cmux README says any
  agent that runs in a terminal works, and so does lpm — any CLI runs in a tab or as an
  action — so the row is a tie; lpm's extra is presets for four.
- 17 rows, full table in §4
- footnote carries the two remaining in-body links (`/connect-ai-agents`,
  `/review-changes-in-terminal`) and now says whose rows they belong to — "Two of lpm's
  rows have a page behind them" — because the old wording, "Two of those rows", pointed
  back at the sentence about cmux's rows and linked two of lpm's

### Unique section B — `_components/migrate.tsx`

- eyebrow `Migration`, title `What carries over from cmux, and what does not`
- lead: `cmux.json` configures your terminal; `.lpm.yml` describes your stack
- two `CodeBlock`s (`~/.config/cmux/cmux.json`, `<repo>/.lpm.yml`)
- five-row equivalence list — the cmux side now names the real commands
  (`cmux list-workspaces`, `cmux notify`, a cmux action or custom command) instead of
  paraphrasing them
- then the §5.5 hedge footnote, corrected (see §8.10): the reading verbs that work with
  lpm closed are `lpm list` and `lpm logs`; `lpm status` is not one of them
- then "Keeping both is normal…"

### When to pick (`components/vs/when-to-pick.tsx`)

- `eyebrow="Which one to pick"` — passed explicitly to override the component's default
  `"Honest take"`, because part 4.4 requires every instance of "honest" and "no shade" to
  be gone from this page.
- `title="Terminal-first, or project-first"`. The earlier title, "When each one is the
  right tool", is the same seven words on four /vs pages — inside Rule 2's eight-word bar
  but exactly the templated feel this pass exists to remove (R5).
- five lpm points, three cmux points (§5).

### Interactive demo (`components/home/demo.tsx`)

Below the page's own footage, per part 2.

### FAQ (`components/vs/faq.tsx`)

Six items, all plain-string answers, so no `answerText` is needed anywhere (§6 of the FAQ
type union). Title `Questions about cmux and lpm` — the old title said "the honest FAQ".

### Related pages (`components/related-pages.tsx`)

The five §6.1 assigns — `/best-terminal-for-claude-code-and-codex`,
`/git-worktree-for-ai-agents`, `/connect-ai-agents`, `/review-changes-in-terminal`,
`/vs/iterm2` — plus `/mobile` ("Open a terminal tab running on your Mac, type into it, and
get a push when Claude Code or Codex is waiting on you"), added 2026-09-23: the migrate
section already promises "a push to your phone" for `lpm set-status`, and nothing linked the
app that receives it. Six cards fill the `lg:grid-cols-3` row.

### CTA (`components/vs/cta.tsx`)

`downloadSource="vs-cmux-cta"`. Title `Run your projects, your way.`

---

## 3. Hero-specific

| Field           | String                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Eyebrow         | `cmux alternative · macOS`                                              |
| H1              | `A cmux alternative that runs Claude Code and Codex on whole projects.` |
| Description     | see §2 Hero (own string since 2026-09-23)                               |
| Verdict line    | `cmux owns the terminal. lpm owns the project the agents run inside.`   |
| Jump link       | `Jump to the row-by-row table` → `#matrix`                              |
| Download source | `vs-cmux-hero`                                                          |

The H1 and the title both name **Claude Code** and **Codex** literally, which is the
binding rule for an agent-query page; the retired copy said "AI Agents".

---

## 4. Comparison matrix

`competitorName="cmux"`. lpm column first and highlighted, cmux second. Rows live in
`_components/matrix.tsx`.

| Capability                                   | lpm                                                                              | cmux                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Start, stop and restart a project's services | one click, or `lpm service web restart`                                          | not documented — you run the commands in a tab                                           |
| Bring up only the services one task needs    | a named profile per subset                                                       | not documented                                                                           |
| Ports checked before the stack starts        | ask, free, or fail per service                                                   | listening ports shown on the tab                                                         |
| Saved commands for migrate, seed and lint    | a project button, or `lpm run`                                                   | actions and custom commands in `cmux.json`                                               |
| Config that lives in the repo                | `.lpm.yml` you commit — services and profiles travel with the branch             | user-level `cmux.json`, plus `.cmux/cmux.json` per repo                                  |
| Drafts the config from your repo             | built in: package.json, Procfile, Gemfile, compose files and more, read when you add the repo; an AI redraft is optional | you write it |
| Isolated checkout per agent                  | linked Git worktree or standalone copy                                           | not documented                                                                           |
| Fan one prompt out to N agents               | 1–50 copies, the prompt queued on each                                           | no fan-out documented — one prompt per workspace                                         |
| Reports agent status back to the app         | Claude Code and Codex, via hooks lpm installs                                    | agent hooks, `cmux notify`, notification panel                                           |
| Agent CLIs it launches for you               | presets for Claude Code, Codex, Gemini CLI and OpenCode; any other CLI in a tab or as a one-click action | the same four, plus Aider, Cline, Goose, Amp and anything you type in a tab |
| Review the diff before you keep it           | side-by-side diff pane | no diff view documented |
| From changed files to an open pull request   | branch, commit, push and PR in one flow through the GitHub CLI, text drafted by your agent CLI; the PR link sits in the terminal footer | branch and linked PR status in the sidebar; opening a PR is not documented |
| Scriptable from outside the app              | the lpm CLI, with `--json` on nearly every verb                                  | cmux CLI + Unix socket                                                                   |
| Drive a browser from a script                | browser tabs, not scriptable                                                     | snapshot, click, type, evaluate JS                                                       |
| Terminal-emulator quality                    | a terminal built for services and agents                                         | libghostty rendering, vertical tabs, splits                                              |
| Work on a remote machine                     | SSH projects with port forwarding, or a paired Linux host driven from your Mac   | `cmux ssh user@remote`                                                                   |
| License, and what a paid tier buys           | MIT, nothing to buy                                                              | GPL-3.0-or-later, commercial terms on request, a paid Founder's Edition for early access |

**Conceded to cmux — two rows, and the matrix description names both:** _Drive a browser
from a script_ and _Terminal-emulator quality_, the "why people keep it as their terminal"
pair. _Agent CLIs it launches for you_ was the third until 2026-09-23; it is now a tie (see
§2 Feature matrix).

The earlier count of four also claimed _Work on a remote machine_. It is not a concession:
lpm's cell in that row describes an SSH project with port forwarding **and** a paired Linux
host, against `cmux ssh user@remote`, which reads as a tie at worst. Four rows conceded, on
a table where only three read that way, is exactly the mismatch R2 forbids. Three parity
rows sit alongside them — _Saved commands…_, _Reports agent status…_ and _Scriptable from
outside the app_ — and none of the three is counted, because neither column wins.

**Labels re-voiced this pass (R4 — no matrix label may be byte-identical to a sibling's):**

| Was                                    | Now                                         | Collided with               |
| -------------------------------------- | ------------------------------------------- | --------------------------- |
| `Run a subset of services (profiles)`  | `Bring up only the services one task needs` | `/vs/iterm2`                |
| `One-shot tasks (lint, migrate, seed)` | `Saved commands for migrate, seed and lint` | `/vs/iterm2`                |
| `License`                              | `License, and what a paid tier buys`        | `/vs/iterm2`, `/vs/foreman` |

`grep -rhoE 'label: "[^"]*"' app/vs | sort | uniq -d` now returns nothing from this page's
matrix — only `VerdictCards` labels (`lpm`, `Both`, a tool name) and `ComparisonBasis`
source labels, which R4 exempts.

**Cells corrected against the sources this pass (R1, R3):**

| Cell                                              | Was                                                    | Now, and why                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Saved commands…_ , cmux                          | `commands you type in a tab`                           | `actions and custom commands in cmux.json` — the configuration reference documents both, so the old cell understated the competitor and turned a parity row into a false win.                                                                                             |
| _Config that lives in the repo_, cmux             | `user-level cmux.json, with per-repo overrides`        | `user-level cmux.json, plus .cmux/cmux.json per repo` — the ledger left this contested and told the engineer to verify or fall back. Verified: ".cmux/cmux.json in a project for project-scoped actions and workspace commands".                                          |
| _Fan one prompt out to N agents_, cmux            | `one workspace at a time`                              | `no fan-out documented — one prompt per workspace` — cmux runs many workspaces at once and groups them in the sidebar; what it documents nowhere is a broadcast. The old cell was false in the direction that flattered lpm, which is the worst direction to be wrong in. |
| _Review the diff before you keep it_, cmux        | ✗                                                      | `branch and PR status on the tab; no diff view documented` — a bare ✗ asserts an absence no source can carry. This says what cmux does show and stops there.                                                                                                              |
| _Bring up only the services one task needs_, cmux | ✗                                                      | `not documented` — same reason.                                                                                                                                                                                                                                           |
| _Bring up only the services one task needs_, lpm  | ✓                                                      | `a named profile per subset` — a bare ✓ is a hard claim; naming the mechanism is checkable.                                                                                                                                                                               |
| _Scriptable from outside the app_, lpm            | `lpm CLI over a Unix socket, JSON on every command`    | `the lpm CLI, with --json on nearly every verb` — "every command" was wrong (14 of the ~20 subcommands take `--json`), and the old string was byte-shared with `/vs/iterm2`'s matrix (R5).                                                                                |
| _Agent CLIs it launches for you_, cmux            | a five-name list                                       | `the same four, plus Aider, Cline, Goose, Amp and anything you type in a tab` — the repository lists ten. This is the row cmux wins most clearly, so it is stated at full strength.                                                                                       |
| _License…_, both                                  | `MIT` / `GPL-3.0-or-later, commercial terms available` | `MIT, nothing to buy` / `GPL-3.0-or-later, commercial terms on request, a paid Founder's Edition for early access` — the repository names the tier; "paid subscription", which the spec's FAQ used, it does not.                                                          |

**Rows deleted this pass, per §5.3 / Rule 3:**

| Deleted row                                                              | Why                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `External socket / control API — lpm ✗`                                  | Flatly false and the worst error in the cluster: lpm exposes a CLI over `~/.lpm/lpm.sock` with 20+ verbs and `--json` on nearly every subcommand. Replaced by **Scriptable from outside the app** (both sides win something), and the row cmux genuinely wins — **Drive a browser from a script** — was added beside it. |
| `Portable, shareable config — cmux: GUI-first`                           | cmux is configured by files. Inverse of true. The corrected repo-config row covers the axis; the freed slot went to **Reports agent status back to the app**.                                                                                                                                                            |
| `Auto-detect stack on init — lpm ✓`                                      | Creating a project writes a placeholder service, not a detected stack. Replaced by **Drafts the config from your repo**, which names what actually does the work.                                                                                                                                                        |
| `Platforms — macOS / macOS`                                              | An identical row teaches nothing.                                                                                                                                                                                                                                                                                        |
| `Primary object`, `Per-project config`                                   | Banned labels (Rule 3) and byte-identical with `/vs/iterm2`.                                                                                                                                                                                                                                                             |
| `Embedded browser`, `Native SSH workspaces`, `Pre-built agent hooks (…)` | Re-cut as **Drive a browser from a script**, **Work on a remote machine**, and the two-row hooks/CLIs split mandated by §5.4.                                                                                                                                                                                            |

Engineer notes: `FeatureMatrix` highlights the lpm column, wraps the desktop table in
`overflow-x-auto` and switches to a card list below `md`, so 390px needs nothing extra from
this page.

---

## 5. When to pick

`eyebrow="Which one to pick"`, `title="Terminal-first, or project-first"`,
description "Both are macOS-native and open source. The split is which half of the agent
workflow you want the tool to own."

**Pick lpm** — "You want one switcher that owns starting, stopping, duplicating, and
switching whole projects."

1. You want the whole project to come up with the agent: services, profiles, a port check at start, and a diff pane before you keep anything.
2. You keep several repos in play at once and want one window that already knows each one's services and which agents are busy in it. _(re-voiced this pass: the old line, inherited from the retired page, shared a run with `/vs/tmux`)_
3. You want lpm to list the services as the repo is added, with an agent CLI on hand for a second draft. _(2026-09-23: rewritten — the first draft is built in now, `detect/mod.rs:1-4`)_
4. You want the services in a file the branch carries, so a teammate on that branch gets the same stack.
5. You fan one prompt out to several copies of the repo, each agent on its own checkout.

**Pick cmux** — "You want a native macOS terminal with agent ergonomics baked in."

1. You want the terminal itself to be programmable: vertical tabs, splits, a browser pane your scripts can click through, and `cmux.json` behind all of it.
2. You want libghostty rendering, and your Ghostty theme and font to carry over.
3. Your work is one repo at a time, and project juggling isn't your bottleneck.

cmux point 1 no longer says "one config file for all of it": the configuration reference
documents a second, project-scoped file, so the old clause was wrong about the competitor in
the competitor's own column.

Deleted per §5.4: "You want a fully free tool with no commercial-license tier" (true, but it
is the line most likely to be quoted back on a page that used to promise "no shade") and
"You're fine writing a `cmux.json` by hand for each project" (describes work cmux users do
not do).

---

## 6. FAQ (6 Q&A, plain text for JSON-LD)

All six answers are plain strings, so `FaqItem`'s union needs no `answerText`.

1. **What is cmux?** — A native macOS terminal from Manaflow built around AI coding agents: vertical tabs showing branch and PR status, split panes, a notification panel, a scriptable browser pane, and a CLI plus Unix socket to control all of it. It renders through libghostty and reads your Ghostty config for themes and fonts.
2. **Is cmux free and open source?** — Yes. cmux ships under GPL-3.0-or-later; its repository adds that commercial terms may be available where the GPL will not do, and that a paid Founder's Edition buys early access to features still in progress. lpm is MIT and has nothing to buy. Cost is not the reason to choose between them.
3. **Can I run several Claude Code or Codex agents at once?** — In cmux each agent gets its own tab, so two agents in the same folder still edit the same files. lpm splits the repo first — up to 50 copies at a time, each one a linked worktree on a branch of its own or a full folder copy that keeps its Git history — and queues the same prompt in every copy, with working, needs you, done or a problem on the agent tab that owns it. What the copies still share is ports and databases.
4. **Can lpm and cmux run side by side?** — Yes, and it is a reasonable setup. cmux configures your terminal; lpm describes your projects. Neither reads the other's config.
5. **How do I move a cmux setup to lpm?** — There is nothing to convert: cmux.json describes your terminal, not your stack. Add the folder in lpm and it lists the services it finds in the repo — package.json scripts, a Procfile or Gemfile, compose files — for you to prune, with Generate with AI in the config editor if you want another draft. A command you kept as a cmux action becomes an lpm action: one click, or lpm run. (2026-09-23: this is the FAQPage JSON-LD text too.)
6. **Does lpm need tmux?** — No — and cmux does not need it either. lpm never puts your services inside tmux and does not require it on the machine: the services keep running when you quit lpm, reopening the app picks them up again, and there is no .tmux.conf anywhere in that.

**Rewritten against the source this pass, not kept as the spec wrote them:**

- **FAQ 2** said "a paid subscription for early-access features"; the repository sells a
  Founder's Edition and never calls it a subscription. Its GPL clause also shared an
  eight-word run with the hub's FAQ (R5), so the sentence is re-voiced as well as corrected.
- **FAQ 3** scopes the badges to the agent's tab. The four states ride on agent and terminal
  tabs (`PaneView.tsx:415-434`); a service tab shows its name and ports, which is the exact
  over-scope §5.3 killed on `/vs/iterm2`. "error" is also written as "a problem", the word
  the app itself puts on that state (`agentStatus.ts:14-20`). Its worktree clause is
  re-voiced too: the old one shared eight words with `/vs/iterm2`.
- **FAQ 5** says **Generate with AI**, which is what the control reads
  (`ConfigEditor.tsx:182-183`). "press Generate" was both a label that does not exist and an
  eight-word overlap with `/vs/docker-compose`.
- **FAQ 6** drops "lpm has its own session layer" — an implementation noun the checklist
  bans — and states the claim the ledger mandates as a dependency claim: lpm does not put
  services inside tmux and does not need it installed. It never says "nothing checks for
  tmux", which R1 rules false as an absolute.

---

## 7. Claims table — every lpm claim, with a source

Paths are relative to the repo root. `desktop/` is `desktop/frontend/src-tauri/src/` for
Rust and `desktop/frontend/src/` for TypeScript, spelled out per row.

| Claim as it ships                                                                                                                                                                                 | Where it appears                                                                                     | Cited at                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One click starts a project; `lpm service web restart` restarts one service by name                                                                                                                | matrix row 1                                                                                         | `desktop/frontend/src/components/ProjectDetail.tsx:500`; `desktop/frontend/src-tauri/src/services.rs:466`, `:508`; `cli/src/main.rs:150-162`                                                                                                                                                                                                                                                                                                                        |
| A named profile starts one subset of the services                                                                                                                                                 | matrix row 2 (the cell reads "a named profile per subset", not a bare ✓); verdict card; WhenToPick 1 | `desktop/frontend/src-tauri/src/config.rs:809` (`profiles: BTreeMap<String, Vec<String>>`); `cli/src/main.rs:133-138` (`lpm start --profile`)                                                                                                                                                                                                                                                                                                                       |
| Declared ports are checked before a project starts, with an ask / free / fail policy per service, and the holding process named                                                                   | matrix row 3; QuickAnswer; FanOut honesty panel; verdict card                                        | `desktop/frontend/src-tauri/src/ports.rs:1-8`, `:26`; `desktop/frontend/src-tauri/src/config.rs:574-577`                                                                                                                                                                                                                                                                                                                                                            |
| A saved command is a button in the project, or `lpm run`; a copy of the project inherits its parent's actions                                                                                     | matrix row 4; Migrate row 5 and its note                                                             | `desktop/frontend/src/components/ActionButton.tsx:1-13`; `cli/src/main.rs:320-338`; `desktop/frontend/src-tauri/src/config.rs:1549-1552` ("resolve_actions already inherits actions from the parent")                                                                                                                                                                                                                                                               |
| A committed `.lpm.yml` carries services and profiles with the branch                                                                                                                              | matrix row 5; Migrate lead + right CodeBlock; WhenToPick 4                                           | `desktop/frontend/src-tauri/src/config.rs:1508-1520` (`load_repo_yaml`), `:1523-1546` (`merge_repo_services_profiles`)                                                                                                                                                                                                                                                                                                                                              |
| lpm drafts the service list itself when the repo is added (matrix "built in: package.json, Procfile, Gemfile, compose files and more, read when you add the repo; an AI redraft is optional", FAQ 5, WhenToPick 3, CTA "Add a repo, let lpm list its services") | matrix row 6; FAQ 5; WhenToPick 3; Cta | `desktop/frontend/src-tauri/src/projects_crud.rs:48-67`, `:93`, `:261`; `detect/mod.rs:1-4` (no AI, no network), `:111-130`; `detect/stacks.rs:21-39` (Procfile), `:41-52` (Gemfile), `:169-179` (compose); `desktop/frontend/src/store/adoptProject.ts:41` (toast). Redraft: `aigen.rs:33-41`, `ConfigEditor.tsx:183` ("Generate with AI") |
| A copy per agent is either a linked worktree branched off the current commit (was "where the code stands now", which implied uncommitted edits come along), or a straight copy of the folder that keeps its own Git history                                              | matrix row 7; QuickAnswer; FanOut cards; FAQ 3                                                       | worktree: `desktop/frontend/src-tauri/src/projects_crud.rs:514-522` (`git worktree add -b <branch> <root> HEAD`); standalone: `:754-759` (`cp_clone` of the whole tree, then `.git/worktrees` registrations dropped, so the copy is its own repository)                                                                                                                                                                                                             |
| A worktree carries tracked files only — neither `.env` nor `node_modules` — and flipping on **Install dependencies** runs npm, yarn, pnpm or bun install in each copy | FanOut card 1 | `projects_crud.rs:828` (`create_linked_worktree`), `:851-854` (`reinstall_deps` → `package_manager_of` → `run_install`); `detect/node.rs:123-127` (only when `package.json` exists), `:77-84` (the four install commands); `BulkDuplicateDialog.tsx:937` ("Install dependencies" for a worktree). 2026-09-23: "installed dependencies" narrowed — nothing but Node packages is ever installed. |
| Two agents can attempt the same branch in standalone copies                                                                                                                                       | FanOut card 2                                                                                        | `desktop/frontend/src-tauri/src/projects_crud.rs:747-759` — an independent repository per copy, so Git's one-checkout-per-branch rule does not apply                                                                                                                                                                                                                                                                                                                |
| 1–50 copies, with the prompt queued on each                                                                                                                                                       | matrix row 8; QuickAnswer CodeBlock; FanOut body; verdict card; FAQ 3                                | `desktop/frontend/src/components/BulkDuplicateDialog.tsx:41-42` (`MAX_COUNT = 50`); `cli/src/main.rs:242-246`, `:260-262`, `:281-285`, `:300-302`; `desktop/frontend/src-tauri/src/socketsrv.rs:15-18`                                                                                                                                                                                                                                                              |
| Every copy inherits the project's services and actions                                                                                                                                            | FanOut body                                                                                          | `desktop/frontend/src-tauri/src/config.rs:1548-1576` (`merge_parent_services_profiles`; the doc comment records that actions already inherit)                                                                                                                                                                                                                                                                                                                       |
| Agent status is reported back by Claude Code and Codex, through hooks lpm installs                                                                                                                | matrix row 9; verdict card; FAQ 3                                                                    | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (Claude Code and Codex only); `desktop/frontend/src-tauri/src/socketsrv.rs:3-8`                                                                                                                                                                                                                                                                                                                                       |
| The four states are working, needs you, done and a problem, shown on the agent's own tab                                                                                                          | verdict card; FAQ 3                                                                                  | `desktop/frontend/src/agentStatus.ts:12-20` — `AGENT_STATE_LABEL` reads Working / Needs you / Done / **Problem**, hence "a problem" rather than "error"; `desktop/frontend/src/components/PaneView.tsx:415-434` puts the badges on agent and terminal tabs, while a service tab renders name + ports (`:382-397`), so the copy no longer says "every tab"                                                                                                           |
| The sidebar shows what each agent is doing                                                                                                                                                        | FanOut body                                                                                          | `desktop/frontend/src/components/SidebarAgentRows.tsx:2`, `:63`, `:87`; `desktop/frontend/src/components/sidebarRollup.ts:56`; `desktop/frontend/src/agentStatus.ts:12-20`                                                                                                                                                                                                                                                                                          |
| lpm launches Claude Code, Codex, Gemini CLI and OpenCode                                                                                                                                          | matrix row 10                                                                                        | `desktop/frontend/src/types.ts:247`, `:295-320`; `desktop/frontend/src-tauri/src/aigen.rs:28-44`                                                                                                                                                                                                                                                                                                                                                                    |
| A side-by-side diff pane reviews changes before you keep them                                                                                                                                     | matrix row 11; verdict card; WhenToPick 1                                                            | `desktop/frontend/src/components/review/DiffReviewPane.tsx:67-71`, `:536`, `:607-609`                                                                                                                                                                                                                                                                                                                                                                               |
| The lpm CLI drives the app from outside, with `--json` on nearly every verb                                                                                                                       | matrix row 12; QuickAnswer; Migrate row 3                                                            | `desktop/frontend/src-tauri/src/socketsrv.rs:1-38` (20+ verbs on `~/.lpm/lpm.sock`); `cli/src/control.rs:1-19`; `grep -c "json: bool" cli/src/main.rs` = 14 of roughly 20 subcommands — "nearly every verb", not "every command"                                                                                                                                                                                                                                    |
| The socket takes one shell-quoted command per line                                                                                                                                                | Migrate row 3                                                                                        | `desktop/frontend/src-tauri/src/socketsrv.rs:1-6`, `:24-30`                                                                                                                                                                                                                                                                                                                                                                                                         |
| Browser panes sit beside terminals but are not scriptable                                                                                                                                         | matrix row 13                                                                                        | `desktop/frontend/src/components/BrowserPane.tsx:1-18` — open, navigate, back, forward, reload, theme, close; no scripting surface                                                                                                                                                                                                                                                                                                                                  |
| A terminal built for services and agents (10,000 lines of scrollback, eight themes)                                                                                                               | matrix row 14                                                                                        | `desktop/frontend/src/components/Pane.tsx:54-60`; `desktop/frontend/src/terminal-themes.ts:1-10`                                                                                                                                                                                                                                                                                                                                                                    |
| Remote work is an SSH project with port forwarding, or a paired Linux host driven from your Mac                                                                                                   | matrix row 15                                                                                        | `desktop/frontend/src-tauri/src/config.rs:596-612` (`SshSettings`, `is_remote`); `desktop/frontend/src-tauri/src/portforward.rs:1-8` (manual forwarding works end to end); `desktop/frontend/src-tauri/src/peerssh.rs:44-53`                                                                                                                                                                                                                                        |
| MIT, and macOS-only                                                                                                                                                                               | matrix row 16; FAQ 2; Cta                                                                            | `LICENSE:1`; `desktop/frontend/src-tauri/tauri.conf.json:31-42` (`app` + `dmg` targets, macOS bundle settings only)                                                                                                                                                                                                                                                                                                                                                 |
| No tmux, no `.tmux.conf`; services survive quitting the app and are found again on relaunch                                                                                                       | FAQ 6                                                                                                | `desktop/frontend/src-tauri/src/sessiond.rs:1-13`; `desktop/frontend/src-tauri/src/tmuxmigrate.rs:12`, `:18-20`                                                                                                                                                                                                                                                                                                                                                     |
| `lpm list --json`, `lpm status --json`, `lpm set-status`, `lpm start`, `lpm worktree --count 3 --run claude --prompt …`, `lpm duplicate`, `lpm logs`, `lpm run` all exist as written              | QuickAnswer CodeBlock; Migrate rows and footnote                                                     | `cli/src/main.rs:89-94`, `:123-130`, `:131-141`, `:184-201`, `:239-277`, `:278-307`, `:320-338`; `cli/src/main.rs:106-121` (`logs`, `-n` capped at 10,000)                                                                                                                                                                                                                                                                                                          |
| A badge on the tab, a chime, a macOS banner when you are away from the window, and a push to your phone                                                                                           | Migrate row 2                                                                                        | `desktop/frontend/src-tauri/src/statusnotify.rs:1-6`, `:17-33`; `desktop/frontend/src-tauri/src/sound.rs:9-17`                                                                                                                                                                                                                                                                                                                                                      |
| `lpm start`, `lpm worktree`, `lpm service … restart` and `lpm run` are routed through the app; `lpm list` and `lpm logs` answer whether lpm is open or closed; `lpm status` needs the app as well | Migrate footnote                                                                                     | `cli/src/control.rs:12-19` (`require_app`, "lpm app is not running — start it to control projects"), called from `cli/src/start.rs:16`, `cli/src/duplicate.rs:48`, `cli/src/service_cmd.rs:50`, `cli/src/run.rs:140`; `cli/src/list.rs:39-45` reads the running sessions itself and `cli/src/logs.rs:75-110` captures a pane directly, with no `require_app` in either; `cli/src/status.rs:14-21` pings first and prints "lpm app is not running — no live status." |
| One visual switcher across local projects, with each project's services and agents on it                                                                                                          | WhenToPick 2                                                                                         | `desktop/frontend/src/components/Sidebar.tsx:1-12`; `desktop/frontend/src/components/SidebarAgentRows.tsx:1-6`; `desktop/frontend/src/store/app.ts:1030-1040` (`startProject` per project)                                                                                                                                                                                                                                                                          |
| Ports and databases are still shared; each declared port is checked as the copy comes up and whatever already holds one is named — a check at the door, not a partition                           | FanOut honesty panel; FAQ 3                                                                          | `desktop/frontend/src-tauri/src/ports.rs:1-8` is detection only, feeding the start dialog; `desktop/frontend/src-tauri/src/portsprobe.rs` (`lookup_holders`); `desktop/frontend/src-tauri/src/config.rs:574-577` shows `port` is a declared integer with an `ask` / `free` / `fail` policy and no allocation path (`desktop/frontend/src/types.ts:24`)                                                                                                              |

Every **cmux** claim on the page traces to one of the three `ComparisonBasis` sources, and
all three were fetched and read on the review date (R3):

| cmux claim, as it ships                                                                                                                                                                                                                                                                                                                                                         | Source                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Vertical tabs carrying git branch, linked PR status and listening ports; split panes; the notification panel; `cmux notify`; `cmux ssh user@remote`; libghostty rendering and the `~/.config/ghostty/config` it reads for themes and fonts; a browser pane a script can navigate, snapshot, click, type in and evaluate JS in; a CLI and socket over "every action"; macOS only | the cmux repository         |
| `cmux list-workspaces` and `cmux notify` as CLI verbs; "a socket-based control API"; workspace groups as sidebar organisation — nesting, collapsing, pinning — with no broadcast and no file isolation                                                                                                                                                                          | cmux's documentation        |
| `~/.config/cmux/cmux.json` holding "app-owned settings, shortcuts, actions, custom commands, and workspace layouts", and ".cmux/cmux.json in a project for project-scoped actions and workspace commands"                                                                                                                                                                       | its configuration reference |
| The agent CLIs it launches — Claude Code, Codex, OpenCode, Gemini CLI, Kiro, Aider, Goose, Amp, Cline, Cursor Agent; the matrix names six of the ten                                                                                                                                                                                                                            | the cmux repository         |
| GPL-3.0-or-later, "commercial terms may be available" where an organisation cannot comply, and a paid Founder's Edition sold on early access                                                                                                                                                                                                                                    | the cmux repository         |

Where cmux documents no project-level service lifecycle, no service subset, no worktree
creation, no prompt fan-out and no diff view, the cell says **"not documented"** or names
what cmux does put on the tab instead — never a guessed workaround (Rule 5), and never a
bare ✗, which asserts an absence no source can carry (R3).

---

## 8. Notes for engineers copying this file

- Files: `page.tsx`, `_components/fan-out.tsx`, `_components/matrix.tsx`,
  `_components/migrate.tsx`, `opengraph-image.tsx`, this file. Nothing under
  `components/vs/` or `lib/` was touched. `_components/matrix.tsx` is new in the second
  pass: `page.tsx` had reached 399 lines, and moving the 16-row array plus the
  `FeatureMatrix` render out of it leaves 294.
- Path constant: `vsPath("cmux")` from `@/lib/links`. Canonical `https://lpm.cx/vs/cmux`.
- No new route, so `app/sitemap.ts` and `lib/sitemap-dates.json` need nothing (§6.3).
- Analytics: `vs-cmux-hero` on the hero, `vs-cmux-cta` on the CTA. The GitHub links keep
  `vs-hero` / `vs-cta` from inside the shared components.
- No emerald anywhere in this page's own files. Every colour is defined in the light
  variant first and repeated under `dark:`.
- 390px: the matrix supplies its own `overflow-x-auto` and mobile card list; both
  `CodeBlock`s scroll inside their `<pre>`; the fan-out and verdict grids are one column
  below `sm`/`md`; the equivalence rows wrap.

### Copy this file added, because the component API or the placement required it

1. **VerdictCards' third field.** Spec §3.2 makes `label`, `title` and `body` all required,
   but part 4.4 supplies two strings per card. Rather than invent a third sentence, the
   brief's heading was split at its own em dash — `cmux — the terminal` becomes label
   `cmux` + title `The terminal`, and `lpm — the project` becomes `lpm` + `The project`.
   The third card keeps the brief's `Both` as its label and takes its title from §3.2's own
   name for that card, `Run both`. No new claim, no new sentence.
2. **`jumpLabel`** — "Jump to the row-by-row table". The spec mandates the jump link but
   supplies no label.
3. **`WhenToPick` eyebrow** — "Which one to pick", passed to override the component's
   default "Honest take", which part 4.4 bans on this page.
4. **`Faq` title** — "Questions about cmux and lpm", replacing "the honest FAQ".
5. **Matrix footnote** — one sentence carrying the two in-body links the brief requires
   from the _Scriptable from outside the app_ and _Review the diff before you keep it_
   rows. Matrix cells are plain strings, so a link cannot live inside a cell; the footnote
   is the only place it can go.
6. **"See" before the fan-out link.** The brief gives the anchor text
   "the isolation models compared" but no carrier sentence, so it is introduced with a
   single word.
7. **Three `WhenToPick` lpm points were rewritten, not kept.** "You want lpm to read your
   repo and generate a working config" is the false claim §5.3 rules out (and it is
   near-identical to a line on `/vs/iterm2`); "not settings locked inside a GUI" is the
   "GUI-first" shade §5.3 rules false; "duplicating a project to run a second agent in
   parallel without conflicts" overclaims isolation the app does not provide. The
   replacements are cited in §7.
8. **CTA description** — "lpm is free under MIT and macOS-only. Add a repo, draft its
   services with the agent CLI you already have, and keep cmux open beside it." An earlier
   draft read "Point it at a repo, press Start", which is the zero-config start §5.3 rules
   false: creating a project writes a placeholder service, so a repo does not start until
   the services exist. The replacement points at the mechanism that does the work and is
   cited in §7.
9. **RelatedPages card titles and descriptions.** The spec assigns the five destinations,
   not their card copy.
10. **The §5.5 "keep lpm open" hedge, in this page's own words**, as the last line of
    Migrate: "Anything in the right-hand column that changes state — `lpm start`,
    `lpm worktree`, `lpm service web restart`, `lpm run` — is routed through lpm itself, so
    leave the app open when a script calls one. `lpm list` and `lpm logs` read the running
    services themselves, so they answer whether lpm is open or closed. The exception among the
    readers is `lpm status`, which prints what your agents are doing: the app is where those
    states are kept." Required because the QuickAnswer `CodeBlock` ships `lpm start` and
    `lpm worktree`, which error from a cold shell. It is **not** the verbatim §5.5 sentence:
    that one is mandated on four siblings, and its second half names an internal component
    the checklist bans from user-facing copy.
11. **Migrate's cmux column names cmux's own verbs.** `cmux list-workspaces` and
    `cmux notify` are documented commands, so the rows say them instead of paraphrasing
    ("list workspaces", "notify when a task ends"), and the last row starts from "a cmux
    action or custom command" rather than "a command you ran in a tab" — cmux saves those,
    so pretending it does not was a free shot at the competitor.
12. **The left-hand `CodeBlock` comment** now lists what `cmux.json` actually holds and
    notes `.cmux/cmux.json`, replacing "one file for every project", which the
    configuration reference contradicts.

### Second pass: where the spec's copy was overruled, and by what

The first pass shipped part 4.4 verbatim wherever the spec and the source disagreed. R1
reverses that order, so the following changed. Each one is a rewrite towards something a
reader can check, and none of them softens a concession.

- **R1 — the reading verbs.** Migrate's hedge said "The reading verbs, `lpm list` and
  `lpm status`, answer from any shell." `cli/src/status.rs:14-21` pings the app first and
  prints "lpm app is not running — no live status.", so `lpm status` is not one of them.
  The two that genuinely read without the app are `lpm list` (`cli/src/list.rs:39-45`) and
  `lpm logs` (`cli/src/logs.rs:75-110`); the footnote now says exactly that, and names
  `lpm run` among the verbs that need the app.
- **R1 — tmux.** FAQ 6 no longer explains lpm's internals ("its own session layer"). It
  makes the dependency claim the ledger mandates, in this page's voice, and it never says
  "nothing checks for tmux" — an absolute R1 rules false.
- **R1 — the badge scope.** The verdict card said "on every tab" and FAQ 3 "per tab". A
  service tab shows its name and ports (`PaneView.tsx:382-397`); the states ride on agent
  and terminal tabs (`:415-434`). Both now say the agent's own tab, and both use the app's
  own word for the fourth state, "a problem" (`agentStatus.ts:14-20`).
- **R2 — the concession count.** "Four rows below go to cmux" against a table that reads as
  three. The description now says three and names them, so the arithmetic is visible. The
  matrix footnote's "Two of those rows" also pointed at the cmux sentence while linking two
  of lpm's rows; it now says "Two of lpm's rows".
- **R3 — the unsourced competitor claims.** `lpmNote`'s "cmux ships weekly" is cut: a
  release-cadence claim with no source. Two bare ✗ cells became statements of what is
  documented. Everything else about cmux was verified against the three sources, one of
  which — the configuration reference — was added because the `.cmux/cmux.json` claim needed
  it.
- **R4 — three row labels re-voiced.** `Run a subset of services (profiles)`,
  `One-shot tasks (lint, migrate, seed)` and `License` all collided with `/vs/iterm2`
  (`License` with `/vs/foreman` too). Rewritten in cmux's vocabulary; see §4. The reviewer
  was right that `Work on a remote machine` is **not** duplicated — `/vs/overmind` ships
  "Running it on a remote dev box".
- **R5 — five shared prose runs, all rewritten on this side.** The worktree/standalone
  phrase (QuickAnswer and FAQ 3, shared with `/vs/iterm2`), the
  `lpm CLI over a Unix socket` cell (shared with `/vs/iterm2`'s matrix), FAQ 5's "press
  Generate" clause (shared with `/vs/docker-compose`), the ports/duplicate caveat in FanOut
  (a nine-word run with `/vs/docker-compose`'s matrix), and the GPL clause in FAQ 2 (shared
  with the hub). The facts are unchanged; two of the five got more accurate in the rewrite.
  Also re-voiced, below the eight-word bar but templated: the `WhenToPick` title, the
  "multiple local projects" bullet, and "Claude Code or Codex to draft the".
- **R6 — the hedge the spec asked for, shipped.** The worktree card concedes that a linked
  worktree brings neither `.env` nor installed dependencies, and names the switch that
  installs them.
- **Section order.** `SectionVideo` sits between FanOut and the matrix, following part 4.4's
  "Close with `SectionVideo`" rather than part 2's slot 7. `/vs/overmind` read its brief the
  same way. Left as is; part 2 permits a documented deviation and §2 carries the reason. If
  the cluster wants uniformity, it is a two-line move in `page.tsx`.
- **OG headline still drops one word from the H1.** Part 4.4 specifies
  "Claude Code and Codex on projects." while the H1 says "on whole projects.". Adding the
  word takes that line to 40 characters at 84px, level with the longest line in the cluster,
  so the risk of clipping the image outweighs the parity. `alt` and both title strings match
  the H1 verbatim.

## Truth pass, 2026-09-23

| Claim as it ships | Where | Source |
| --- | --- | --- |
| "presets for Claude Code, Codex, Gemini CLI and OpenCode; any other CLI in a tab or as a one-click action" | matrix, Agent CLIs row | presets: `desktop/frontend/src-tauri/src/firstlaunch.rs:22-36` (Claude and Codex seeded as global actions), `desktop/frontend/src/components/project-detail/useProjectSuggestions.ts:47-66` (Gemini CLI and OpenCode suggested when on PATH); any CLI: an action is a free `cmd` string (`config.rs:569-582`) and a terminal tab is a login shell |
| "branch, commit, push and PR in one flow through the GitHub CLI, text drafted by your agent CLI; the PR link sits in the terminal footer" | matrix, PR row (new) | `desktop/frontend/src/autoPR.ts:3-33` (`branch → commit → push → pr` steps; `generateBranchName`, `generateCommitMessage`, `generatePRTitle`, `generatePRDescription`), `desktop/frontend/src/components/AutoPRModal.tsx:160-173` (generators take the chosen agent `cli`; `CreatePullRequest`), `desktop/frontend/src-tauri/src/git.rs:1352`, `:1374` (`gh`); footer link: `desktop/frontend/src/components/TerminalFooter.tsx:59` (`BranchPrLink`) |
| cmux: "branch and linked PR status in the sidebar; opening a PR is not documented" | matrix, PR row | the cmux README — "Sidebar shows git branch, linked PR status/number, working directory, listening ports, and latest notification text"; no PR-creation, commit or push command is documented (re-read 2026-09-23) |
| "Open a terminal tab running on your Mac, type into it, and get a push when Claude Code or Codex is waiting on you" | RelatedPages `/mobile` card | `mobile/` (lpm Link: live terminal mirroring with a keyboard); push for needs-you comes from the same agent-status hooks, which exist for Claude Code and Codex only (`hooks.rs:1-9`) |
| Hero: "it starts the services, checks the ports, and can split the repo so each Claude Code or Codex session edits its own checkout" | hero description | `services.rs:1-7`; `ports.rs:1-8`; `projects_crud.rs:828` (worktree), `BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`) |

Counts after this pass: **seventeen rows, two to cmux** — matrix description only (no other
surface on this page repeats the number). Also rewritten because detection made them false:
the matrix drafting cell, FAQ 5 (and its JSON-LD), WhenToPick bullet 3 and the CTA ("Add a
repo, let lpm list its services, and keep cmux open beside it").

## Verifier pass — 2026-09-23

- Verdict "The project": "read working, needs you, done or a problem off each agent's own tab" → "…off each Claude Code or Codex tab". Only those two CLIs get status hooks (`hooks.rs:1-9`); Gemini CLI and OpenCode launch from presets but report nothing.
- QuickAnswer: the worktree is "branched off the current commit" (`projects_crud.rs:564-577`, `git worktree add -b <branch> <root> HEAD`) — uncommitted edits stay behind; the standalone copy is the one that takes the folder as it sits on disk (`projects_crud.rs:464-487` `cp_clone`).
- cmux README re-read 2026-09-23: GPL-3.0-or-later, commercial terms "may be available", Founder's Edition for early access; sidebar shows "git branch, linked PR status/number, working directory, listening ports"; no PR creation documented; browser pane can "snapshot the DOM, click, type, evaluate JavaScript"; `cmux ssh user@remote`; libghostty + Ghostty config; tmux optional (`cmux local-tmux`).
