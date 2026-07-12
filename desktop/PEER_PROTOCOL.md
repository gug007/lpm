# Peer Protocol (Connect Macs)

Wire protocol for Mac-to-Mac control in lpm. One lpm Mac (the **host**) exposes
its projects to another lpm Mac (the **client**); the client renders the host's
projects in the exact same ProjectDetail UI as local ones. All execution stays on
the host — the client is a display/input front-end.

Rust implementation: `src/peer.rs` (host role) and `src/peerclient.rs` (client
role). Both roles ship in every lpm, so a Mac can be host and client at once.

## Transport

- Plaintext WebSocket, text frames only. Each frame is one JSON object with a
  discriminator field `t`. Unknown `t` values are ignored (forward-compatible).
- Host listens on **port 8766** by default (mobile owns 8765). Binds `127.0.0.1`
  (loopback) unless LAN is enabled, then `0.0.0.0`. Run over a Tailscale tailnet
  for encrypted away-from-home access.
- One blocking connection thread per client on the host; one connection thread
  per paired host on the client, with auto-reconnect + backoff while enabled.

## Config (`~/.lpm/peer.json`, mode 0600)

Holds both roles behind one shared in-memory lock:

```json
{
  "host": {
    "enabled": false,
    "lan": false,
    "port": 0,
    "pairingCode": "",
    "devices": [
      { "id": "uuid", "name": "Laptop", "tokenSha256": "…", "slugAssigned": "abcd1234", "createdAt": 0 }
    ]
  },
  "peers": [
    { "slug": "abcd1234", "alias": "Studio", "host": "100.64.0.5", "port": 8766,
      "deviceId": "uuid", "token": "raw-token", "enabled": true }
  ]
}
```

The host stores only `sha256(token)`; the raw `token` lives on the client. `port:
0` means the default (8766).

## Identifier scheme

Each paired peer gets a stable 8-lowercase-hex **slug**, assigned by the host at
pairing. Remote identifiers carry a parseable marker so the client router can
route by pattern without a registry lookup:

- Project name: `peer-{slug}-{rawName}`
- Terminal id: `peer-{slug}-{hostTerminalId}`
- Project root: `/@peer-{slug}{hostAbsolutePath}`

All prefixes are Tauri-event-safe (`[a-zA-Z0-9-_:/]`). The client strips the
marker before sending over the wire; the host only ever sees raw host-local ids.

## Handshake / auth

First client frame within 20s, or the host closes the socket.

- **Pair** (first time): client → `{ "t": "pair", "code", "name" }`
  host → `{ "t": "paired", "deviceId", "token", "slug", "hostName" }`
  The single-use pairing code is consumed on success. `name` is the client Mac's
  display name; `hostName` is the host Mac's.
- **Resume** (already paired): client → `{ "t": "auth", "deviceId", "token" }`
  host → `{ "t": "ready", "hostName" }`
- On failure either returns `{ "t": "error", "error" }` and the host closes.

Codes are compared case-insensitively with separators stripped, in constant time.
Tokens are compared as `sha256` hex in constant time.

## Commands (generic invoke)

Every non-terminal-I/O command flows through one generic path:

- client → `{ "t": "invoke", "reqId", "cmd", "args" }` (`reqId` is a
  client-generated u64, echoed verbatim)
- host → `{ "t": "result", "reqId", "ok", "value" }` — `value` is the JSON result
  when `ok`, or an error string when not.

Host dispatch has two tiers:

1. **Rust fast path** for terminal I/O — `write_terminal`, `resize_terminal`,
   `ack_terminal_data`, `stop_terminal` — executed directly against the PTY, no
   webview round-trip.
2. **Webview dispatch** for everything else (this is what makes the proxy
   generic): the host Rust re-emits the command into its own main-window webview
   as a Tauri event `peer-invoke` `{ reqId, cmd, args }`; the host frontend runs
   the real `invoke(cmd, args)` and calls the `peer_dispatch_reply({ reqId, ok,
   value })` command; Rust correlates `reqId` back to the waiting connection and
   sends the `result` frame. A 30s deadline yields an error result; a missing
   main window yields an immediate `host UI unavailable` error.

**Denylist.** The host refuses to dispatch app-meta commands and returns an error
result: any `peer_*` / `remote_*` command, window/dock/detached-window focus, app
settings + config import/export, updater/installers, account/login, host-local
audio/voice, the host browser overlay, and vault key material. Project-scoped
operations are allowed. The client router carries the same guard (defense in
depth). See `is_denied` in `peer.rs`.

## Terminal streaming

- client → `{ "t": "sub", "id" }` — subscribe to a host terminal. The host
  claims display control for this peer (host windows show the "Take control"
  placeholder) and replies once with `{ "t": "seed", "id", "d" }`, the recent
  scrollback (96 KiB ring, trimmed to a clean line boundary).
- host → `{ "t": "o", "id", "d" }` — live output chunks.
- host → `{ "t": "exit", "id", "code" }` — the terminal exited; its ring is freed.
- client → `{ "t": "unsub", "id" }` — stop; the host releases control.

The client re-emits these locally under the prefixed event names the mirrored
ProjectDetail already listens on, so the frontend needs zero changes:

- `seed`/`o` → Tauri event `pty-output-peer-{slug}-{id}` with the `d` string
  (seed arrives as the first chunk, before live output).
- `exit` → `pty-exit-peer-{slug}-{id}` with the exit code.

On reconnect the client re-sends `sub` for every terminal the frontend currently
has attached (tracked via `peer_term_attach` / `peer_term_detach`).

## Global event forwarding

The host forwards these Rust-emitted global events to every authed peer as
`{ "t": "evt", "name", "payload" }` (payload verbatim; non-blocking, overflow
drops and the client re-syncs):

`projects-changed`, `status-changed`, `git-changed`, `ports-changed`,
`action-output`, `action-done`, `action-bg-output`, `templates-changed`.

The client re-emits each on a single per-peer wrapper channel `peer-evt-{slug}`
with payload `{ name, payload }`; the TS shim demultiplexes, translates
identifier fields (project names → prefixed, roots/paths → prefixed root,
terminal ids → prefixed), and dispatches to the same callbacks the local events
would.

## Keepalive

`{ "t": "ping" }` / `{ "t": "pong" }`. The client pings every 20s.

## Control ownership

A peer `sub` presents + claims display control on the host under a distinct owner
kind `"peer"` (never collides with `"window"` / `"mobile"`; identity is
`(kind, id)`). On disconnect the host drops that surface from every terminal, so
control transfers back to a host window instead of stranding on a gone client.

## Commands (Tauri, frontend-facing)

Host role:
- `peer_state() -> { host, peers }`
- `peer_host_set_config({ enabled, port, lan })`
- `peer_host_start_pairing() -> { code, port, hosts[] }` (force-enables server + LAN)
- `peer_host_cancel_pairing()`
- `peer_host_revoke_device(id)` (drops live connections for that device)
- `peer_dispatch_reply({ reqId, ok, value })` (called by the host dispatcher)

Client role:
- `peer_add({ host, port, code, alias }) -> { slug }`
- `peer_remove(slug)`
- `peer_set_enabled(slug, enabled)`
- `peer_invoke({ slug, cmd, args }) -> value` (blocks up to 35s)
- `peer_term_attach(prefixedId)` / `peer_term_detach(prefixedId)`

Frontend-facing events: `peer-state-changed`, `peer-invoke` (host dispatcher),
`peer-evt-{slug}`, `pty-output-peer-{slug}-…`, `pty-exit-peer-{slug}-…`.

## Limitations / trust model

- **A paired client is fully trusted, over a wide surface.** Pairing grants the
  same "full control" trust the mobile companion has, but through a generic
  command proxy rather than a fixed message set. Every command not on the host
  denylist runs on the host with the host user's privileges — including
  filesystem commands (`read_file`, `write_file`, `save_text_file`) and
  open-in-editor/Finder commands, which read/write files and launch apps *on the
  host Mac*. Pair only Macs you control. The denylist (`is_denied` in `peer.rs`)
  blocks app-meta, control-ownership, and global-mutator commands as defense in
  depth, but is not a sandbox.
- **Git working-tree watching is a single global watch on the host.** A peer
  opening a review pane starts host-side file watching for that project; because
  the host keeps one active watch, a peer's review can replace the watch the host
  user's own review pane had active (and vice-versa). Diffs stay correct — only
  the live auto-refresh follows the most recent watcher.
- **Control hand-back is one-directional (v1).** A peer `sub` claims display
  control so host windows show the "Take control" placeholder. The reverse — a
  host window reclaiming control while the peer keeps the terminal open — is not
  pushed to the client, so the client keeps rendering until it detaches.
