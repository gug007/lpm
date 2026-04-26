# /ssh-terminal-for-mac — Content Outline

This is the architecture blueprint for the SSH SEO page. Section-by-section
outline only — full prose comes from the copywriter (task #5). Every bullet
traces to a real capability documented in `_research/ssh-feature.md`.

---

## 1. Angle statement

**Distinct angle: hybrid local + remote in one Mac terminal.** This page is
for Mac developers whose daily work crosses an SSH boundary — a remote dev
box, a staging server, a bastion-fronted EC2, a Linux Docker host. lpm
imports any host from `~/.ssh/config` (including `ProxyJump` chains),
forwards remote ports to localhost as soon as remote services start, and
runs those remote services in panes alongside the local ones — so the user
never has to choose between "local terminal window" and "ssh session
window."

How this differs from the other three pages:

| Page | Owned angle |
|---|---|
| `/best-terminal-for-mac` | Native Apple Silicon, no Electron, battery |
| `/mac-terminal-for-developers` | Monorepo, multi-service, AI agents |
| `/git-terminal-for-mac` | Git workflow + dev servers in one window |
| **`/ssh-terminal-for-mac`** (this page) | **Hybrid local + remote: SSH config import, remote port forwarding, jump host, ssh action mode** |

Hook the meta description already promises and the page must reinforce:
**"Pick any host from ~/.ssh/config."** This phrase lands in the hero
subtitle, in Workflow 1, and (in different framing) at least once in FAQ —
so on-page text reinforces the SERP signal.

Required terms to land somewhere on the page (per upstream calibration):
`ProxyJump`, `remote port forwarding`, `ssh action mode`, `jump host`,
`config import`, plus alternatives for Termius / iTerm2 / Warp.

---

## 2. Hero

- **Eyebrow:** `THE SSH TERMINAL FOR MAC DEVELOPERS`
- **H1:** `The Mac terminal that keeps your local stack and your remote dev box in the same window.`
- **Subtitle direction:** lead with "Pick any host from `~/.ssh/config`",
  then name the three core differentiators in order: host import, remote
  port forwarding, remote services running side by side with local ones in
  one native Mac window. End with "Native Apple Silicon, zero Electron"
  (sibling-consistent closing beat).
- **Primary CTA:** `Download for macOS` (uses existing `HeroDownload`)
- **Secondary link:** `View on GitHub →` (uses `REPO_URL`)

---

## 3. Problem (3 cards)

Eyebrow: `THE REMOTE-DEV CONTEXT TAX`
H2: `Your remote dev box lives in a different window from your local stack`
Subtitle direction: every modern Mac developer works partly remote — a
staging box, a Linux build server, a cloud workstation. That split between
"local terminal" and "ssh session" shows up as friction every hour.

| # | Icon (lucide-react) | Title | 1-line summary |
|---|---|---|---|
| 1 | `Shuffle` | You context-switch between local panes and ssh sessions all day | Local API in one window, `ssh user@build-server` in another, and a third tab somewhere with a tunnel — three windows to debug one feature. |
| 2 | `Plug` | Port forwarding gymnastics break every time the remote restarts | You hand-type `ssh -L 3000:localhost:3000 user@host`, the remote dev server restarts, the listener dies, and you re-type the command from shell history. |
| 3 | `KeyRound` | Re-typing the host, user, port, and identity that's already in `~/.ssh/config` | Your `~/.ssh/config` already has `Host build`, `ProxyJump bastion`, and the right key. Most tools make you re-enter all of it anyway. |

Each card should reference a real friction documented in
`_research/ssh-feature.md` §2 ("Pain it removes").

---

## 4. Features (6 cards, 1/2-column grid)

Eyebrow: `WHAT A REMOTE-AWARE TERMINAL LOOKS LIKE`
H2: `An SSH terminal that imports your config, forwards your ports, and runs your remote services next to local ones`
Subtitle direction: six capabilities that change how remote Mac development
feels when the terminal understands SSH instead of just hosting it.

| # | Icon (lucide-react) | Title | 1-line summary (one feature behavior each) |
|---|---|---|---|
| 1 | `ListTree` | Pick any host from `~/.ssh/config` | Modal opens with a dropdown populated from your `~/.ssh/config`; selecting a host pre-fills hostname, user, port, and identity file. `Include` directives are followed; `ProxyJump` and `ProxyCommand` chains carry over automatically because the picker just imports your existing config. |
| 2 | `Network` | Remote port forwarding with auto-detect | When a remote service binds a port, lpm detects it (via remote socket polling and stdout URL sniffing) and offers a one-click forward to localhost. Declared service ports auto-forward and toast `:3000 → http://localhost:3000` the moment the local listener is actually accepting connections. |
| 3 | `Server` | Remote services in panes, beside your local ones | Services declared under `services:` run on the remote host but stream into lpm panes the same way local services do. Switch between `staging-api` (remote) and `frontend` (local) like they're the same shape — because in lpm they are. |
| 4 | `Shuffle` | Action mode: run remote, or sync and run local | Each action picks `mode: remote` (run on the host) or `mode: sync` (rsync the remote tree into a local mirror, run a local tool against it, push changes back). Local formatters, refactors, and AI coding tools work on remote source without manual rsync. |
| 5 | `RadioTower` | Connection multiplexing, ready when the tunnel is | Every ssh invocation shares an OpenSSH `ControlMaster` channel — only the first auth pays the cost. Forwards report success only after a TCP connect to the local side actually succeeds, so the toast and the working tunnel are in sync. |
| 6 | `Activity` | Per-project remote profile, isolated lifecycle | Each project has its own `ssh:` block (host, user, port, key, dir) inside its YAML. Forwards, pollers, and rsync mirrors are scoped to that project. Stop the project and every forward dies; quit the app and nothing leaks. |

All six map to commits documented in `_research/ssh-feature.md` §1
(host picker → 1b, port forwarding → 1e, remote services → 1c, action mode →
1d, ControlMaster → 1c, per-project profile → 1f).

---

## 5. Benefits (4 numbered outcomes)

Eyebrow: `THE REMOTE-DEV DIFFERENCE`
H2: `What changes when your terminal speaks SSH the way you do`
Subtitle direction: four concrete wins for Mac developers whose work
crosses the SSH boundary.

| # | Title | One-line body direction |
|---|---|---|
| 1 | You stop hand-typing `ssh -L` for every dev server | Remote services bind their ports; lpm offers or auto-creates the forward; the toast appears the moment `localhost:3000` is actually reachable. The user clicks and it works. |
| 2 | You stop re-entering host/user/port/key data your `~/.ssh/config` already knows | The picker imports the same hosts your shell already uses, including `ProxyJump` chains. New SSH project creation drops to four clicks: pick host → confirm → save → start. |
| 3 | You stop juggling a local terminal and a remote ssh window | Local services and remote services run in adjacent panes inside one native Mac window. Switching projects (prod vs staging vs your local copy) is one sidebar click; running state is preserved per project. |
| 4 | You stop losing forwards and tunnels when something restarts | Forwards are owned by the project. Stop the project and every forward dies cleanly. Restart and lpm re-establishes them. App shutdown kills nothing-orphaned — no leftover ssh processes hiding in `ps`. |

---

## 6. Workflows (3 numbered scenarios)

Eyebrow: `IN PRACTICE`
H2: `Three real remote-dev scenarios your Mac terminal should make trivial`
Subtitle direction: three concrete moments where the local-vs-remote split
costs real time, and how lpm collapses them.

### Workflow 1 — Onboard to a teammate's remote dev box from your `~/.ssh/config`
**Title candidate:** `Onboard to a remote dev box without typing a single connection detail`
**Narrative direction (2-3 sentences):** A teammate hands you their
`~/.ssh/config` snippet — a `Host devbox` entry with `ProxyJump bastion`
and the right key path. You paste it into your config, hit "Add a project"
in lpm, pick `devbox` from the dropdown, and confirm. The first ssh
invocation prompts for your bastion 2FA once; from then on, ControlMaster
keeps the channel open and every action, terminal, and forward reuses it.
Hits the meta-description hook ("Pick any host from `~/.ssh/config`").

### Workflow 2 — Ship a hotfix to a staging server while keeping local services running
**Title candidate:** `Push a hotfix to staging without stopping your local stack`
**Narrative direction (2-3 sentences):** Your local `frontend` and `api`
are streaming logs in two panes. A bug needs to ship to staging fast. Open
the staging project (already configured against the remote host), run
`migrate` as an action with `mode: remote`, watch the staging API pane
stream the deploy output, and forward the staging port to localhost to
verify the fix in your browser. Your local panes never stopped — when
you're done, you switch back and pick up where you were. References
`mode: remote`, action mode, and per-project isolation.

### Workflow 3 — Debug a remote API by forwarding its port to localhost the second it binds
**Title candidate:** `Forward a remote dev server to localhost the moment it starts`
**Narrative direction (2-3 sentences):** You start the remote project's
`api` service, which prints `Listening on http://0.0.0.0:8080`. lpm sniffs
that URL out of the log, sees it matches a declared service port, and
auto-forwards — toast: `:8080 → http://localhost:8080`. Open the URL
locally; your browser is talking to the remote process through the SSH
channel without you typing a single `-L` flag. The forward dies cleanly
when you stop the project. References URL output sniffing, port readiness
polling, and remote → local forwarding direction.

---

## 7. Comparison

Eyebrow: `HOW IT COMPARES`
H2: `lpm vs Termius, iTerm2, Warp, raw OpenSSH, and VS Code Remote-SSH`
Subtitle direction: a capability matrix for Mac developers picking between
a dedicated SSH client (Termius), a general terminal (iTerm2, Warp), the
underlying tool (raw OpenSSH + a multiplexer), and the editor-bundled
option (VS Code Remote-SSH).

**Columns (left-to-right):** `lpm | Termius | iTerm2 | Warp | raw OpenSSH | VS Code Remote-SSH`

- `lpm` — always first, always highlighted (per template-spec.md §2.6).
- **Termius** — directly addresses keyword `termius alternative mac`. Strong
  on saved-snippet-library; weak on local-and-remote-side-by-side.
- **iTerm2** — addresses keyword `iterm2 ssh workflow`. The default Mac
  power-user terminal; capable of ssh sessions but no project model.
- **Warp** — addresses keyword `warp terminal ssh alternative`. Modern Mac
  terminal; SSH support is nominal, no project model, no port forwarding UX.
- **raw OpenSSH** — the baseline ("what you'd do without lpm"). Fully
  capable, zero ergonomics. Stand-in for `ssh + tmux` without naming the
  multiplexer in user-facing copy.
- **VS Code Remote-SSH** — important comparison because many Mac devs
  default to it for remote work. Strong on editor-side-of-things; weak on
  multi-service runtime visibility outside the editor.

**6 capability rows (boolean per column, true/false):**

| # | Capability row | lpm | Termius | iTerm2 | Warp | raw OpenSSH | VS Code Remote-SSH |
|---|---|---|---|---|---|---|---|
| 1 | Imports hosts from `~/.ssh/config` (with `ProxyJump`) | true | partial-treat-as-false | true | true | true | true |
| 2 | One-click remote port forward, with readiness check | true | false | false | false | false | false (editor port-forwarding is per-port-per-server, not project-scoped) |
| 3 | Auto-detects remote-bound ports and offers to forward them | true | false | false | false | false | partial-treat-as-false |
| 4 | Remote services in panes alongside local services in one window | true | false | false | false | false | false |
| 5 | Per-project SSH profile + isolated forward/poll lifecycle | true | partial-treat-as-false (saved hosts, no project lifecycle) | false | false | false | false |
| 6 | Run a local tool against a remote source tree (action `mode: sync`) | true | false | false | false | false | false |
| 7 | Native Apple Silicon, no Electron | true | false (Electron) | true | true | true | false (Electron) |
| 8 | Free and open source | true | false | true | false | true | false (open-source extension, closed-source editor) |

Engineer note (will be reiterated by copywriter in §4 of `_copy.md`): the
matrix renders boolean only — Indicator helper from sibling pages produces
`<Check />` for true, `<X />` for false. Where the entry says "partial-treat-as-false"
above, use `false` in the actual matrix and let the row label/qualifier
carry the nuance. Aim for **6 rows** in the final matrix; the table above
shows 8 candidates so the copywriter can pick the strongest 6 (rows 1, 2, 3,
4, 5, 6 are the SSH-distinct ones — rows 7 and 8 are sibling-shared and
optional here).

---

## 8. FAQ (6 Q&A)

Eyebrow: `FAQ`
H2: `What Mac developers ask before using lpm as their SSH terminal`
Subtitle: (none — the questions carry the section, per template-spec.md §2.7)

Six questions, plain-text answers (variant A — no inline JSX). Each Q
maps to a concrete capability or a recurring objection. Copywriter writes
full prose; the one-line summaries below are the answer skeleton.

| # | Question | Answer summary direction |
|---|---|---|
| 1 | Does lpm replace Termius as my SSH client on Mac? | For developers who want their terminal to handle remote work alongside local services, yes — lpm imports `~/.ssh/config` (no separate host vault), runs remote services in panes, and forwards ports without leaving the window. If you specifically need a saved-snippet/SFTP-browser product, keep Termius for that — lpm is a terminal-first SSH workspace, not a feature-parity replacement. Lands the `termius alternative mac` keyword. |
| 2 | How does lpm import my `~/.ssh/config`? | The Add SSH Project modal reads `~/.ssh/config` (and any files referenced via `Include`, up to 4 levels deep), parses out non-wildcard `Host` blocks, and shows them in a dropdown. Selecting a host pre-fills the form. `ProxyJump` and `ProxyCommand` chains transfer because every ssh invocation goes through your existing config. Lands the `config import` term. |
| 3 | Can I forward a remote port to localhost without typing `ssh -L`? | Yes. Open the project's Ports popover, type the remote port, leave the local port blank, hit Enter. lpm spawns the ssh forward, polls the local socket until it actually accepts, and surfaces the success toast — so you know the tunnel is usable, not just spawned. Declared service ports auto-forward at start. Lands the `remote port forwarding` term. |
| 4 | Does lpm work with a jump host or bastion (`ProxyJump`)? | Yes — because lpm uses your `~/.ssh/config`, anything you've already configured (`ProxyJump bastion`, `ProxyCommand`, or chained jumps) carries over automatically. Pick the inside-VPC host from the dropdown; lpm opens services through the bastion without any extra lpm-side config. Lands the `jump host` term. |
| 5 | What's the difference between `mode: remote` and `mode: sync` for actions? | `mode: remote` (the default for SSH projects) runs the action's command on the remote host over ssh. `mode: sync` rsyncs the remote source tree into a local mirror, runs the action locally against the mirror, and rsyncs changes back — so a local tool (formatter, refactor, AI coding session) can act on remote source without you shuttling files manually. Lands the `ssh action mode` term. |
| 6 | Is lpm a good iTerm2 or Warp alternative for SSH work specifically? | Both iTerm2 and Warp give you a great terminal but treat SSH as "any other shell command." lpm adds the project model around it: a host picker, port-forward UX with readiness checks, auto-detection of remote-bound ports, and per-project lifecycle for forwards. If your day is mostly local terminal work with occasional ssh, iTerm2 or Warp is fine; if you cross the local/remote line every hour, lpm is the upgrade. Lands the `iterm2 ssh workflow` and `warp terminal ssh alternative` keywords. |

JSON-LD: emit `FAQPage` structured data inline in the section, per
template-spec.md §7.2. Variant A (string answers) — no `answerText`
override needed.

---

## 9. CTA

- **Eyebrow:** (none — large hero-style CTA, per template-spec.md §2.8)
- **H2 candidate (two-line split):**
  - Line 1: `Your local stack and your remote dev box, finally in the same window.`
  - Line 2: `Free, native, and ready in two minutes.`
- **Subtitle direction:** Download a native macOS binary, drag to
  Applications, open the picker, choose a host from your `~/.ssh/config`.
  lpm forwards your remote ports, runs remote services in panes alongside
  local ones, and never leaks a stray ssh process. Works on every Intel
  and Apple Silicon Mac running macOS 12 or later.
- **Primary CTA:** `Download for macOS` (uses existing `HeroDownload`,
  source hard-coded `"hero"` per template-spec.md §8)
- **Secondary link:** `View on GitHub →` (uses `REPO_URL`)

---

## 10. Notes for the copywriter (task #5)

- Voice: direct, second-person, present tense; no emoji; no exclamation
  marks; em-dashes used as a pause. Match `git-terminal-for-mac/_copy.md`
  cadence.
- **Never** include real personal hostnames, IPs, paths, or emails.
  Generic placeholders only: `user@build-server`, `user@staging`,
  `~/Code/<repo>`, `127.0.0.1:5432`, `localhost:3000`. Per feedback memory.
- **Don't** mention tmux as a user-facing concept. Describe behavior in
  terms of "panes per service" / "remote services in panes." Per feedback
  memory.
- Land the meta-description hook **"Pick any host from ~/.ssh/config"** in
  the Hero subtitle, in Workflow 1, and once in FAQ Q2.
- Required terms to land somewhere on page (per upstream calibration):
  `ProxyJump`, `remote port forwarding`, `ssh action mode`, `jump host`,
  `config import`. Each appears in this outline already.
- Required keyword reinforcement (per `_research/metadata.md` §5):
  `termius alternative mac` (FAQ Q1), `iterm2 ssh workflow` (FAQ Q6),
  `warp terminal ssh alternative` (FAQ Q6 or Comparison eyebrow).
- Inline `<code>` (className `text-xs`) is fine for `~/.ssh/config`,
  `ProxyJump`, `mode: remote`, `mode: sync`, `localhost:3000`, etc. JSX
  is allowed in Features `body` and Workflows `body` per template-spec.md
  §§2.3, 2.5.
- FAQ answers stay plain strings (variant A) so JSON-LD is trivial.
- Comparison: pick 6 rows from the 8 candidates above. Rows 1–6 are the
  SSH-distinct ones; rows 7–8 (Apple Silicon, OSS) are sibling-shared and
  can be dropped if matrix gets crowded. Recommend keeping rows 1, 2, 3,
  4, 5, 6 as the final 6 — they all carve the SSH lane.
