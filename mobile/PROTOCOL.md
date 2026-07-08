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
| `{ "t": "duplicate", "name": "<name>", "count": N, "labels": ["<per-copy>"…], "groupName": "<folder>", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool, "runMode": "none"\|"action"\|"command", "action": "<actionName>", "command": "<cmd>", "prompt": "<text>" }` | `{ "t": "duplicate", "ok": true, "name": "<new name>", "names": ["<new name>"…] }` / `{ "ok": false, "error": "…" }` — clones the project, mirroring the desktop modal. `count` (1–50); `labels[i]` is copy i's display label (blank → auto-named); `groupName` groups the copies under a sidebar folder (replicating the desktop's applySidebarLayout — writes groups.json + settings.json). The three git toggles map to the backend (all default false, but the phone seeds `pullLatest` true from settings). **runMode**: with `none`, the clone + grouping run directly on the desktop (no main window needed). With `action`/`command`, the whole duplicate is relayed to the main window's `bulkDuplicate` so it can run the task in each copy's terminal (types the command, seeds the AI `prompt`) — **this path needs the desktop main window open**; if it's closed the reply is an error. Each new copy reaches the phone via `projects-changed`. `name` = first copy; `names` = all created (none path only) |
| `{ "t": "duplicateDefaults" }` | `{ "t": "duplicateDefaults", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool }` — the desktop's persisted duplicate-modal toggle defaults (from `settings.json`), so the phone's duplicate modal opens with the same initial state. Fallbacks mirror the desktop: `excludeUncommitted`/`reinstallDeps` default false, `pullLatest` defaults true |
| `{ "t": "remove", "name": "<name>" }` | `{ "t": "remove", "ok": true }` / `{ "ok": false, "error": "…" }` — tears down the project and, for a duplicate, deletes its folder from disk. Refuses an original that still has duplicates referencing it. The phone only offers this for duplicates |
| `{ "t": "start", "name": "<name>", "profile": "" }` | `{ "t": "start", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "stop", "name": "<name>" }` | `{ "t": "stop", "ok": … }` |
| `{ "t": "toggleService", "name": "<name>", "service": "<svc>" }` | `{ "t": "toggleService", "ok": … }` |
| `{ "t": "ping" }` | `{ "t": "pong" }` |

### Server-initiated pushes (desktop → phone)

| Frame | Meaning |
|---|---|
| `{ "t": "o", "id": "<termId>", "d": "<utf-8 chunk>" }` | Terminal output. Feed straight into the terminal emulator. |
| `{ "t": "exit", "id": "<termId>", "code": N }` | The terminal's process exited. |
| `{ "t": "projects-changed" }` | A project started/stopped/renamed. Re-request `projects`. |
| `{ "t": "status-changed", "project": "<name>" }` | A status badge changed (e.g. an agent is now Waiting). Re-request `status`. |
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
