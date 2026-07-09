# lpm mobile ↔ desktop wire protocol (v1)

The desktop server lives in `desktop/frontend/src-tauri/src/remote.rs`. The phone
is a WebSocket client. This document is the contract both sides implement.

## Transport

- `ws://<host>:<port>/` — plaintext WebSocket (`tungstenite` on the server).
- Default port `8765` (configurable in Settings → Mobile devices).
- The server binds `127.0.0.1` (loopback) by default, or `0.0.0.0` when the user
  enables "Allow connections over the network". For away-from-home use, run both
  devices on a **Tailscale** tailnet and connect to the Mac's tailnet IP — that
  provides the encryption the plaintext transport itself does not. Native TLS is
  a planned follow-up.
- Every frame is a **text** WebSocket message containing a JSON object with a
  discriminator field `t`. Unknown `t` values are ignored (forward-compatible).

## Handshake (first frame, required within 20s)

The phone sends exactly one of:

**Pair** (first time, using a one-time code from the desktop's QR):
```json
{ "t": "pair", "code": "AB12-CD34", "name": "Gurgen's iPhone" }
```
→ on success the server replies and the code is consumed (single use):
```json
{ "t": "paired", "deviceId": "<uuid>", "token": "<base64 bearer token>" }
```
The phone stores `deviceId` + `token` in the Keychain. On rejection:
```json
{ "t": "error", "error": "pairing rejected" }
```

**Auth** (every subsequent connect):
```json
{ "t": "auth", "deviceId": "<uuid>", "token": "<base64 bearer token>" }
```
→ `{ "t": "ready" }` on success, or `{ "t": "error", "error": "unauthorized" }`.

The server stores only `sha256(token)`; the raw token never leaves the phone
after pairing. Revoking a device in desktop Settings deletes its hash and drops
any live connection.

## Requests (phone → desktop) and their replies

| Request | Reply |
|---|---|
| `{ "t": "projects" }` | `{ "t": "projects", "projects": [ProjectInfo…] }` |
| `{ "t": "terminals", "project": "<name>" }` | `{ "t": "terminals", "project": "<name>", "terminals": [Terminal…] }` |
| `{ "t": "slash", "id": "<termId>", "project": "<name>" }` | `{ "t": "slash", "id": "<termId>", "commands": [SlashCommand…] }` — slash-command autocomplete; empty unless the terminal runs a known AI CLI (the frontend registers each terminal's CLI, detected from its launch command) |
| `{ "t": "upload", "id": "<termId>", "data": "<base64 image>", "mime": "image/jpeg" }` | `{ "t": "upload", "id": "<termId>", "ok": true, "path": "<on-Mac path>" }` / `{ "ok": false, "error": "…" }` — saves the image to a temp file on the Mac (scp'd first for a remote pane); the phone drops the path into the composer, which pastes it so an agent loads the image |
| `{ "t": "mentions", "project": "<name>" }` | `{ "t": "mentions", "project": "<name>", "entries": [{ path, dir, changed }…] }` — @-mention targets: the project's files/dirs (relative paths), with git working-tree changes flagged. Fetched once, filtered client-side |
| `{ "t": "history", "project": "<name>", "q": "<search>" }` | `{ "t": "history", "project": "<name>", "rows": [HistoryRow…] }` — recent sent prompts for the project (newest first), for recall |
| `{ "t": "historyAdd", "project": "<name>", "id": "<termId>", "label": "<tab>", "text": "…" }` | — records a prompt the phone sent into the shared message history |
| `{ "t": "status", "project": "<name>" }` | `{ "t": "status", "project": "<name>", "status": [StatusEntry…] }` |
| `{ "t": "sub", "id": "<termId>" }` | `{ "t": "seed", "id": "<termId>", "cols": N, "rows": N, "data": "<recent scrollback>", "owner": ControlOwner\|null }`, then a live stream of `o` frames. Subscribing also *presents* the terminal (see control ownership below); `owner` tells the phone whether it may render live or must show a "take control" placeholder |
| `{ "t": "unsub", "id": "<termId>" }` | — (also stops presenting the terminal) |
| `{ "t": "claim", "id": "<termId>" }` | — (the "Take control" action) takes ownership of the terminal; the previous owner is pushed a `control` frame and flips to its own placeholder |
| `{ "t": "in", "id": "<termId>", "d": "ls\r" }` | — (keystrokes; see hex framing) |
| `{ "t": "resize", "id": "<termId>", "cols": N, "rows": N }` | — (see note) |
| `{ "t": "runAction", "project": "<name>", "action": "<actionName>" }` | `{ "t": "runAction", "ok": true }` — relayed to the desktop's owner window, which runs the action in its normal terminal flow (needs the main window open). The new terminal appears on a subsequent `terminals` re-request |
| `{ "t": "newTerminal", "project": "<name>" }` | `{ "t": "newTerminal", "ok": true }` — same relay; opens a plain terminal in the project |
| `{ "t": "closeTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "closeTerminal", "ok": true }` — owner-window relay; kills the terminal and removes its tab. Re-request `terminals` to refresh |
| `{ "t": "renameTerminal", "project": "<name>", "id": "<termId>", "label": "<new>" }` | `{ "t": "renameTerminal", "ok": true }` — relay; renames the desktop tab (a `terminals.json` write, no PTY op) |
| `{ "t": "pinTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "pinTerminal", "ok": true }` — relay; toggles the tab's pinned flag |
| `{ "t": "duplicate", "name": "<name>", "count": N, "labels": ["<per-copy>"…], "groupName": "<folder>", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool, "runMode": "none"\|"action"\|"command", "action": "<actionName>", "command": "<cmd>", "prompt": "<text>" }` | Streams `{ "t": "duplicateProgress", "done": i, "total": N, "name": "<copy>" }` per copy as they're created, then a final `{ "t": "duplicate", "ok": true, "name": "<first>", "names": [...], "warning": "…"? }` / `{ "ok": false, "error": "…" }` — clones the project, mirroring the desktop modal. Rust creates each copy directly (works with no main window) with `labels[i]` as copy i's display label (blank → auto-named); `groupName` groups them under a sidebar folder (replicating the desktop's applySidebarLayout — writes groups.json + settings.json). The three git toggles default false (phone seeds `pullLatest` true from settings). **runMode** `action`/`command`: after creation, each copy's task is relayed to the main window (`remote-run-task`) which runs it in the copy's terminal (types the command, seeds the AI `prompt`) — **that step needs the desktop main window open**; if it's closed, copies are still made and the reply carries a `warning`. Copies also reach the phone via `projects-changed`. `name` = first copy; `names` = all created |
| `{ "t": "duplicateDefaults" }` | `{ "t": "duplicateDefaults", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool }` — the desktop's persisted duplicate-modal toggle defaults (from `settings.json`), so the phone's duplicate modal opens with the same initial state. Fallbacks mirror the desktop: `excludeUncommitted`/`reinstallDeps` default false, `pullLatest` defaults true |
| `{ "t": "remove", "name": "<name>" }` | `{ "t": "remove", "ok": true }` / `{ "ok": false, "error": "…" }` — tears down the project and, for a duplicate, deletes its folder from disk. Refuses an original that still has duplicates referencing it. The phone only offers this for duplicates |
| `{ "t": "start", "name": "<name>", "profile": "" }` | `{ "t": "start", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "stop", "name": "<name>" }` | `{ "t": "stop", "ok": … }` |
| `{ "t": "toggleService", "name": "<name>", "service": "<svc>" }` | `{ "t": "toggleService", "ok": … }` |
| `{ "t": "ping" }` | `{ "t": "pong" }` |

### Git review & ship

Review a project's working-tree changes and ship them (pull, push, fetch, switch
branch, commit, open a PR, discard) from the phone — mirroring the desktop's
project Git submenu. Every reply echoes the `project` it was addressed to, so a
reply can be matched to its request even with several in flight. The **local**
ops (`git` status, `gitDiff`, `gitCommit`, `gitBranches`, `gitCheckout`,
`gitDiscardAll`) reply inline; the **network / AI** ops (`gitPull`, `gitPush`,
`gitFetch`, `gitCreatePr`, and the AI generators) are slow and run on a worker
thread on the desktop, so their reply arrives asynchronously — there is no
separate ack, the phone just waits for the typed reply below.

Pull, push, and fetch take no flags from the phone: the desktop applies the
user's persisted git options (`gitPull` `{strategy, autostash, noVerify}`,
`gitPush` `{mode, noVerify, tags}`, `gitFetch` `{all, prune, pruneTags, tags}`),
identical to the desktop submenu, so behavior stays consistent across surfaces.

| Request | Reply |
|---|---|
| `{ "t": "git", "project": "<name>" }` | `{ "t": "git", "project": "<name>", "ok": true, "isRepo": bool, "branch": "…", "detached": bool, "hasUpstream": bool, "ahead": N, "behind": N, "defaultBranch": "…", "ghCli": bool, "files": [{ path, status, staged, stamp }…] }` — the project's git status + changed files in one shot. `status` ∈ `added`\|`deleted`\|`renamed`\|`modified`\|`untracked`. `stamp` is an **opaque change token** for the file's working-tree content: if a file's `stamp` is unchanged between two snapshots, its diff is unchanged and needn't be refetched (skip the `gitDiff` round-trip); treat an unknown or absent `stamp` as changed (older servers omit it, so always refetch then). `ghCli` reports whether the `gh` CLI is available (gates the "Open PR" affordance). When the project isn't a git repo: `ok:true, isRepo:false` with empty/zero fields. On a bad project: `{ "ok": false, "error": "…" }` |
| `{ "t": "gitDiff", "project": "<name>", "path": "<file>" }` | `{ "t": "gitDiff", "project": "<name>", "path": "<file>", "ok": true, "diff": "<unified diff>", "binary": bool, "truncated": bool }` — the unified diff (HEAD vs working tree) for one file, including untracked files. A binary file returns `binary:true, diff:""`. The diff is capped at ~400 KB, truncated at a line boundary with `truncated:true` when it exceeds that. Errors → `{ "ok": false, "error": "…" }` |
| `{ "t": "gitCommit", "project": "<name>", "message": "…", "files": ["<path>"…] }` | `{ "t": "gitCommit", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — stages exactly the given files (resetting the index first) and commits them with `message` |
| `{ "t": "gitPush", "project": "<name>" }` | `{ "t": "gitPush", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — `git push -u origin HEAD`, applying the persisted `gitPush` flags (`--force-with-lease` when `mode=="force-with-lease"`, `--no-verify`, `--tags`). Async (network) |
| `{ "t": "gitPull", "project": "<name>" }` | `{ "t": "gitPull", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — pulls with the persisted `gitPull` strategy (`ff` default \| `ff-only` \| `rebase`) and flags (`--autostash`, `--no-verify`). Async (network) |
| `{ "t": "gitFetch", "project": "<name>" }` | `{ "t": "gitFetch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — fetches with the persisted `gitFetch` flags (`--all`, `--prune` default on; `--prune-tags`, `--tags` default off). Async (network) |
| `{ "t": "gitBranches", "project": "<name>" }` | `{ "t": "gitBranches", "project": "<name>", "ok": true, "current": "<branch>", "branches": [{ name, committerDate, remote? }…] }` / `{ "ok": false, "error": "…" }` — the branch list for the "Switch branch" picker (local + remote, newest first). `remote` is **omitted** for a local branch (present only for a remote-tracking one). `current` is the checked-out branch. Inline |
| `{ "t": "gitCheckout", "project": "<name>", "branch": "<name>", "remote": "<remote>" }` | `{ "t": "gitCheckout", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — checks out `branch`; pass the `remote` from a `gitBranches` entry to create a local tracking branch (empty `remote` for a plain local checkout). Inline |
| `{ "t": "gitDiscardAll", "project": "<name>" }` | `{ "t": "gitDiscardAll", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — discards all working-tree changes (reset + clean). Inline |
| `{ "t": "gitWatch", "project": "<name>" }` | `{ "t": "gitWatch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — starts watching the project's working tree **for this connection**; while watched, the desktop sends a debounced `git-changed` push (below) on each burst of file changes so the review screen self-refreshes. Watching an already-watched project is a no-op (still `ok:true`). The watch is scoped to the connection and is dropped on `gitUnwatch`, disconnect, and device revocation. Inline |
| `{ "t": "gitUnwatch", "project": "<name>" }` | `{ "t": "gitUnwatch", "project": "<name>", "ok": true }` — stops watching the project for this connection (no-op if it wasn't watched). Inline |
| `{ "t": "gitGenMessage", "project": "<name>", "files": ["<path>"…] }` | `{ "t": "gitGenMessage", "project": "<name>", "ok": true, "message": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a commit message from the diff of the given files. Async (AI). Uses the desktop's persisted AI settings (`aiCli` default `claude`, `aiModel`, `aiEffort`, `aiFast`) |
| `{ "t": "gitGenPr", "project": "<name>" }` | `{ "t": "gitGenPr", "project": "<name>", "ok": true, "title": "…", "body": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a PR title and description for the current branch vs the default branch. Async (AI); same AI settings as above |
| `{ "t": "gitCreatePr", "project": "<name>", "title": "…", "body": "…" }` | `{ "t": "gitCreatePr", "project": "<name>", "ok": true, "url": "<pr url>" }` / `{ "ok": false, "error": "…" }` — pushes the current branch and opens a PR via the `gh` CLI against the default branch, returning its URL. Async (network) |

### Push notifications (APNs)

While the app is backgrounded its socket dies, so agent status changes reach the
phone as APNs pushes instead. The desktop sends them via a relay (the lpm
website) that holds the APNs signing key; notification content is end-to-end
encrypted, so the relay sees only opaque blobs and device tokens.

| Request | Reply |
|---|---|
| `{ "t": "apnsToken", "token": "<hex APNs device token>", "env": "production"\|"sandbox", "key": "<base64 32-byte push key>" }` | `{ "t": "apnsToken", "ok": true }` — registers (or refreshes) this device's push identity; sent after every successful `auth`, since the token can rotate. `env` is the APNs environment the build's token belongs to (debug builds → `sandbox`, TestFlight/App Store → `production`). `key` is the phone-generated AES-256 push key; the phone keeps **one** push key (Keychain, shared with the notification extension) and registers the same key with every paired Mac, so the extension never has to guess which key decrypts. All three fields persist on the device record in `remote.json` |

**When the desktop pushes.** On an agent status transition to `Waiting`, `Done`,
or `Error` (the same `status-changed` signal that drives the socket push), for
every registered device that does **not** currently hold a live authed
connection (a live socket means the app is foregrounded and already sees the
change). Transitions are deduped per (project, status key) so a re-reported
identical status never re-notifies.

**Payload encryption.** The notification plaintext is JSON:
```
{ "project": "<name>", "terminal": "<tab label>", "status": "Waiting"|"Done"|"Error", "ts": <unix millis> }
```
(`terminal` may be empty when the pane label is unknown.) It is sealed with
AES-256-GCM under the device's push key, encoded as `nonce(12) || ciphertext ||
tag(16)` in standard base64 — CryptoKit's `AES.GCM.SealedBox(combined:)` format.

**Relay contract.** The desktop POSTs JSON to the relay
(`https://lpm.cx/api/push` by default; `pushRelay` in `remote.json` overrides,
e.g. for a local `next dev`):
```
{ "token": "<hex device token>", "env": "production"|"sandbox", "blob": "<base64 sealed payload>" }
```
The relay signs an APNs provider JWT with its `.p8` key (env vars
`APNS_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_TOPIC`, topic defaulting to
`cx.lpm.mobile`) and forwards to the matching APNs environment as an `alert`
push, priority 10, expiring after ~6h (a stale approval ping is noise):
```
{ "aps": { "alert": { "title": "lpm", "body": "Activity on your Mac" }, "sound": "default", "mutable-content": 1 }, "blob": "<base64>" }
```
The `aps.alert` is a deliberately generic fallback: the phone's notification
service extension decrypts `blob` and rewrites the title/body (e.g.
"web-app — agent is waiting"); if decryption fails the generic text shows and
nothing leaks. Relay replies `{ "ok": true }` or
`{ "ok": false, "status": <apns http status>, "reason": "<apns reason>" }`; on
`410`/`Unregistered` the desktop clears that device's stored token so dead
installs stop generating traffic.

### Server-initiated pushes (desktop → phone)

| Frame | Meaning |
|---|---|
| `{ "t": "o", "id": "<termId>", "d": "<utf-8 chunk>" }` | Terminal output. Feed straight into the terminal emulator. |
| `{ "t": "exit", "id": "<termId>", "code": N }` | The terminal's process exited. |
| `{ "t": "projects-changed" }` | A project started/stopped/renamed. Re-request `projects`. |
| `{ "t": "status-changed", "project": "<name>" }` | A status badge changed (e.g. an agent is now Waiting). Re-request `status`. |
| `{ "t": "git-changed", "project": "<name>" }` | The watched project's working tree changed (sent only to a connection that issued `gitWatch` for it, debounced ~400ms after the last change). Carries no payload — re-request `git` and any open `gitDiff`s to refresh the review screen. |
| `{ "t": "control", "id": "<termId>", "owner": ControlOwner\|null }` | The terminal's control owner changed. If `owner` is not this phone, show the "take control" placeholder and stop driving size; if it is (or `null`), render live. |

## Data shapes

**ProjectInfo** — an opaque JSON object; the fields the phone uses:
```
name: string            // stable id (the project file name)
label: string           // display name
running: bool
services: [ { name, cmd, cwd, port, portConflict, env } ]   // running services
allServices: [ … ]
profiles: [ { name, services } ]
activeProfile: string
statusEntries: [StatusEntry]
isRemote: bool
parentName: string        // the project this is a duplicate of; empty for originals — the phone offers Remove only when set
actions: [ActionInfo]     // recursive: { name (composite parent:child), label, emoji, cmd, type, display, children[] … }
```

**Terminal**:
```
id: string       // e.g. "MyProject-3" — use as <termId> in sub/in/resize
label: string    // the desktop tab name (e.g. "Ultracode"); falls back to id
project: string
cols: uint16
rows: uint16
remote: bool     // spawned over ssh
pinned: bool     // desktop tab pin state
emoji: string    // the tab's emoji icon (empty if unset) — mirrors the desktop tab icon
```
The `label` and `pinned` state come from the desktop's tab tree, which the
frontend registers with the server (`remote_set_terminal_labels`). terminals.json
persists labels but not the ephemeral pty id, so the running frontend is the only
source of the id→label mapping; an unopened project's terminals fall back to
showing the id.

**ControlOwner** — which surface renders a terminal live and drives its size:
```
kind: "window" | "mobile"   // a desktop window, or a phone
id: string                  // "main" / "detached:<project>" for windows; the deviceId for a phone
label: string               // human name for the placeholder, e.g. "Main window" / "Gurgen's iPhone"
```
`null` means nobody currently owns it. Equality is on `(kind, id)`.

**StatusEntry**:
```
key: string
value: "Running" | "Done" | "Waiting" | "Error"
icon?: string
color?: string
priority: int
timestamp: int   // unix millis
agentPID?: int
paneID?: string
```

## Input hex framing

Most keystrokes are UTF-8 and sent verbatim in `d`. For raw non-UTF-8 bytes
(some control sequences, pastes), frame them exactly as the desktop does: prefix
`d` with the null byte + `HEX:` and hex-encode the remainder. Server contract
(`pty::remote_write`):
```
d = " HEX:" + hex(bytes)   // decoded to raw bytes
d = "<utf-8 text>"              // sent as-is
```

## Notes / invariants

- **One PTY, one geometry — single-owner control.** A terminal is rendered live
  and controllable in exactly one surface at a time (a desktop window or a phone),
  tracked server-side in `control.rs`. `sub` *presents* a terminal (opening its
  screen); the first presenter owns it, later presenters must `claim` to take over
  ("Take control"). The **owner** renders live and drives the shared PTY size; any
  other surface shows a "take control" placeholder and does **not** `resize`. The
  server enforces this: a `resize` from a non-owner phone is dropped. Ownership
  transfers to a remaining presenter when the owner `unsub`s or disconnects, and
  every change is pushed as a `control` frame (and the `owner` field of `seed`).
- **Flow control is owner-only.** The phone never acknowledges output; the
  desktop owns backpressure. A phone that falls behind simply re-`sub`s and gets
  a fresh `seed`.
- **Reconnect = re-seed.** iOS suspends the app seconds after backgrounding and
  the socket dies. On foreground, reconnect, `auth`, and `sub` again — the
  `seed` frame restores the current screen from the server-side ring buffer.
- **v1 scope.** The phone views/types into terminals the desktop already
  created, and starts/stops projects and services. Spawning new terminals and
  changing the desktop pane layout from the phone are deferred (they need the
  owner-window action relay so the desktop store stays authoritative).
