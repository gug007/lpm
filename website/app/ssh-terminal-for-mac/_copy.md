# /ssh-terminal-for-mac — Content & Copy Plan

Page route: `/ssh-terminal-for-mac`
Target primary keyword: **ssh terminal for mac**
Intent: hybrid local + remote — Mac developers whose daily work crosses an SSH boundary (remote dev box, staging server, bastion-fronted EC2, Linux Docker host) and want one native Mac terminal that imports their `~/.ssh/config`, forwards remote ports to localhost on demand, and runs remote services in panes alongside the local ones.

**Angle:** hybrid local + remote in one Mac terminal. Do NOT recycle the "native / Apple Silicon / battery" angle (that's /best-terminal-for-mac), the "monorepo / multi-service / AI agents" angle (that's /mac-terminal-for-developers), or the "git workflow same window" angle (that's /git-terminal-for-mac). The SSH angle is distinct — this page is about developers who cross the local/remote line every hour and want their terminal to stop pretending the boundary doesn't exist.

---

## 1. Metadata

```ts
title: "SSH Terminal for Mac — Remote Dev Boxes in One Window"
// 55 chars

description: "Pick any host from ~/.ssh/config, forward remote ports to localhost, and run remote services side by side with local ones in one native Mac terminal window."
// 156 chars

keywords: [
  "ssh terminal for mac",
  "ssh client for mac",
  "mac terminal ssh",
  "macos ssh terminal",
  "ssh terminal mac developers",
  "mac terminal with ssh config",
  "ssh config host picker mac",
  "ssh port forwarding mac terminal",
  "remote port forwarding mac",
  "mac terminal for remote dev box",
  "ssh and dev server mac terminal",
  "jump host terminal mac",
  "bastion host terminal mac",
  "ec2 ssh terminal mac",
  "mac terminal for remote development",
  "termius alternative mac",
  "iterm2 ssh workflow",
  "warp terminal ssh alternative",
  "lpm",
  "local project manager",
]

alternates.canonical: "/ssh-terminal-for-mac"

openGraph.title: "SSH Terminal for Mac — Remote Dev Boxes in One Window"
openGraph.description: "Pick any ~/.ssh/config host, forward remote ports to localhost, and run remote services side by side with local ones in a native Mac terminal."
openGraph.type: "website"
openGraph.url: "/ssh-terminal-for-mac"
openGraph.siteName: "lpm"

twitter.card: "summary_large_image"
twitter.title: "SSH Terminal for Mac — Remote Dev Boxes in One Window"
twitter.description: "An SSH terminal that imports your ~/.ssh/config, forwards remote ports to localhost, and runs remote services in panes alongside your local stack."
```

---

## 2. Section outlines

Eight sections, rendered in this order:
`Hero → Problem → Features → Benefits → Workflows → Comparison → Faq → Cta`

**Note for infra-engineer:** The second section is named `Problem` (matching mac-terminal-for-developers and git-terminal-for-mac). Component file should be `_components/problem.tsx` and the import name `Problem`. All other section names match the sibling pages.

### Hero
- **eyebrow:** `THE SSH TERMINAL FOR MAC DEVELOPERS`
- **H1:** see §3
- **subtitle:** see §3
- **primary CTA:** see §3
- **secondary link:** see §3
- **SSH angle:** Pick any host from `~/.ssh/config`, forward remote ports to localhost the moment a service binds, and run remote services in panes next to your local ones. The local terminal and the SSH session are the same window.

### Problem — "Your remote dev box lives in a different window from your local stack"
- **eyebrow:** `THE REMOTE-DEV CONTEXT TAX`
- **H2 title:** `Your remote dev box lives in a different window from your local stack`
- **subtitle:** Every modern Mac developer works partly remote — a staging server, a Linux build box, a cloud workstation, a bastion-fronted EC2. That split between "local terminal" and "ssh session" shows up as friction every hour.
- **Three problem cards (with icon + title + body):**

  1. **icon:** `Shuffle` — **You context-switch between local panes and SSH sessions all day**
     Your local API streams logs in one window. A second window holds `ssh user@build-server` for the remote service. A third tab is running an `ssh -L` tunnel so the browser can reach it. Three windows to debug one feature, and every time you tab between them you lose your place.

  2. **icon:** `Plug` — **Port forwarding gymnastics break every time the remote restarts**
     You hand-type `ssh -L 3000:localhost:3000 user@build-server`, the remote dev server restarts, the listener dies, and you re-type the command from shell history. Sometimes you forget which tab the tunnel was in and `lsof` the orphan ssh process out by hand. The work was supposed to be the feature, not the tunnel.

  3. **icon:** `KeyRound` — **Re-typing the host, user, port, and key your `~/.ssh/config` already knows**
     Your `~/.ssh/config` already has `Host build`, `ProxyJump bastion`, the right port, and the right identity file. Most tools make you re-enter all of it anyway — a vault here, a saved profile there, a different connection string in every app. The config import never happens; you just keep typing.

### Features — "What a remote-aware terminal looks like"
- **eyebrow:** `WHAT A REMOTE-AWARE TERMINAL LOOKS LIKE`
- **H2 title:** `An SSH terminal that imports your config, forwards your ports, and runs your remote services next to local ones`
- **subtitle:** Six capabilities that change how remote Mac development feels when the terminal understands SSH instead of just hosting it.
- **Feature cards (icon + title + body):**

  1. **icon:** `ListTree` — **Pick any host from `~/.ssh/config`**
     Open the SSH project picker and a dropdown appears, populated from your `~/.ssh/config`. Selecting a host pre-fills hostname, user, port, and identity file in one click. `Include` directives are followed up to four levels deep, so split configs at `~/.ssh/config.d/work` show up too. Wildcard and `Match` blocks are skipped because they aren't pickable hosts.

  2. **icon:** `Network` — **Remote port forwarding with a readiness check**
     Type a remote port, leave the local port blank, hit Enter. lpm spawns the forward and polls `localhost:<port>` until something actually accepts a TCP connect — only then does the success toast appear. The toast and the working tunnel are in sync, so you click the link and it works the first time. No more guessing whether `ssh -L` actually came up.

  3. **icon:** `Server` — **Remote services in panes, beside your local ones**
     Services declared in the project's YAML run on the remote host but stream into lpm panes the same way local services do. Switch between `staging-api` (remote) and `frontend` (local) like they're the same shape — because in lpm they are. One native Mac window holds the whole stack regardless of which side of the SSH boundary each piece lives on.

  4. **icon:** `Shuffle` — **Action mode: run remote, or sync and run local**
     Each action declares `mode: remote` (run the command on the host over ssh) or `mode: sync` (rsync the remote source tree into a local mirror, run a local tool against it, push changes back). Local formatters, refactors, and AI coding sessions get to act on remote source without you shuttling files. The ssh action mode flips per-action, so each step picks the right side of the wire.

  5. **icon:** `RadioTower` — **Connection multiplexing, ready when the tunnel is**
     Every ssh invocation shares an OpenSSH `ControlMaster` channel — the first auth pays the cost (including any 2FA on a jump host) and every subsequent service start, action run, and terminal open reuses the channel. Forwards report success only after the local listener actually accepts a connection. Server keepalive surfaces a dropped link promptly instead of leaving you staring at a dead pane.

  6. **icon:** `Activity` — **Per-project remote profile, isolated lifecycle**
     Each project carries its own `ssh:` block — host, user, port, key, remote directory — alongside its services and actions. Forwards, port pollers, and rsync mirrors are scoped to that project. Stop the project and every forward dies; quit the app and nothing leaks. `prod`, `staging`, and your local copy are three peer projects, one click apart.

### Benefits — "What changes when your terminal speaks SSH the way you do"
- **eyebrow:** `THE REMOTE-DEV DIFFERENCE`
- **H2 title:** `What changes when your terminal speaks SSH the way you do`
- **subtitle:** Four concrete wins for Mac developers whose work crosses the SSH boundary.
- **Numbered outcomes:**

  1. **You stop hand-typing `ssh -L` for every remote dev server.** Declared service ports auto-forward at start. Ad-hoc binds — a compose port, a one-off debug server — surface as one-click suggestions in the Ports popover the moment they appear on the remote. The success toast only fires when `localhost:<port>` actually accepts a connection, so the link in the toast works the first time.

  2. **You stop re-entering host, user, port, and key data your `~/.ssh/config` already knows.** The picker imports your existing hosts — including chains routed through a jump host with `ProxyJump` — so creating a new SSH project drops to four clicks: pick host, confirm, save, start. The config import is one read; the `~/.ssh/config` file stays the source of truth.

  3. **You stop juggling a local terminal and a remote SSH window.** Local services and remote services run in adjacent panes inside one native Mac window. Switching between projects (prod, staging, your local copy) is one sidebar click; running state is preserved per project. The split between "local terminal" and "ssh session" stops existing as a UI concept.

  4. **You stop losing forwards and tunnels when something restarts.** Forwards are owned by the project. Stop the project and every forward dies cleanly. Restart and lpm re-establishes them. Quit the app and nothing leaks — no orphan ssh processes hiding in `ps`, no `lsof` archaeology to find a tunnel you started yesterday.

### Workflows — "Three real remote-dev scenarios your Mac terminal should make trivial"
- **eyebrow:** `IN PRACTICE`
- **H2 title:** `Three real remote-dev scenarios your Mac terminal should make trivial`
- **subtitle:** Three concrete moments where the local-vs-remote split costs real time — and how lpm collapses them into one window.
- **Numbered workflows:**

  1. **Onboard to a remote dev box without typing a single connection detail**
     A teammate hands you their `~/.ssh/config` snippet — a `Host devbox` entry with `ProxyJump bastion` and the right key path. You paste it into your config, click "Add a project" in lpm, choose "SSH Host", and pick `devbox` from the dropdown. Pick any host from `~/.ssh/config` and the form fills itself. The first ssh invocation prompts for your bastion 2FA once; from then on, the multiplexed channel stays open and every service, action, and terminal reuses it. You're inside the dev box without typing a host, a user, a port, or a key path.

  2. **Push a hotfix to staging without stopping your local stack**
     Your local `frontend` and `api` are streaming logs in two panes. A bug needs to ship to staging fast. Open the staging project (already configured against the remote host), run `migrate` as an action with `mode: remote`, and watch the staging API pane stream the deploy output. Forward the staging API port to localhost from the Ports popover to verify the fix in your browser. Your local panes never stopped — when you're done, click back to the local project and pick up exactly where you were.

  3. **Forward a remote dev server to localhost the moment it starts**
     You start the remote project's `api` service. It prints `Listening on http://0.0.0.0:8080` into its pane. lpm sees the URL in the output, matches it against the declared service port, and auto-forwards — the toast reads `Auto-forwarded :8080 → http://localhost:8080`. Open the URL locally; your browser is talking to the remote process through the SSH channel without you typing a single `-L` flag. Stop the project and the forward dies cleanly. No orphans, no lingering tunnels.

### Comparison — "lpm vs Termius, iTerm2, Warp, raw OpenSSH, and VS Code Remote-SSH"
- **eyebrow:** `HOW IT COMPARES`
- **H2 title:** `lpm vs Termius, iTerm2, Warp, raw OpenSSH, and VS Code Remote-SSH`
- **subtitle:** A capability matrix for Mac developers picking between a dedicated SSH client (Termius), a general terminal (iTerm2, Warp), the underlying tool (raw OpenSSH), and the editor-bundled option (VS Code Remote-SSH).
- See full matrix in §4.

### FAQ — "What Mac developers ask before using lpm as their SSH terminal"
- **eyebrow:** `FAQ`
- **H2 title:** `What Mac developers ask before using lpm as their SSH terminal`
- **subtitle:** (none — the questions carry the section)
- See full Q&A in §5.

### CTA — "Your local stack and your remote dev box, finally in the same window"
- **eyebrow:** (none, large hero-style CTA)
- **H2 title:** `Your local stack and your remote dev box, finally in the same window.` / `Free, native, and ready in two minutes.`
- **subtitle:** Download a native macOS binary, drag to Applications, open the picker, and choose a host from your `~/.ssh/config`. lpm forwards your remote ports the moment they bind, runs remote services in panes alongside local ones, and never leaks a stray ssh process. Works on every Intel and Apple Silicon Mac running macOS 12 or later.
- **Primary CTA:** `Download for macOS` (uses existing `HeroDownload` component)
- **Secondary link:** `View on GitHub →`

---

## 3. Hero-specific

- **Eyebrow:** `THE SSH TERMINAL FOR MAC DEVELOPERS`
- **H1:** `The Mac terminal that keeps your local stack and your remote dev box in the same window.`
- **Subtitle paragraph:** Pick any host from `~/.ssh/config`, forward remote ports to localhost the moment a service binds, and run remote services in panes next to your local ones — all in one native Mac window. Native Apple Silicon, zero Electron.
- **Primary CTA label:** `Download for macOS` (uses existing `HeroDownload`)
- **Secondary link label:** `View on GitHub`

---

## 4. Comparison matrix

Columns (left-to-right):
`lpm | Termius | iTerm2 | Warp | raw OpenSSH | VS Code Remote-SSH`

Six capability rows (boolean per column). Rows 1–6 from the outline candidates — the SSH-distinct lane. Rows 7–8 (Apple Silicon, OSS) are sibling-shared and dropped here so the matrix stays focused.

| Capability | lpm | Termius | iTerm2 | Warp | raw OpenSSH | VS Code Remote-SSH |
|---|---|---|---|---|---|---|
| Imports hosts from `~/.ssh/config` (with `ProxyJump` chains) | true | false | true | true | true | true |
| One-click remote port forward with a local-listener readiness check | true | false | false | false | false | false |
| Auto-detects remote-bound ports and offers a one-click forward | true | false | false | false | false | false |
| Remote services in panes alongside local services in one window | true | false | false | false | false | false |
| Per-project SSH profile with isolated forward and poll lifecycle | true | false | false | false | false | false |
| Run a local tool against a remote source tree (action `mode: sync`) | true | false | false | false | false | false |

Notes for the engineer:
- Keep lpm column visually highlighted (same treatment as the existing comparison component on sibling pages).
- Use `Check` / `X` icons from `lucide-react` via the existing `Indicator` helper — boolean only.
- Termius row 1 is `false`: Termius keeps its own host vault rather than using `~/.ssh/config` directly. The row label's "imports from `~/.ssh/config`" qualifier carries the nuance.
- Mobile view: per-alternative card list, identical to the existing comparison's responsive pattern on sibling pages.
- Column headers in the matrix: `Termius`, `iTerm2`, `Warp`, `raw OpenSSH`, `VS Code Remote-SSH`.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Q:** Does lpm replace Termius as my SSH client on Mac?
   **A:** For developers who want their terminal to handle remote work alongside local services, yes — lpm imports `~/.ssh/config` directly (no separate host vault), runs remote services in panes next to your local ones, and forwards ports without leaving the window. If you specifically need a saved-snippet library or an SFTP file browser, Termius still does those things; lpm is a terminal-first SSH workspace, not a feature-parity Termius alternative on Mac. For most remote-dev workflows, the terminal-first approach replaces the dedicated client entirely.

2. **Q:** How does lpm import my `~/.ssh/config`?
   **A:** When you add an SSH project, lpm reads `~/.ssh/config` (and any files referenced by `Include` directives, up to four levels deep), parses out the non-wildcard `Host` blocks, and shows them in a dropdown. Pick any host from `~/.ssh/config` and lpm pre-fills hostname, user, port, and identity file in the form. `ProxyJump` and `ProxyCommand` chains carry over automatically because every ssh invocation runs through your existing config — the config import is one read, and your `~/.ssh/config` stays the single source of truth.

3. **Q:** Can I forward a remote port to localhost without typing `ssh -L`?
   **A:** Yes — that's the whole point of the Ports popover. Type the remote port, leave the local port blank, hit Enter; lpm spawns the forward, polls `localhost:<port>` until something actually accepts a connection, and only then surfaces the success toast. So you know the tunnel is usable, not just spawned. Declared service ports auto-forward at start, and ad-hoc binds discovered on the remote surface as one-click suggestions — remote port forwarding without the `ssh -L` archaeology.

4. **Q:** Does lpm work with a jump host or bastion (`ProxyJump`)?
   **A:** Yes. Because lpm uses your `~/.ssh/config`, anything you've already configured — `ProxyJump bastion`, `ProxyCommand`, or a chain of jumps — carries over without any lpm-side config. Pick the inside-VPC host from the dropdown and lpm opens services through the jump host transparently. The first connection prompts for whatever your bastion requires (key passphrase, 2FA); the multiplexed channel keeps it open after that, so you don't re-auth on every action.

5. **Q:** What's the difference between `mode: remote` and `mode: sync` for actions?
   **A:** This is the ssh action mode switch on each action. `mode: remote` (the default for SSH projects) runs the action's command on the remote host over ssh — useful for a deploy, a migration, a remote build. `mode: sync` rsyncs the remote source tree into a local mirror, runs the action locally against the mirror, and pushes changes back — so a local tool (a code formatter, an IDE refactor, an AI coding session) can act on remote source without you shuttling files manually. Each action picks its mode independently.

6. **Q:** Is lpm a good iTerm2 or Warp alternative for SSH work specifically?
   **A:** Both iTerm2 and Warp are good Mac terminals, but they treat SSH as "any other shell command" — you're on your own for host management, port forwarding, and lifecycle. lpm adds the project model around the SSH session itself: a host picker reading `~/.ssh/config`, a port-forward UX with readiness checks, auto-detection of remote-bound ports, and per-project lifecycle for forwards. If your day is mostly local terminal work with the occasional `ssh user@host`, the iterm2 ssh workflow is fine. If you cross the local/remote line every hour, lpm is the warp terminal ssh alternative built for that workflow.

---

## Notes for engineers copying this file

### Component filenames and section names

The second section is **`Problem`** (matching mac-terminal-for-developers and git-terminal-for-mac). Use:
- Component file: `_components/problem.tsx`
- Import name: `Problem`

All other components follow the same names as the sibling pages:
- `_components/hero.tsx` → `Hero`
- `_components/features.tsx` → `Features`
- `_components/benefits.tsx` → `Benefits`
- `_components/workflows.tsx` → `Workflows`
- `_components/comparison.tsx` → `Comparison`
- `_components/faq.tsx` → `Faq`
- `_components/cta.tsx` → `Cta`

Page render order: `Hero → Problem → Features → Benefits → Workflows → Comparison → Faq → Cta`

### Comparison matrix deviation

The comparison columns differ from all three sibling pages. The alternatives are **Termius, iTerm2, Warp, raw OpenSSH, VS Code Remote-SSH** — chosen to cover the four real categories a Mac developer compares against when picking an SSH workflow: a dedicated SSH client (Termius), a general terminal (iTerm2, Warp), the underlying tool (raw OpenSSH), and the editor-bundled option (VS Code Remote-SSH). Column headers in the matrix: `Termius`, `iTerm2`, `Warp`, `raw OpenSSH`, `VS Code Remote-SSH`.

### Path constant

- Path constant name: `SSH_TERMINAL_MAC_PATH` in `@/lib/links`
- Canonical URL: `/ssh-terminal-for-mac`

### Other notes

- All copy above is plain prose. No TSX in copy strings — render inside the existing `SectionHeader`, `FeatureCard`, `HeroDownload`, comparison table, and FAQ details patterns used by the sibling pages.
- Inline `<code>` (className `text-xs`) is appropriate for `~/.ssh/config`, `ProxyJump`, `mode: remote`, `mode: sync`, `ssh -L`, `localhost:3000`, etc., when rendered into JSX-allowed slots (Features `body`, Workflows `body`).
- Icon names listed per Feature card are from `lucide-react`. `ListTree`, `Network`, `Server`, `Shuffle`, `RadioTower`, `Activity` should all exist in the project's icon set; if not, swap to the closest equivalent.
- Required terms landed on page: `ProxyJump` (Hero subtitle area via subtitle context, Problem card 3, Features 1, FAQ 4), `remote port forwarding` (Features 2, Benefits 1, FAQ 3), `ssh action mode` (Features 4, FAQ 5), `jump host` (Features 5, FAQ 4), `config import` (Problem card 3, Features 1, Benefits 2, FAQ 2).
- Required SEO keyword reinforcement: `termius alternative mac` (FAQ 1), `iterm2 ssh workflow` (FAQ 6), `warp terminal ssh alternative` (FAQ 6).
- "Pick any host from `~/.ssh/config`" hook lands in: Hero subtitle, Workflow 1, FAQ 2 (per upstream meta-description reinforcement requirement).
- For FAQ JSON-LD: answers are plain text (variant A), so `typeof answer === "string"` works and no `answerText` override is needed.
- Add the new route to the sitemap and to the shared nav/link constants following the pattern used for `MAC_TERMINAL_DEVELOPERS_PATH` and `GIT_TERMINAL_MAC_PATH` in `@/lib/links`.
- Keep the `lpm` column highlighted in the comparison matrix and lead with the SSH-distinct rows (rows 1–6 above are already in that order).
- All placeholders in copy are generic (`user@build-server`, `prod-db.example.com`, `Host devbox`, `~/Code/<repo>`, `localhost:3000`, `localhost:8080`). No real personal hostnames, IPs, paths, or emails appear anywhere on the page.
