# SSH SEO page — keyword strategy and final metadata block

This file is the keyword-strategist deliverable for `/ssh-terminal-for-mac`.
The page-integrator pastes Sections 3 and 4 into `page.tsx` verbatim. All
character counts below were measured with `printf '%s' "…" | wc -c`.

---

## 1. Final route slug

**Route: `/ssh-terminal-for-mac`**

Rationale (one line): mirrors the established sibling naming pattern
(`/best-terminal-for-mac`, `/git-terminal-for-mac`,
`/mac-terminal-for-developers`) and matches the primary keyword exactly,
which gives the canonical URL a clean exact-match signal. The alternative
`/ssh-client-for-mac` was rejected because the "ssh client" SERP is
dominated by Termius landing pages and review-aggregator sites — head-on
competition without a sibling-naming signal would be a losing fight.
Using `terminal` instead of `client` also keeps lpm framed as a terminal
product (where it actually wins) rather than a Termius-style standalone
SSH client (where it does not compete on parity features like SFTP
browsers, saved snippets, or syncing).

---

## 2. Primary keyword

**Primary: `ssh terminal for mac`**

Rationale:

1. **Search intent fit.** Users typing this phrase want a Mac terminal
   that is good at SSH — exactly what the new feature surface delivers
   (host picker reading `~/.ssh/config`, ControlMaster multiplexing, port
   forwarding, action mode switching). They are not shopping for a
   standalone SSH client like Termius; they want their existing terminal
   to handle remote work without configuration friction.
2. **Sibling consistency.** Every other SEO page on the site uses the
   `<modifier> terminal for mac` head-term pattern. Reusing it preserves
   internal-link semantic clustering and keeps the "for Mac" qualifier
   that already pulls Apple Silicon traffic for siblings.
3. **Distinct lane.** None of the three siblings target SSH, remote, port
   forwarding, jump host, bastion, or `~/.ssh/config`. The keyword array
   below carves a clean SSH/remote angle that does not cannibalize their
   ranking surface — verified against:
   - `best-terminal-for-mac` (head: best terminal for mac; angle: native
     Apple Silicon, no Electron)
   - `mac-terminal-for-developers` (head: mac terminal for developers;
     angle: full-stack multi-service)
   - `git-terminal-for-mac` (head: git terminal for mac; angle: git
     workflow + dev servers same window)
4. **Volume vs achievability.** `ssh client for mac` has higher volume but
   is owned by Termius/iTerm2 review pages. `ssh terminal for mac` is
   lower-volume but more achievable, and the long-tails in the keyword
   array (port forwarding, `~/.ssh/config`, jump host, remote dev box)
   compound to capture the same intent without head-on Termius competition.

**Long-tail anchors** (used heavily in body copy and in the keyword array
below): `~/.ssh/config host picker`, `remote port forwarding mac`,
`ssh + dev server mac terminal`, `mac terminal for remote dev box`,
`jump host terminal mac`, `Termius alternative mac`.

---

## 3. Full keyword array (TS-ready)

20 entries. Order: primary head term, head-term variants, feature long-tails,
workflow long-tails, competitor alternatives, brand. Last two entries are
always `"lpm"` and `"local project manager"` per template contract
(template-spec.md §4.1).

```ts
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
],
```

Cannibalization audit (per-keyword, vs siblings):

| Keyword                              | Conflicts with sibling? |
|--------------------------------------|-------------------------|
| ssh terminal for mac                 | No                      |
| ssh client for mac                   | No                      |
| mac terminal ssh                     | No                      |
| macos ssh terminal                   | No                      |
| ssh terminal mac developers          | No                      |
| mac terminal with ssh config         | No                      |
| ssh config host picker mac           | No                      |
| ssh port forwarding mac terminal     | No                      |
| remote port forwarding mac           | No                      |
| mac terminal for remote dev box      | No                      |
| ssh and dev server mac terminal      | No (siblings own "git + dev server", not ssh) |
| jump host terminal mac               | No                      |
| bastion host terminal mac            | No                      |
| ec2 ssh terminal mac                 | No                      |
| mac terminal for remote development  | No                      |
| termius alternative mac              | No (no sibling targets Termius) |
| iterm2 ssh workflow                  | Light overlap with siblings on "iterm2 alternative", but the SSH qualifier flips it to a distinct intent (workflow integration vs replacement) |
| warp terminal ssh alternative        | Light overlap with sibling "warp terminal alternative" (developers page), but SSH qualifier carves a distinct facet |
| lpm                                  | Brand — appears on every page |
| local project manager                | Brand — appears on every page |

The two "light overlap" entries are kept on purpose: they capture
SSH-specific intent ("how do I do SSH well in iterm2/Warp?") that the
generic alternative pages on siblings do not satisfy. They reinforce, not
cannibalize, because the SSH qualifier in the keyword changes the SERP
intent cluster.

Notes on what was deliberately **excluded**:

- `tmux` — feedback memory says don't surface tmux in user-facing copy
  (it is an implementation detail).
- Real personal hostnames, IPs, paths — never appear in copy per template
  spec §5.2.
- `ssh -L` / `ssh -N -L` — too implementation-shaped for SEO; the
  natural-language equivalents ("port forwarding", "remote port
  forwarding mac") cover the same intent without alienating readers
  scanning the meta description.
- `proxyjump` — covered semantically by `jump host terminal mac` and
  `bastion host terminal mac`. Including the literal directive name does
  not add unique search-volume; the natural phrases do.

---

## 4. Title, description, openGraph, twitter — TS-ready

All counts measured with `printf '%s' "…" | wc -c`. The em-dash counts as
one byte in the title/description (UTF-8 multi-byte: 3 bytes), but Google
truncates by **rendered character width**, not bytes, so the displayed
length is what matters. Counts below show **bytes** (because that is what
common tooling reports) but I have verified each title visually fits in
the SERP truncation window of ~580 px.

### 4.1 Title — 55 chars (target ≤60)

```
SSH Terminal for Mac — Remote Dev Boxes in One Window
```

- Includes the primary keyword **verbatim** at the start.
- "Remote Dev Boxes" carries the differentiator (matches user intent of
  "remote machine I SSH into").
- "in One Window" mirrors sibling tonal cadence ("...in One Window",
  "Branch, Rebase, and Ship Faster").

### 4.2 Description — 156 chars (target 150–165)

```
Pick any host from ~/.ssh/config, forward remote ports to localhost, and run remote services side by side with local ones in one native Mac terminal window.
```

- Leads with action verb ("Pick"), per voice guide §5.2 (direct,
  second-person implied, present tense).
- Hits three feature long-tails: `~/.ssh/config`, `forward remote ports`,
  `remote services side by side`.
- Avoids real hostnames/IPs/emails per feedback memory.
- "native Mac terminal window" reinforces the head term `ssh terminal for mac`.

### 4.3 openGraph block

```ts
openGraph: {
  title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
  description:
    "Pick any ~/.ssh/config host, forward remote ports to localhost, and run remote services side by side with local ones in a native Mac terminal.",
  type: "website",
  url: SSH_TERMINAL_MAC_PATH,
  siteName: "lpm",
},
```

- OG description: 142 chars (siblings' OG descriptions run shorter and
  punchier than the meta description; this one shaves the leading verb
  and the trailing "window" qualifier).

### 4.4 twitter block

```ts
twitter: {
  card: "summary_large_image",
  title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
  description:
    "An SSH terminal that imports your ~/.ssh/config, forwards remote ports to localhost, and runs remote services in panes alongside your local stack.",
},
```

- Twitter description: 146 chars. Different framing ("imports your
  ~/.ssh/config", "in panes alongside your local stack") so the X
  preview reads fresh even if the same user has seen the OG card on
  another platform. Avoids "tmux" per feedback memory — uses "panes" as
  the user-facing term.

### 4.5 Full metadata block (drop-in for `page.tsx`)

```ts
import type { Metadata } from "next";
import { SSH_TERMINAL_MAC_PATH } from "@/lib/links";

export const metadata: Metadata = {
  title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
  description:
    "Pick any host from ~/.ssh/config, forward remote ports to localhost, and run remote services side by side with local ones in one native Mac terminal window.",
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
  ],
  alternates: {
    canonical: SSH_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
    description:
      "Pick any ~/.ssh/config host, forward remote ports to localhost, and run remote services side by side with local ones in a native Mac terminal.",
    type: "website",
    url: SSH_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
    description:
      "An SSH terminal that imports your ~/.ssh/config, forwards remote ports to localhost, and runs remote services in panes alongside your local stack.",
  },
};
```

### 4.6 Acceptance check (against template-spec.md §4.1 targets)

| Field                       | Target                | Actual | Pass |
|-----------------------------|-----------------------|--------|------|
| `title` chars               | 50–60                 | 55     | ✓    |
| `description` chars         | 150–165               | 156    | ✓    |
| `keywords` count            | 18–20                 | 20     | ✓    |
| Last two keywords           | `"lpm"`, `"local project manager"` | yes | ✓ |
| `alternates.canonical`      | `SSH_TERMINAL_MAC_PATH` (path string starting with `/`) | yes | ✓ |
| `openGraph.url`             | `SSH_TERMINAL_MAC_PATH` | yes | ✓ |
| `openGraph.siteName`        | `"lpm"`               | yes    | ✓    |
| `twitter.card`              | `"summary_large_image"` | yes  | ✓    |
| No `images` field           | (per §4.3)            | absent | ✓    |
| No `metadataBase` override  | (per §4.2 notes)      | absent | ✓    |
| No `robots` override        | (per §4.2 notes)      | absent | ✓    |

---

## 5. Notes for downstream agents

- **Content architect (#4):** the "Pick any host from ~/.ssh/config" hook
  appears in the meta description; mirror that phrasing in Hero subtitle
  and Workflow #1 so on-page copy reinforces meta. Comparison alternatives
  to consider (do not overlap with siblings' columns where possible):
  Termius, iTerm2, Warp, raw OpenSSH + tmux, VS Code Remote-SSH, Tabby.
- **Copywriter (#5):** the keyword array includes `termius alternative mac`,
  `iterm2 ssh workflow`, `warp terminal ssh alternative`. Use each at
  least once in body copy (hero subtitle, comparison eyebrow, FAQ answer)
  to reinforce SEO without keyword-stuffing.
- **Page integrator (#11):** add `SSH_TERMINAL_MAC_PATH = "/ssh-terminal-for-mac"`
  to `website/lib/links.ts`, and add the path to the footer Guides nav
  and `app/sitemap.ts` per template-spec.md §6.
