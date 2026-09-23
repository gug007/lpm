# /vs/overmind — Content & Copy Plan

Page route: `/vs/overmind`
Target primary keyword: **overmind alternative mac** (always paired with "Procfile" — `overmind alternative` bare collides with overmindtech, the Terraform SaaS, and overmind.js)
Intent: a developer who runs `overmind start` against a Procfile on a Mac, knows tmux is a prerequisite of that setup, and wants to know whether a GUI can hold the same per-process control — plus exactly what the conversion costs.

**Angle:** the conversion, line for line, and the four rows Overmind wins outright. This page is written in Procfile-runner vocabulary (`overmind connect`, `-m web=2,worker=3`, `-p` / `-P`, `-l`, `OVERMIND_PROCESSES`, `.overmind.env`). It does not argue the multiplexer case (that is `/vs/tmux`), the interleaved-stream case (that is `/vs/foreman`), or the container case (that is `/vs/docker-compose`).

Source of truth: `vs-upgrade-spec.md` part 4.7, plus part 5's ledger. Every string below that the spec supplied is used verbatim except where §11 records a deviation.

---

## 1. Metadata

```ts
title: "Overmind Alternative for Mac: Procfile in a GUI"
// 47 chars (renders 53 with the layout's " — lpm")

description: "Overmind runs your Procfile through tmux. lpm runs the same lines as clickable panes in a Mac app with no tmux installed — plus the conversion in full."
// 151 chars

keywords: [
  "overmind procfile alternative",
  "overmind alternative mac",
  "overmind vs lpm",
  "overmind procfile.dev",   // 2026-09-23: was "overmind vs foreman", which /vs/foreman owns
  "procfile gui",
  "procfile runner mac",
  "run procfile without tmux",
  "overmind connect alternative",
  "darthsim overmind",
  "procfile without tmux",
]
// 10 entries

alternates.canonical: "/vs/overmind"

openGraph.title: TITLE            // same const
openGraph.description: DESCRIPTION
openGraph.type: "website"
openGraph.url: "/vs/overmind"
openGraph.siteName: "lpm"

twitter.card: "summary_large_image"
twitter.title: TITLE
twitter.description: DESCRIPTION
```

`title: { absolute: … }` is gone. `TITLE` and `DESCRIPTION` are declared once and used in `metadata.title`, `openGraph.title`, `twitter.title`, both descriptions and `webPageJsonLd({ title, description })`.

**OG image** (`opengraph-image.tsx`, edited in place — the file already existed):
- `headline: ["An Overmind alternative for Mac", "— your Procfile as live panes."]`
- `subline: "Restart any one process with no tmux installed, and the Procfile imported line by line when you add the folder."` (2026-09-23: "the same per-process control" overclaimed — there is no `overmind connect` equivalent — and the conversion is now automatic.)
- `alt: "An Overmind alternative for Mac — your Procfile as live panes, no tmux."` (matches the H1)

---

## 2. Section order

| # | Section | Component |
|---|---|---|
| 1 | Hero | `components/vs/comparison-hero.tsx` — `downloadSource="vs-overmind-hero"`, `jumpHref="#procfile"` |
| 2 | Comparison basis | `components/vs/comparison-basis.tsx` — `VS_REVIEWED` / `VS_REVIEWED_ISO` |
| 3 | Quick answer | `_components/answer.tsx` → shared `QuickAnswer` |
| 4 | Verdict cards | shared `VerdictCards` (data in `page.tsx`) |
| 5 | **Unique A** — "Your Procfile, line for line" | `_components/procfile.tsx`, `id="procfile"` |
| 6 | Video | shared `SectionVideo`, `clip="start-project"` |
| 7 | Feature matrix | `_components/differences.tsx` → shared `FeatureMatrix`, `id="matrix"` |
| 8 | **Unique B** — "Every overmind command, translated" | `_components/command-translation.tsx` → shared `CommandMap` |
| 9 | When to pick | shared `WhenToPick` |
| 10 | Interactive demo | `DemoSection` |
| 11 | FAQ | shared `Faq`, 6 items |
| 12 | Related pages | shared `RelatedPages`, 6 links |
| 13 | CTA | shared `Cta` — `downloadSource="vs-overmind-cta"` |

**Documented deviation from the canonical order (part 2 requires the reason to be written here):** the canonical order puts the page's clip at the end of unique section B (slot 7). Part 4.7 instead instructs the conversion section to "Close with `SectionVideo`", so the clip sits directly after unique section A and before the matrix. Following the per-page brief: the footage shows a project starting every service in its own pane, which is the payoff of the conversion the reader has just been shown, and it would be a non-sequitur after the command map.

---

## 3. Hero

- **eyebrow:** `lpm vs Overmind`
- **H1:** `An Overmind alternative for Mac — your Procfile as live panes, no tmux.`
- **description:** "Overmind runs each Procfile line as a tmux window and asks you to install tmux first. lpm imports the same named commands and runs them as panes in a Mac app: click one to read its output, stop or restart one without the rest, start them in dependsOn order." (2026-09-23: "click one to attach" contradicted FAQ 3 and `Pane.tsx:59` `disableStdin: true`. Later the same day "restart one on its own" became "stop or restart one without the rest" — it read as auto-restart, which lpm does not have; the same fix went into the quick answer and the CTA.) *(not supplied by the spec; written for this page, every clause cited in §6)*
- **verdictLine:** `Four rows go to Overmind. If any of them is load-bearing for you, stay where you are.` *(the spec said three; the matrix concedes four — see §6 and §11.14)*
- **jump link:** `See the Procfile conversion` → `#procfile`

---

## 4. Quick answer

H2 (also the extractable answer's question): `Is there an Overmind alternative for Mac that does not need tmux?`

Three paragraphs: which Overmind this is plus the README's tmux prerequisite; what lpm does instead (pane per service, 10,000 lines of scrollback, read-only panes, restart one without the others, no multiplexer to install, no Procfile reading); then the four things you give up. `CodeBlock filename="Procfile → ~/.lpm/projects/myapp.yml"` carries the side-by-side conversion.

Three sentences deviate from the spec's paragraphs — the Terraform-product clause is cut, the "no tmux anywhere in it" absolute is stated as a dependency, and the Procfile sentence is rewritten off the hub's. See §11.13, §11.15 and §11.16. The give-up list is four items because the matrix concedes four rows (§11.14).

---

## 5. Verdict cards

| label | title | body |
|---|---|---|
| Overmind | Keep Overmind | `-m web=2,worker=3` to scale a process, a `PORT` stepped per process with `-p` and `-P`, Linux and \*BSD, and a Procfile it reads fresh on every start. |
| lpm | Switch to lpm | No tmux to install, a project switcher across repos, `dependsOn` for start order, and Claude Code or Codex in a tab beside the services. |
| Both | Run both | Nothing conflicts. lpm never touches your Procfile or your `.overmind.env`, so the Overmind workflow you already have keeps working. |

`VerdictCard` requires three strings and part 4.7 supplies two. The spec's headings are the `title`s and the third string is the short entity name in the eyebrow slot — the shape all six siblings landed (`label: "tmux" / "PM2" / "cmux" / "iTerm2" / "Foreman" / "Overmind"`, `title: "Keep …"`). No copy is invented: see §11.

---

## 6. Matrix — "Where the two tools differ"

`id="matrix"`, `competitorName="Overmind"`, description: "Fifteen rows, and the first four go to Overmind outright. Those four are the honest reason to stay."

| Label | lpm | Overmind |
|---|---|---|
| Picks up Procfile edits on the next start | no — imported once, when the project is added | ✓ |
| Automatic PORT allocation | port declared for conflict checks, not assigned | PORT stepped per process (-p / -P) |
| Scales one process to several instances | one process per service | -m web=2,worker=3 |
| Which machines it runs on | Mac app; Linux and SSH boxes as hosts | macOS, Linux, \*BSD |
| Whether tmux has to be installed first | no — lpm does not use tmux | yes — install tmux, then Overmind |
| Reads a config committed in the repo | .lpm.yml | Procfile |
| Drafts the config for you | built in, from the Procfile and other manifests; Claude Code, Codex, Gemini CLI or OpenCode can redraft it | ✗ |
| Type at one running process | ✗ | overmind connect |
| Restart web without restarting worker | ✓ | ✓ |
| Start order you declare, not line order | dependsOn | ✗ |
| Start a subset of processes | --profile | -l / OVERMIND_PROCESSES |
| Port conflict caught at start, holder named | ✓ | ✗ |
| What a session survives | quitting the app | closing the terminal |
| Running it on a remote dev box | SSH projects, declared ports forwarded to localhost automatically | run it on the box yourself |
| Run the project in several copies at once | 1–50 worktrees or standalone copies | ✗ |

**Conceded to Overmind: four rows — 1, 2, 3 and 4.** Row 4 was called a split in the first pass; it is not. A team on Linux or \*BSD cannot run the lpm app at all, and the page's own WhenToPick lists that as a reason to stay, so it is counted. Rows 5–15 go to lpm or answer differently on both sides without either losing. Every other numeric framing on the page states four: the hero verdict line, this description, the footnote, and the quick answer's give-up list (Procfile, `PORT`, several instances of one process, needing a Mac).

Footnote: "Read the first four rows twice. Overmind takes the Procfile you already have, hands each process a `PORT`, runs several instances of one process, and installs on Linux and \*BSD, where lpm needs a Mac to drive from. lpm loses all four, and if one of them is load-bearing, stay where you are — nothing below outweighs a workflow that already works."

Deleted this pass, per part 4.7: `Runs on Linux, BSD, and macOS — lpm ✗` (relabelled), `Remote dev over SSH — Overmind ✓` (**false** — Overmind ships no SSH transport), `Generates project config from your repo — lpm ✓` (split into two qualified rows), `Proper SIGINT / signal propagation` (✓/✓, no information), `Session survives terminal restart` (✓/✓; relabelled to a row where the two answers differ).

Seven labels were rewritten away from the spec's wording because the sibling pages that landed first shipped the identical label or cell — see §11 items 1 and 11.

---

## 7. Command map — "Every overmind command, translated"

`fromLabel="overmind"`, `toLabel="lpm"`.

Description: "The overmind verbs you type in a day, and what replaces each one. The last two rows have no overmind command to translate."

| overmind | lpm | note |
|---|---|---|
| overmind start | lpm start | |
| overmind start -l web,worker | lpm start --profile api | |
| overmind restart web | lpm service web restart | |
| overmind stop worker | lpm service worker stop | |
| overmind connect web | click the service's tab in the project, or lpm logs web -n 500 | |
| overmind echo | open the project; each service's output is already in its pane | |
| overmind run yarn install | lpm run --command "yarn install" | a one-off command in the project's folder |
| overmind kill | lpm stop | lpm reaps each service's process tree |
| — | lpm wait --service web | block a script until the service is up |
| — | lpm duplicate -n 3 --run claude --prompt "…" | three copies of the project, an agent running in each |

Every `overmind` cell is a command the README shows verbatim (`start`, `-l`, `restart sidekiq`, `stop sidekiq`, `connect <process_name>`, `echo`, `run yarn install`, `kill`). `overmind ps` was dropped this pass — the README documents no `ps` command, so the row asserted a competitor command with no source (§11.17).

Footnote: the app-required verbs versus the read-only ones, ending on what `lpm list` prints. Reworded from the ledger's cleared sentence — see §11 items 2 and 3.

---

## 8. FAQ (6)

1. **Do I have to throw away my Procfile?** — "No. lpm imports it when the project is added — one service per line, same names — and leaves the file as it was for Heroku or Foreman. From then on lpm starts from its own service list, so a Procfile change made later does not carry over by itself." (`/config` linked on "its own service list", never on the word "commit" — part 7 blocks that until `/config` documents `.lpm.yml`.)
2. **Does lpm need tmux?** — "No. lpm does not use tmux and never asks you to install it. Your services keep running when you quit lpm and they are there when you reopen it — nothing to attach to." (`/vs/tmux` linked.)
3. **How do I attach to one process the way overmind connect does?** — you do not; the pane is read-only. Conceded outright, so can hit a debugger or open a pry session in that one process."
4. **Does lpm assign each process a PORT like Overmind?** — the `port:`-is-a-label answer, ending on the honest concession that automatic assignment is a real reason to stay.
5. **Overmind, Foreman or lpm — where does each fit?** — one interleaved stream / a tmux window per process / a pane in a Mac app. (`/vs/foreman` linked.)
6. **Can I use lpm on a remote dev box?** — SSH project with ports forwarded to localhost, or a Linux machine paired as a headless host. (`/ssh-terminal-for-mac` and `/run-claude-code-on-a-remote-server` linked.)

---

## 9. Wiring

- **RelatedPages (6):** `/vs/tmux`, `/vs/foreman`, `/config`, `/ssh-terminal-for-mac`, `/run-claude-code-on-a-remote-server` — §6.1's assignment — plus `/git-worktree-for-ai-agents` ("What lpm duplicate -n 3 actually creates, and the ignored files a linked worktree leaves behind"), added 2026-09-23 so the grid is 4-or-6 like the rest of the site.
- **In-body links:** `/config` from the conversion section and FAQ 1, `/vs/tmux` from FAQ 2, `/vs/foreman` from FAQ 5, `/ssh-terminal-for-mac` + `/run-claude-code-on-a-remote-server` from FAQ 6.
- **Analytics:** `downloadSource="vs-overmind-hero"` and `"vs-overmind-cta"`.
- **Media:** `start-project.mp4` / `start-project-poster.jpg` — the cluster's one shared clip (hub + this page), with a different label here: "Starting a project in lpm — every process in the config comes up in its own live pane."
- **Structured data:** `webPageJsonLd` (with `about[]` and `dateModified: VS_REVIEWED_ISO`), `breadcrumbJsonLd`, `screenRecordingJsonLd("start-project")`. Nothing else — no HowTo, no page-level SoftwareApplication, no Review/Product/aggregateRating. `FAQPage` is emitted inline by `components/vs/faq.tsx`.
- **ComparisonBasis:** four sources — the Overmind README, its releases page, Foreman's man page and tmux's manual page — plus `reviewed={VS_REVIEWED}`, `reviewedIso={VS_REVIEWED_ISO}` and an `lpmNote` that says which source covers what. The last two were added this pass so that every Foreman and tmux sentence on the page has a source of its own (§11.18).

---

## 10. Claims table

Every lpm claim on the page, with the file:line it was verified against. Paths are relative to `/Users/gug007/Projects/lpm`. Competitor claims trace to `ComparisonBasis`'s two sources.

| Claim as rendered | Where it appears | Verified at |
|---|---|---|
| lpm does not use tmux and does not need it installed | H1, quick answer, matrix, FAQ 2, CTA | `desktop/frontend/src-tauri/src/sessiond.rs:1-13`; `tmuxmigrate.rs:10-20` ("this is lpm's last tmux call, not a dependency"; skipped when tmux is absent); `peerssh.rs:44-53` (tmux dropped from a host's required tools) |
| lpm imports the Procfile once, when the project is added, and never writes to it ("lpm imports its lines once, when you add the folder", "reads the Procfile once rather than on every start", matrix row 1 "no — imported once, when the project is added", FAQ 1, hero "imports the same named commands", CTA "lpm converts the lines as you add the folder", `Procfile` section description) | quick answer, verdict cards, matrix row 1, FAQ 1, hero, CTA, conversion | `desktop/frontend/src-tauri/src/detect/stacks.rs:21-39` (`Procfile.dev`, else `Procfile`; one service per `name: cmd` line; `release` skipped at `:33`); `projects_crud.rs:48-67` (`services_for`), `:93` (add), `:261` (clone) — the only callers, so no re-read at start; detection only reads the file. Re-verified 2026-09-23 (commit `835443cb`). The conversion sample's `port: 3000` and `dependsOn: [web]` are what the section description says you add after: `bundle exec puma -C config/puma.rb` names no port, so `port_in_command` (`detect/mod.rs:273-291`) returns none. |
| "Drafts the config for you — built in, from the Procfile and other manifests; Claude Code, Codex, Gemini CLI or OpenCode can redraft it" | matrix | `detect/mod.rs:1-4`, `:111-130`; redraft: `aigen.rs:33-41`, `desktop/frontend/src/components/ConfigEditor.tsx:183` ("Generate with AI") |
| Every service gets its own live pane; pane N is service N | hero, quick answer, video label, matrix | `desktop/frontend/src-tauri/src/sessions.rs:1-3`; `cli/src/logs.rs:1-4` |
| Services keep running when you quit lpm, and are there when you reopen it | FAQ 2, matrix "What a session survives" | `desktop/frontend/src-tauri/src/sessiond.rs:1-13`; `sessions.rs:1-9` |
| 10,000 lines of scrollback | quick answer, matrix, WhenToPick, FAQ 3, CTA | `desktop/frontend/src/components/Pane.tsx:58` (`scrollback: 10000`); `cli/src/logs.rs:11` (`MAX_LINES = 10_000`); `cli/src/main.rs:113-114` |
| Service panes are read-only — no prompt to type at, so `overmind connect` has no lpm equivalent | quick answer, matrix row 7, FAQ 3, WhenToPick | `desktop/frontend/src/components/Pane.tsx:56` (`disableStdin: true` — the component `PaneView` renders service panes with); `InteractivePane.tsx:542` is the *interactive* terminal used for agent and shell tabs, not for services |
| Restart one process without the rest | matrix, quick answer, CTA, command map | `desktop/frontend/src-tauri/src/services.rs:466` (`restart_service_at`); `cli/src/service_cmd.rs:13-17`; `cli/src/main.rs:151-163` |
| `port:` is a label checked for conflicts, not assigned to the process | quick answer, conversion note 3, matrix, FAQ 4 | `desktop/frontend/src-tauri/src/config.rs:568-582` (declared `port` + `portConflict`); `ports.rs:1-8` ("these feed the start-flow conflict dialog") |
| The conflict names the process holding the port | matrix | `desktop/frontend/src-tauri/src/portsprobe.rs:1-10`, `:218` (`lookup_holders`) |
| `dependsOn` orders the start | hero, conversion note 1, matrix | `desktop/frontend/src-tauri/src/config.rs:580-581`; `config.rs:1753-1785` (`expand_service_deps`, cycle rejected at `:1767-1771`); `cli/src/config_cmd.rs:1420-1422` |
| `profiles` start a subset, via `lpm start --profile api` | conversion note 2, matrix, command map | `desktop/frontend/src-tauri/src/config.rs:809`; `cli/src/start.rs:19-21` |
| The same services can live in a `.lpm.yml` in the repo root | conversion note 3, matrix, FAQ 5 | `desktop/frontend/src-tauri/src/config.rs:1508-1546` (`load_repo_yaml`, `merge_repo_services_profiles`) |
| The config can be drafted by your installed Claude Code, Codex, Gemini CLI or OpenCode | matrix | `desktop/frontend/src-tauri/src/aigen.rs:1-6`, `:33-41` (`check_aicl_is` probes exactly those four); `desktop/frontend/src/types.ts:247` |
| Claude Code or Codex in a tab beside the services | verdict card 2, WhenToPick | `desktop/frontend/src-tauri/src/hooks.rs:1-9` (hooks installed for Claude Code and Codex); `desktop/frontend/src/components/PaneView.tsx:415-434` (agent status on the tab) |
| 1–50 worktrees or standalone copies, an agent started in each | matrix, WhenToPick, command map | `cli/src/main.rs:239-260` (`--count 1..=50`, `--run`, `--prompt`), `:277-283`; `desktop/frontend/src-tauri/src/projects_crud.rs:517` (`git worktree add -b`); `desktop/frontend/src/components/BulkDuplicateDialog.tsx:42` (`MAX_COUNT = 50`) |
| `lpm wait --service web` blocks until the service is up | command map | `cli/src/main.rs:164-181`; `cli/src/wait.rs` |
| `lpm stop` reaps the process tree | command map | `desktop/frontend/src-tauri/src/sessionpane.rs:175-195` (`killpg` on the foreground group, then `proctree::trees`); `pty.rs:716` |
| `lpm list` says how many of a project's services are running | command map | `cli/src/list.rs:49-53`, `:158-161` |
| `lpm start`, `lpm stop` and `lpm service … restart` need the app open | command map footnote | `cli/src/control.rs:12-19` ("lpm app is not running"); `start.rs:16`; `stop.rs:10`; `service_cmd.rs:50` |
| `lpm logs` and `lpm list` answer from a cold shell | command map footnote | `cli/src/logs.rs` (no `require_app`; reads the running session); `cli/src/list.rs:1-3` |
| Mac app; a Linux box or an SSH host can hold the services | matrix, FAQ 6, RelatedPages | `desktop/frontend/src-tauri/tauri.conf.json:31-38` (macOS bundle only); `config.rs:596-614` (`SshSettings`); `peerssh.rs:44-53` (pairing a host) |
| SSH projects: declared ports are forwarded to localhost automatically once they listen (matrix "SSH projects, declared ports forwarded to localhost automatically", FAQ 6 "ports forwarded to localhost") | matrix, FAQ 6, RelatedPages | `desktop/frontend/src-tauri/src/portforward.rs:720-747` (`observe_port`: a declared port goes to `auto_forward`, an undeclared one becomes a suggestion), `:750-777` (`auto_forward`); the poller is started per remote project at `services.rs:217`, `:304` and resumed at launch (`lib.rs:410`). The file header at `portforward.rs:1-8` still calls this "deferred"; the code says otherwise. |
| A project switcher across repos | verdict card 2, WhenToPick | `desktop/frontend/src/components/Sidebar.tsx`; `cli/src/list.rs:1-3` |
| An SSH host is picked from your own SSH config | RelatedPages (SSH terminal card) | `desktop/frontend/src-tauri/src/sshconfig.rs:1`, `:22-26` (`list_ssh_hosts` reads `~/.ssh/config`); `remote.rs:3742-3744` ("the Add-SSH-project picker") |
| One process per service — lpm does not run two copies of one | quick answer, matrix | `desktop/frontend/src-tauri/src/config.rs:807` (`services: BTreeMap<String, ServiceDef>` — one command per name) |
| Free and open source | CTA | `LICENSE:1` (MIT) |
| `lpm service worker stop` stops one service | command map | `cli/src/service_cmd.rs:13-17` (`Op::Stop` → `stop_service`), `:50`; `cli/src/main.rs:150-163` |
| `lpm run --command "yarn install"` runs a one-off command in the project's folder | command map | `cli/src/main.rs:321-336` (`--command`, `--prompt`); `cli/src/run.rs:140` (goes through the app) |
| `dependsOn` sequences the starts and does not wait for readiness; `lpm wait` is the gate | conversion note 1 | `desktop/frontend/src-tauri/src/config.rs:580-581`; `services.rs:197` (`expand_service_deps` before the start); `cli/src/wait.rs:1-5` ("the port/service/ready modes poll client-side … and never touch the app"), `:197` (only `--agent` needs it) |
| Copies are separate checkouts but share the declared ports and the database; a linked worktree starts with no `.env`, and with no node_modules unless you tick Install dependencies (verifier 2026-09-23: the old "until you tick" read as if the tick also brought `.env`) | WhenToPick bullet 6 | `projects_crud.rs:851-854` + `detect/node.rs:123-127` (the opt-in installs Node packages only); `BulkDuplicateDialog.tsx:937` ("Install dependencies"); | `desktop/frontend/src-tauri/src/projects_crud.rs:509-522` (`git worktree add -b` — tracked files only, so untracked `.env` and installed packages are not carried), `:745-760` (a standalone copy clones the tree instead), `config.rs:1454` (`DUPLICATE_SKIP_DIRS`); `ports.rs:1-8` (declared ports are checked, never reassigned) |
| lpm needs a Mac to drive it | quick answer, matrix row 4, footnote | `desktop/frontend/src-tauri/tauri.conf.json:31-38` (macOS bundle only); `peerssh.rs:44-53` (a Linux box is a host the Mac app drives) |

Competitor cells trace to the four sources linked in `ComparisonBasis`, and each one is a mechanism the source states:

- **Overmind's README** — `overmind start`, `-l web,worker` / `OVERMIND_PROCESSES`, `restart`, `stop <process>`, `connect <process_name>`, `echo`, `run yarn install`, `kill`, `-m web=2,worker=5` / `OVERMIND_FORMATION`, the `PORT` base and step (`-p` / `-P`), `.overmind.env`, "Overmind works with tmux, so you need to install it first", and "At the moment, Overmind supports Linux, \*BSD, and macOS only."
- **tmux's manual page** — "Each session is persistent and will survive accidental disconnection (such as ssh(1) connection timeout) or intentional detaching", which is what the "What a session survives" row and the SSH bullet in Overmind's column rest on, plus `.tmux.conf` in the `/vs/tmux` card.
- **Foreman's man page** — "interleave the output on stdout" (FAQ 5 and the `/vs/foreman` card) and `-m`, "Specify the number of each process type to run" (the same card).
- **Its releases page** — where the flags above can be checked against the current build.

No workaround is guessed at: where Overmind has no documented mechanism the cell is ✗, and the SSH row says what you actually do ("run it on the box yourself") rather than crediting a feature that does not exist. Two page-written sentences claim an absence rather than a mechanism — the command map's "the last two rows have no overmind command to translate" and the ✗ cells — and both rest on the README's own command and flag list. The one non-lpm, non-Overmind fact left unsourced is that a Procfile is also read by Heroku (FAQ 1 and the conversion description); the Procfile format is Heroku's own and the claim is definitional, not a mechanism comparison.

---

## 11. Deviations from the spec

1. **Six matrix row labels rewritten.** Part 4.7 supplied "Where it runs", "Needs tmux installed", "Attach to one process interactively", "Restart one process without the rest", "Start order from declared dependencies" and "Work on a remote machine". All six had already landed byte-identically on a sibling (`/vs/foreman`'s `procfile-matrix.tsx`, `/vs/tmux`'s `matrix.tsx`, `/vs/cmux`'s `page.tsx`, and `app/vs/_components/tool-matrix-data.ts`), which breaks part 2's rule 3 and the part 8 check `grep -rho 'label: "[^"]*"' app/vs | sort | uniq -d`. Rewritten in Procfile vocabulary with the cells untouched: "Which machines it runs on", "Whether tmux has to be installed first" (reworded again this pass, for polarity — §11.15), "Type at one process directly", "Restart web without restarting worker", "Start order you declare, not line order", "Running it on a remote dev box".
2. **Command-map footnote reworded.** The ledger's cleared sentence ends "read the session daemon directly", and "session daemon" is a banned implementation noun (part 8, Content). It had also already shipped verbatim on `/vs/tmux` (`_components/commands.tsx:52-60`), so reusing it would have put a 20-word run on two pages. Shipped: "Anything that changes what is running — `lpm start`, `lpm stop`, or a `lpm service … restart` — goes through the app, so keep lpm open: it owns the panes. `lpm logs` and `lpm list` only read, so they answer from a cold shell."
3. **`overmind ps` maps to `lpm list`, not `lpm status`.** The spec's row said `lpm status`. `lpm status` reports agent status only — Running / Waiting / Done / Error (`cli/src/main.rs:123-130`, `cli/src/status.rs:13-20`) — and would have been a false claim in a row about which processes are up. `lpm list` is the verb that reports each project's running state and service counts (`cli/src/list.rs:1-3`, `:158-161`), so it ships with a note saying what it prints.
4. **`VerdictCard`'s third string.** `VerdictCard` requires `label`, `title` and `body`; part 4.7 supplies two. Resolved the way all six siblings resolved it: `title` carries the spec's heading ("Keep Overmind" / "Switch to lpm" / "Run both"), `body` the supplied sentence, and `label` the short entity name in the eyebrow slot ("Overmind" / "lpm" / "Both"), matching `/vs/tmux`, `/vs/pm2`, `/vs/cmux`, `/vs/iterm2`, `/vs/docker-compose` and `/vs/foreman`. Nothing is invented — the first draft of this page put the headings in `label` and wrote three new `title` lines; those are gone.
5. **Backticks dropped in plain-string props.** `MatrixRow.label`/cells, `SectionVideo.description`, `WhenToPick.points` and `VerdictCard.body` are typed `string`, so the spec's inline code formatting (`` `PORT` ``, `` `-m web=2,worker=3` ``) renders as literal text there. Wherever the prop is `ReactNode` — the matrix footnote, the command-map footnote, the conversion notes, FAQ answers — the same strings are wrapped in `<code>`.
6. **Two WhenToPick bullets updated beyond the brief, to follow the ledger.** Part 4.7 replaced bullets 2 and 5 and added a sixth. Bullet 3 ("You don't want to set up or learn tmux…") is the exact framing ruling 1 retires, so it became "You would rather not install tmux to run a Rails or Next.js stack." Bullet 4 said "full scrollback", which §5.5 bounds at 10,000 lines, so it now says so.
7. **FAQ 5 carries four extra words.** "Foreman interleaves one log stream" became "Foreman interleaves one log stream in a single terminal" (§5.4's cleared "one formation, one stream, one terminal") because the spec's sentence pair produced an eight-word run shared with `/vs/foreman:219`, which had already landed.
8. **Hero `description` and the CTA copy are page-written.** Part 4.7 gives the H1, eyebrow and verdict line but no hero subtitle or CTA text. Both are new, and every clause in them is in the claims table.
9. **The conversion appears twice**, as the spec specifies: once as the merged side-by-side block inside the quick answer, once as the two separate files in the conversion section. The second block shows `services:` and `profiles:` only, with no `name:`/`root:` header, both because the repo-level `.lpm.yml` accepts exactly those two keys (`config.rs:1508-1546`) and because the header lines would have duplicated a code sample on `/vs/tmux`.
10. **`ComparisonBasis` source label.** Part 4.7 names the source "the Overmind README", which `/vs/foreman` had already shipped byte-identically, and `/vs` ships "Overmind's README". Shipped as "Overmind's own README" so no `label:` string on this page is byte-identical to one on another `/vs` page (part 8's `grep -rho 'label: "[^"]*"' app/vs | sort | uniq -d` check). Verified: zero overlap now. The verdict-card labels "lpm" and "Both" do repeat across the cluster, deliberately — they are the shared card shape, not row labels, and every sibling uses them.
11. **Four more strings varied to keep rule 2 (no eight-word run shared with a sibling), after `/vs/pm2`, `/vs/docker-compose` and `/vs/tmux` had landed:**
    - matrix row label `Copy the project for a second agent` → `Run the project in several copies at once` (`/vs/pm2:123-124` ships the same cell under the label "Copy the whole stack for a second agent", and the two together made a ten-word run);
    - the ledger's shared `lpmNote` tail was reworded rather than reused (every page is told to say "were re-checked against the app source the same day"); it was rewritten again this pass, once two more sources landed — see §11.18. Shipped: "Overmind's flags and commands here all come from its README, the Foreman line from its man page, and the detach behaviour from tmux's. lpm's own rows were read off the app source the same day.";
    - WhenToPick bullet 2 opens "You point Claude Code, Codex, Gemini CLI, or OpenCode…" rather than "You run…", which `/vs/docker-compose:288` already ships. The four literal CLI names §5.4 mandates are intact.
    - FAQ 6 says "so its services **get** panes beside your local ones" where part 4.7 says "run in panes". `/vs/tmux:131` and `:139` had already landed "its services run in panes beside your local ones", an eight-word run.

12. **`components/vs/`, `lib/` and every sibling page are untouched.** The only files changed are `app/vs/overmind/page.tsx`, `app/vs/overmind/opengraph-image.tsx`, `app/vs/overmind/_components/{answer,procfile,differences,command-translation}.tsx` and this file.
13. **The Terraform-product clause is cut.** The spec's quick answer disambiguated DarthSim/overmind from "the Terraform product of the same name". That is a claim about a product this page cites no source for, so under the accuracy-over-spec ruling it goes rather than getting a fifth source. The disambiguation survives in a form that asserts nothing about anyone else: "Overmind here means DarthSim/overmind, the Procfile runner linked above" — the link being the README in `ComparisonBasis` directly above the quick answer.

14. **The matrix concedes four rows, not three, and every count on the page says four.** The first pass shipped the spec's "three", counted rows 1–3 and called row 4 ("Which machines it runs on") a split. It is not a split: Overmind installs on Linux and \*BSD, the lpm app does not, and this page's own WhenToPick gives "Your team develops on Linux or \*BSD as well as macOS" as a reason to stay. So the count is four, and it now reads the same in the hero verdict line, the matrix `description`, the matrix footnote and the quick answer's give-up list. The footnote also changed from "the first three rows" to "the first four rows", which is still contiguous — the four conceded rows are rows 1–4.

15. **The tmux row lost its checkmarks.** Part 4.7's polarity was "Needs tmux installed — lpm ✗ / Overmind ✓", which paints a ✓ in Overmind's column for a prerequisite. Counting checkmarks then gave a different answer from the verdict line. Shipped as a string row where each side says what it means: **"Whether tmux has to be installed first"** — lpm "no — lpm does not use tmux", Overmind "yes — install tmux, then Overmind". No ✓ now sits in the competitor column for something the competitor's own README calls an install step.

16. **The quick answer's two tmux and Procfile sentences are rewritten.**
    - "There is no tmux anywhere in it and nothing to install alongside it" became "Nothing in it runs on tmux, so there is no multiplexer to install first." The claim that ships is the dependency one (ruling 1's mandated framing) rather than an absolute about the codebase.
    - "It will not read your Procfile — you convert the lines once, and the shape is identical" became "Your Procfile stays where it is: lpm reads a file of its own, so you retype those lines once and the shape carries over unchanged." The old sentence shared a ten-word run with the hub's Foreman router card (`app/vs/_components/router.tsx:93-95`), which this page does not own. The fact is untouched and still stated flatly twice more, in the same section's give-up list ("lpm will not read the Procfile itself") and in FAQ 1.

17. **`overmind ps` is gone from the command map; two documented commands took its place.** The README documents no `ps`, so that row credited the competitor with a command no source on this page shows. Added instead: `overmind stop worker` → `lpm service worker stop`, and `overmind run yarn install` → `lpm run --command "yarn install"`. Both `overmind` halves are quoted in the README. What the dropped row carried — that `lpm list` tells you how many of a project's services are up — moved into the footnote, which already discusses the read-only verbs. The description no longer claims "no Procfile-runner equivalent at all" (an absence claim about every Procfile runner, including tools this page cites nothing for); it says "no overmind command to translate", which the README's own command list supports.

18. **`ComparisonBasis` gained two sources, against part 4.7's two.** Every Foreman and tmux sentence on the page now has a source of its own, which part 4.7's two Overmind links could not give it:
    - **Foreman's man page** (`github.com/ddollar/foreman/blob/master/man/foreman.1.ronn`) for FAQ 5's "Foreman interleaves one log stream in a single terminal" ("interleave the output on stdout") and for the `-m` formation flag in the `/vs/foreman` card ("Specify the number of each process type to run").
    - **tmux's manual page** (`man.openbsd.org/tmux.1`) for the matrix's "What a session survives — Overmind: closing the terminal" and for the SSH bullet in Overmind's column ("Each session is persistent and will survive accidental disconnection (such as ssh(1) connection timeout)"). It also covers `.tmux.conf` in the `/vs/tmux` card.
    The `lpmNote` now says which source covers what. Labels are "Foreman's man page" and "tmux's manual page", deliberately not `/vs/foreman`'s "the foreman man page" or `/vs/tmux`'s "the tmux manual".

19. **Three claims the sources would not carry were rewritten or cut.**
    - The `/vs/foreman` card said "its `-m` formation flag, and the one restart it cannot do". The formation flag is in the man page; the restart limit is not documented there at all, so the clause is gone: "one interleaved stream, its `-m` formation flag, and what changes when each process gets a pane."
    - Overmind's WhenToPick SSH bullet said the reader needs "the tmux server to survive terminal reconnects". Reworded to the behaviour the tmux manual states and the README's own detach instructions: "where a dropped connection leaves the tmux session running and `overmind connect` picks the process back up."
    - Conversion note 1 said "Overmind starts everything at once" — start order is not documented in the README either way. It now describes only lpm's side, and states the hedge §5.6 asks for: `dependsOn` sequences the starts, it does not wait for readiness, and `lpm wait` is the gate.

20. **The duplicate claim ships with its price (§5.6 and ledger §5.3).** The page claimed copies without saying what a copy does not carry. WhenToPick's sixth lpm bullet now ends: "separate checkouts, so no two agents edit one file, but the same declared ports and the same database underneath, and a linked worktree starts with no `.env` and no installed dependencies." Written in this page's vocabulary rather than the ledger's shared sentence, which five pages were told to reuse verbatim — the fact is identical, the wording is not, and an 8-gram diff against all seven siblings and the hub is clean.

21. **One keyword swapped.** `overmind alternative` bare is on §6.4's do-not-target list ("always pair it with 'Procfile' or 'Mac'") and part 4.7's array opened with it. Replaced with `overmind procfile alternative`, which keeps the array at ten entries and pairs the brand exactly as §6.4 requires. `overmind alternative mac` already covered the other pairing.

## Correction, 2026-09-10 (orchestrator)

The "live prompt in the pane" claim shipped in this pass and was **false**. It cited
`InteractivePane.tsx:609`, which is the interactive terminal used for agent and shell
tabs. Service panes are rendered by `Pane.tsx`, whose terminal is created with
`disableStdin: true` (`Pane.tsx:56`), so a service pane is read-only and there is no
lpm equivalent for `overmind connect`. Row 7 now concedes it, the matrix concedes five
rows rather than four, and FAQ 3 answers the question by conceding it. `/vs/foreman`
had this right ("panes are read-only") and this page contradicted it.

## Truth pass, 2026-09-23

Service detection (commit `835443cb`, `desktop/frontend/src-tauri/src/detect/`) made five
sentences on this page false: the hero ("click one to attach" — never true, service panes
are read-only at `Pane.tsx:59`), FAQ 1 and its JSON-LD ("lpm will not read it"), the quick
answer ("you retype those lines once", "lpm will not read the Procfile itself"), matrix row 1
("Uses an existing Procfile without conversion — ✗") and the command map ("click the service
in the sidebar" — the sidebar lists projects; services are tabs in the project's pane, and
`hotkeys.ts:22-33` moves between them). Row 1 is still a concession, relabelled "Picks up
Procfile edits on the next start": Overmind reads the file on every start, lpm imports it
once. **Five rows still go to Overmind**, so the hero verdict line, the matrix description
and the footnote all keep "five". The remote-box row stopped claiming manual forwarding
because declared ports now forward on their own (`portforward.rs:720-777`).

## Verifier pass — 2026-09-23

- Command map: `overmind echo` tails a daemonised Overmind's output (Overmind README, "Use the `echo` command for the logs"). The old lpm cell, "nothing to set; each pane is a real terminal", answered a different question; it now reads "open the project; each service's output is already in its pane" (`log_streaming.rs:1-14`, `PaneView.tsx` one pane per service).
- Procfile section: "The same file can live at `.lpm.yml`" → "Commit the same services and profile as `.lpm.yml` in the repository to share them" — a repo file contributes only `services` and `profiles` (`config.rs:1844-1883`).
- Verdict "Keep Overmind" uses non-breaking hyphens in "-p and -P" so the flag never splits across a line at card width.
