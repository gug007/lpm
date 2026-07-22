# Peer Protocol (Connect Macs)

Wire protocol for Mac-to-Mac control in lpm. One lpm Mac (the **host**) exposes
its projects to another lpm Mac (the **client**); the client renders the host's
projects in the exact same ProjectDetail UI as local ones. All execution stays on
the host — the client is a display/input front-end.

Rust implementation: `src/peer.rs` (host role) and `src/peerclient.rs` (client
role). Both roles ship in every lpm, so a Mac can be host and client at once.

## Transport

- WebSocket, text frames only. Each frame is one JSON object with a discriminator
  field `t`. Unknown `t` values are ignored (forward-compatible).
- Host listens on **port 8766** by default (mobile owns 8765). Binds `127.0.0.1`
  (loopback) unless LAN is enabled, then `0.0.0.0`.
- **Encrypted with a pinned self-signed leaf.** The host presents the *same*
  long-lived leaf the mobile server uses — ECDSA P-256, CN `lpm`, persisted at
  `~/.lpm/remote-cert.pem` (see `remotetls.rs`); there is never a second identity.
  The client pins that leaf's SHA-256 (hex of the cert DER) and connects `wss://`
  only once pinned, so a bearer-token connection carrying executable `zdotdir`
  config can't be read or MITM'd on the LAN. See **Encrypted transport** below.
- **Dual-mode transition listener.** On each accepted socket the host peeks one
  byte: `0x16` (a TLS ClientHello) takes the TLS path; anything else (`GET …`) is
  handled as a legacy plaintext WebSocket. Everything above the stream — Origin
  refusal, auth, all frames — is identical on both. The plaintext branch is
  transitional so a peer paired before this shipped keeps working; a future build
  can drop it.
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
      "deviceId": "uuid", "token": "raw-token", "tlsFp": "hex-sha256", "enabled": true }
  ]
}
```

The host stores only `sha256(token)`; the raw `token` lives on the client. `port:
0` means the default (8766). `tlsFp` is the pinned host leaf fingerprint (hex
sha256 of its cert DER); absent/`null` on an entry paired before this shipped —
the first successful authenticated connect captures and pins the presented leaf.

## Encrypted transport

The host presents a self-signed leaf (`remotetls.rs`, shared with the mobile
server). The client pins it by SHA-256 — no CA chain, hostname, or expiry is
checked; the pinned fingerprint is the whole of trust, exactly as the phone pins
its Mac. `peertls.rs` holds the rustls verifiers (pinned and capturing).

**Client policy** (by whether the peer entry already has a `tlsFp`, and — when
pairing — whether the invite carried a fingerprint `f`):

| situation | transport | on success |
| --- | --- | --- |
| entry **has** `tlsFp` | `wss://` verifying the leaf == `tlsFp`; **no plaintext fallback** | run session |
| entry **lacks** `tlsFp` | `wss://` accept-any, capturing the leaf; if the TLS layer fails (old plaintext host), fall back to plaintext for that attempt | on first authed connect, pin the captured leaf (`pin-after-auth`) |
| pairing, invite **has** `f` | `wss://` verifying leaf == `f`; **hard fail** on mismatch | store `tlsFp = f` |
| pairing, invite **lacks** `f` | `wss://` unpinned, or plaintext against an old host | pin on the first authed session (`tlsFp` starts null) |

An unpinned connect pins **only after** the host answers the shared token
(`ready`/`paired`): a stranger who merely answers the port is never pinned. A
pinned connect never downgrades and never auto-unpins; a mismatch or TLS failure
fails with a stable, user-facing marker (`the other Mac's identity changed …` for a
saved peer, `couldn't verify the other Mac's identity …` for a pairing invite) and
the peer's row surfaces it. Tap-to-approve pairing has no invite `f`, so it uses
the capture path: the handshake is encrypted (`wss`) and, on success, pins the leaf
captured during it (**pin-after-successful-pair**) — falling back to plaintext, and
to pinning on the first session, only against a pre-Phase-3 host.

**Invite v2.** The pairing invite is `lpm-pair:` + base64url(JSON). v2 adds the
host fingerprint:

```json
{ "v": 2, "h": ["host", …], "p": 8766, "c": "code", "f": "hex-sha256" }
```

The decoder accepts v1 (no `f`, unpinned) and v2, ignores unknown fields, and treats
a v2 invite without `f` as unpinned. `peer_host_start_pairing` supplies `f`
(reading it forces the shared leaf to exist before the listener presents it).
Note: an app built before v2 shipped rejects a v2 invite outright (its decoder
requires `v === 1`), so during the rollout a new host's invite won't paste into a
not-yet-updated client — both ends ship together, so this is a transition-only gap.

**Rotation.** The leaf is never deliberately rotated; it is only regenerated if the
stored PEM can no longer be loaded (surfaced by `remotetls::identity_rotated()`).
After a rotation, pinned peers fail with the identity-changed marker until the user
removes and re-pairs them — there is no auto-heal, by design.

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
  host → `{ "t": "ready", "hostName", "features": ["configSync", "configSync2"] }`
- On failure either returns `{ "t": "error", "error" }` and the host closes.

`features` advertises optional capabilities the client keys behavior on (unknown
entries ignored). `configSync` = the config-sync frames below exist at all;
`configSync2` = the revision-aware variant (see **Config sync**). A host missing a
feature simply never receives frames that depend on it.

Codes are compared case-insensitively with separators stripped, in constant time.
Tokens are compared as `sha256` hex in constant time.

Pair/auth run over the encrypted, pinned channel of **Encrypted transport** — so a
`token` is exchanged over a proven connection whenever a fingerprint is known (a v2
invite carrying `f`, or a saved peer with `tlsFp`). It is exchanged over an
unpinned-but-encrypted or (against a pre-Phase-3 host) plaintext channel only in the
transition cases that pin on the first authed connect.

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

## Config sync

Mirrors the portable subset of `~/.lpm` between two paired Macs: projects (present
on both — intersection only), synced global files + dirs (union — created when
one-sided), and templates referenced by a matched project. Machine-local parts
(project `root`/`ssh`/`claudeAccount`/`parent_name`, settings.json window/geometry
keys) are stripped from the compared **portable digest** and preserved locally on
apply, so two Macs that differ only in local paths compare as in sync. The client
drives every sync; the host answers. Each side that receives changes snapshots
`~/.lpm` to `~/.lpm.backup-<ts>` first. Rust: `peersync.rs` (shared digest / plan /
apply), `syncstate.rs` (the revision sidecar), driven from `peerclient.rs` (client)
and answered in `peer.rs` (host).

Three request frames, each a generic correlated request (`reqId`, answered by a
`result` frame). `v` is the frame version: `1` = legacy (configSync), `2` =
revision-aware (configSync2). A client sends `v:2` only to a host that advertised
`configSync2`.

- **Digest** — client → `{ "t": "syncDigest", "v", "reqId", "device"? }`
  host → `result` whose value is the host's **digest map**. `device` (the client's
  sidecar id) is sent only at `v:2`.
- **Fetch** — client → `{ "t": "syncFetch", "v":1, "reqId", "items":[{kind,name}] }`
  host → `result` `{ "items": [wire item…] }`. Read-only; used to pull content the
  client will apply. Unchanged between versions.
- **Apply** — client → `{ "t": "syncApply", "v", "reqId", "device"?, "items":[wire item…] }`
  host → `result` `{ "applied", "errors":[…] }`. The host snapshots, applies each
  item with the portable-merge rules, and (at `v:2`) records the sender's revisions.

### Digest map

```json
{
  "projects":  { "<name>": { "hash", "mtime", "rev"?, "device"?, "deleted"? } },
  "globals":   { "<rel>":  { "hash", "mtime", "rev"?, "device"?, "deleted"? } },
  "templates": { "<name>": { "hash", "mtime", "rev"?, "device"?, "deleted"? } },
  "projectExtends": { "<name>": ["<template>"] },
  "device": "<sidecar uuid>"
}
```

`hash` is the portable digest; `mtime` the file mtime in millis. The `rev`/`device`
/`deleted` fields and the top-level `device` appear only at `v:2` (a `v:1` request
gets them stripped, and tombstone entries removed). `rev` is a per-unit revision
counter, `device` the sidecar id of the Mac that authored that revision, `deleted`
marks a **tombstone** (a synced-dir file known to be deleted; `hash` empty).

### Wire item

```json
{ "kind", "name", "enc": "text|b64", "content", "mtime", "deleted"?, "rev"?, "device"? }
```

Text files travel as UTF-8, binaries as base64. `deleted:true` (v2) is a pushed
deletion — empty content, the host removes the file (path-validated like a write,
synced-dir files only). `rev`/`device` (v2 push) let the host record the base
without holding the pusher's digest map.

### Revision sidecar & direction (configSync2)

`~/.lpm/sync-state.json` (see `syncstate.rs`) is process-private, never synced,
exported, or watched. It holds this Mac's `device` uuid, a per-unit `{digest, rev,
device, deleted}`, and, per remote Mac's uuid, the `{rev, digest}` **base** the two
last agreed on. Building the digest map reconciles it: a new or changed unit bumps
`rev` (author = self); a vanished synced-dir file becomes a tombstone; applying a
received unit stores its digest verbatim so the next reconcile does not re-bump
(the echo guard). Projects, templates, and top-level global files never tombstone —
their absence is machine-local, not an intent to delete everywhere.

For a unit that differs on both Macs, with `base = the agreed base for this peer`:

- local == base, remote moved → **pull** (fast-forward).
- remote == base, local moved → **push** (fast-forward).
- both moved off base → **conflict**: the higher `(rev, device)` wins (ties by
  content), the loser is overwritten (both sides backed up). The winner is symmetric
  — each Mac picks the same one; only push-vs-pull differs.
- no base (first sync / Phase-1 upgrade) → the legacy mtime direction, never a
  conflict; the base is recorded afterward.

Deletions cross only with a base: a tombstone vs a live file fast-forwards (remove
the file) or conflicts by the same rule (edit-wins resurrects, delete-wins removes).
A tombstone with no base does not propagate — the live side resurrects, matching
legacy behavior. settings.json has a **fixpoint** rule: apply merges incoming over
local, so if the merged result kept extra local keys it becomes a self-authored edit
one rev above both sides that pushes back and converges in one extra round (never a
ping-pong).

After a sync the client records the new base for every unit synced and every unit
already equal; the host records it for units it received via apply. A pull leaves
the host's base for that unit stale until the next exchange refreshes it (an equal
unit re-establishes it, a divergence resolves as a fast-forward), so a host-initiated
sync in that window may over-report a conflict — the winner is still correct and a
backup is still taken.

### Legacy interop

| client ↔ host | behavior |
| --- | --- |
| new ↔ new | configSync2: revision direction, conflict detection, deletions cross. |
| new ↔ old | old host advertises only `configSync`; client sends `v:1` and uses the mtime plan — no revisions, no deletions (identical to pre-Phase-2). |
| old ↔ new | old client sends `v:1`; new host answers with the stripped legacy map (no revisions, tombstones removed) and applies without touching its sidecar. |

Deletions and revision fields are therefore never sent to, nor accepted from, a peer
that does not speak `configSync2`.

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

### Threat model — why the channel is pinned

A paired client holds a durable bearer token and drives a wide command surface,
and the config-sync surface carries `zdotdir/*` — executable shell config that
lpm terminals source. A plaintext LAN channel guarded only by that token is not
enough to carry executable content unattended: anyone on the path could read the
token, read the shell config, or MITM the connection. So the channel is TLS with
the host's leaf **pinned** — trust is a fixed fingerprint, not a CA the LAN could
forge. Because the leaf is self-signed and stable, the first trust is established
by TOFU: a pasted invite's `f` (or the mobile QR's) verifies it up front, and an
unpinned upgrade pins it after the first token-authenticated connect. The TOFU
window — where a MITM could impersonate the host — exists only for that single
first connect on a peer that has no `f` and no stored `tlsFp`; it closes the
moment the pin is stored, and pasted-invite-with-`f` pairing never opens it.
Tap-to-approve pairing (no `f`) still encrypts its handshake and pins the captured
leaf on a successful pair, so its TOFU window is the pairing exchange itself.
Plaintext is accepted only transitionally, against a host paired before this
shipped; such a peer pins on its first authed session and is encrypted thereafter.
A pinned connection never downgrades.
