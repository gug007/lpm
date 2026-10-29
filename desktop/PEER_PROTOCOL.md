# Peer Protocol (Connections)

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
  (loopback) unless LAN is enabled, then `0.0.0.0` — or exactly the interface named
  in `bindAddress`, which a server on a public IP should prefer.
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
    "bindAddress": "",
    "port": 0,
    "pairingCode": "",
    "devices": [
      { "id": "uuid", "name": "Laptop", "tokenSha256": "…", "slugAssigned": "abcd1234",
        "createdAt": 0, "platform": "macos" }
    ]
  },
  "peers": [
    { "slug": "abcd1234", "alias": "Studio", "host": "100.64.0.5", "port": 8766,
      "deviceId": "uuid", "token": "raw-token", "tlsFp": "hex-sha256", "enabled": true,
      "autoSync": false, "platform": "linux", "headless": true }
  ]
}
```

The host stores only `sha256(token)`; the raw `token` lives on the client. `port:
0` means the default (8766). `bindAddress` is the interface to listen on and wins
over `lan` when set — `lan` only ever had two answers (this machine, or every
interface), which on a server means the public one too. Empty falls back to the
bool, so a config written before this keeps its exact behaviour. An invite offers
only the address actually bound, except when bound to every interface, where all
candidates are offered and the joiner tries them in order. `tlsFp` is the pinned host leaf fingerprint (hex
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
| pairing, **pasted invite lacks** `f` | `wss://` unpinned (encrypted), or plaintext against an old host | pin on the first authed session (`tlsFp` starts null) |
| pairing, **tap-to-approve** (no `f`) | `wss://` capturing the leaf, or plaintext against an old host | pin the captured leaf on a successful pair (**pin-after-successful-pair**); plaintext → first-session |

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
- Project root: `/@peer-{slug}{hostAbsolutePath}` — the host path as the host
  writes it: `/…` or `~/…`, or on a Windows host `C:\…`, `C:/…` or `\\server\share\…`

All prefixes are Tauri-event-safe (`[a-zA-Z0-9-_:/]`). The client strips the
marker before sending over the wire; the host only ever sees raw host-local ids.

## Handshake / auth

First client frame within 20s, or the host closes the socket.

- **Pair** (first time): client → `{ "t": "pair", "code", "name", "platform", "replaces"? }`
  host → `{ "t": "paired", "deviceId", "token", "slug", "hostName", "hostPlatform", "hostHeadless" }`
  The single-use pairing code is consumed on success. `name` is the client
  machine's display name; `hostName` is the host's. `replaces` (also on
  `pairRequest`) is the `deviceId` the client already holds for this host, sent
  when it pairs a host it already has (same certificate or address): the host
  drops that record and hands the new one its slug, so the client replaces its
  entry instead of listing the host twice. The client also drops any other entry
  with the same `hostId` once paired. An older host ignores the field.
- **Resume** (already paired): client → `{ "t": "auth", "deviceId", "token" }`
  host → `{ "t": "ready", "hostName", "hostPlatform", "hostHeadless", "hostVersion", "phoneServerId", "hostAddrs", "features": ["configSync", "configSync2"] }`
- On failure either returns `{ "t": "error", "error" }` and the host closes.
  `error` is `revoked` when the host removed this device itself (Remove access,
  remembered in `host.revoked`, newest 64): the client drops the host's entry
  from its own list rather than retrying, and shows that the machine removed it.
  Any other missing record is `unauthorized`, and the client keeps the entry.
- **Revoked** (host → client, live): a host that removes a connected device sends
  it the same `{ "t": "error", "error": "revoked" }` before closing, with the same
  effect. An older client reconnects and is told at `auth`.
- **Forget** (authed): client → `{ "t": "forget" }` when the client disconnects
  the host on its side. The host drops the client's record and closes, so it
  stops listing and trusting it. An older host ignores it. A host the client
  can't reach at that moment is kept in `peer.json` under `forgets` (out of every
  list) and told later: the client signs in with the removed entry's credential
  and sends `forget`, retrying from 1 minute up to every 30 minutes, for 30 days.
  One told over the live connection is checked once more 30 s later. `ready`
  (then `forget`), `unauthorized` or `revoked` settles it; anything else is
  retried.

`platform` / `hostPlatform` are `std::env::consts::OS` spelling (`macos`, `linux`,
`windows`). Both are absent from a build that predates them, which reads as
unknown and is treated as a Mac. `hostPlatform` rides every `ready`, not just
pairing, so an entry stored before it existed fills itself in on the next connect
rather than needing a re-pair.

`hostHeadless` (bool) says nobody is at the host: lpm running under Xvfb as a
Linux host (`LPM_HEADLESS=1`, or the binary under `/opt/lpm`), as opposed to
someone's Mac, Linux or Windows desktop. It is what the Server screen and the
sidebar use to show a machine as a server, and the only kind of peer the client
offers to update or remove lpm on over SSH. A build that predates it omits it,
and the client stores it as unknown (`headless: null`) on every `ready` that
lacks it: unknown on a `linux` peer means a host, since Linux only ran headless
before desktops shipped. Older clients ignore the field.

`phoneServerId` is the `serverId` the host's mobile server gives phones (see
`mobile/PROTOCOL.md`). The client stores it on the peer entry so a phone connected
to the client can tell whether it already has this host before asking it for a
pairing code. Absent from a build that predates it.

`hostAddrs` lists the addresses the host can be reached at right now, the same
ones its invites carry: its LAN address, then its Tailscale address (the
Tailscale app's, or the built-in node's while that is connected). A host bound to
one interface lists only that one. The client keeps them on the peer entry
(`addrs`, at most 8, loopback and the entry's own `host` dropped), seeded at
pairing from the invite's or discovery's addresses and replaced on every `ready`
that carries the field. When `host` doesn't answer, the client dials them in
turn, the address that answered last time first; every dial but the last is
capped at 3 s. So a Mac paired on the LAN reconnects over Tailscale from another
network, and one whose LAN address changed finds it again. Absent from a build
that predates it: the client keeps what it has.

`features` advertises optional capabilities the client keys behavior on (unknown
entries ignored). `configSync` = the config-sync frames below exist at all;
`configSync2` = the revision-aware variant (see **Config sync**); `remotePair` =
the host will hand back its own phone-pairing QR (see **Commands**); `mediaRange` =
the host serves a video's byte ranges for preview (see **Commands**); `selfUpdate` =
the client can have the host install the latest lpm (see **Commands**);
`hostSettings` = the host answers the settings frames (see **Commands**);
`hostSettingsAll` = it shares every setting there, not only the first three;
`hostFolders` = the host shares its sidebar folders (see **Commands**);
`hostFolderFolds` = ...and which of them are folded (see **Commands**);
`hostJobs` = the host takes its shared automations from the client (see **Commands**);
`portTunnel` = the host opens its web servers on the client's localhost (see **Port tunnel**);
`hostClaudeAccounts` = the host answers `host_claude_accounts` (see **Commands**);
`fileSave` = the host puts a client's save of one of its files in place (see
**Commands**);
`ignoredSync` = the host lists, sends and takes the files of its projects (see
**File sync**);
`agentLimits` = the host trades Claude usage limits (see **Usage
limits**). A host
missing a feature simply never receives frames that depend on it. The full list
is `host_features()` in `peer.rs`.

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
   webview round-trip. Uploads and `media_read_range` also run in Rust, on a
   worker thread.
2. **Webview dispatch** for everything else (this is what makes the proxy
   generic): the host Rust re-emits the command into its own main-window webview
   as a Tauri event `peer-invoke` `{ reqId, cmd, args }`; the host frontend runs
   the real `invoke(cmd, args)` and calls the `peer_dispatch_reply({ reqId, ok,
   value })` command; Rust correlates `reqId` back to the waiting connection and
   sends the `result` frame. A 30s deadline yields an error result — longer for a
   command that runs a coding agent, installs the voice engine or signs in to
   Tailscale (`dispatch_timeout` in `peer.rs`), which the client waits out as well; a missing main window yields an immediate
   `host UI unavailable` error. A generation's id carries the host's marker, so
   `cancel_ai_generate` with it reaches the host the run is on.

**Denylist.** The host refuses to dispatch app-meta commands and returns an error
result: any `peer_*` command; the `remote_*` / `tailnet_*` commands except the
host's own phone and Tailscale settings (`HOST_MOBILE_COMMANDS` in `peer.rs`:
devices, keep awake, the server switch, Tailscale's state and sign-in — never
switching the tailnet off or signing out, which could cut off a host reached only
over it); window/dock/detached-window focus; app settings and config
import/export; the updater and the CLI installer (the voice engine and agent
skills install from a paired Mac); host-local audio/voice; the
host browser overlay; the folder picker that saves a note's attachment (the
client reads the attachment and saves it itself); and vault key material.
Project-scoped operations are allowed, and so are the host's global and repo
configs (`global.yml`, `<root>/.lpm.yml`) and its Claude accounts, which the
client edits as the host's own windows do. The client router carries the same guard (defense in depth), and
opens a detached window for a host's project on the client. See `is_denied` in
`peer.rs`.

**Video preview** (`mediaRange` feature). The client's `lpm-media://` handler
forwards each byte range a `<video>` asks for about a peer-marked path as
`{ "cmd": "media_read_range", "args": { "path", "range" } }`. `path` is the host
path (may start with `~/`), and `range` is the request's `Range` header or null.
The host reads it with the same rules as a local file: video extensions only, and
at most 1 MB per reply. It answers `{ len, start, end, partial, mime, data }`, with
`data` in base64, or `{ len, unsatisfiable: true }`. A failure is the HTTP status
as a string (`"404"`). A client doesn't send it to a host without the feature, and
the viewer asks for an update instead.

**Opening a host's file in an app here** (`peeropen.rs`). The app starts on the
client. A VS Code-family editor opens the host's own file over Remote-SSH when
the client reaches the host over SSH; otherwise the client fetches a copy (a
chunk at a time) and opens that. The copy is kept in step: each save goes back
to the host, written only while the host's file still holds what it held as of
the copy or the last save. A `fileSave` host takes any file whole, in the pieces
an attached file travels in (`uploadBegin`, `uploadChunk`), closed with
`{ "t": "uploadSave", "reqId", "uploadId", "path", "expectedSha256" }` →
`result` with `{ written, sha256 }`: the host swaps the file in atomically
(through a link, keeping its mode) when its SHA-256 is still `expectedSha256`,
and `sha256` is what it holds afterwards. An older host takes text only, as
`write_file_if_unchanged { absPath, expectedContent, content }`; any other copy
stays read-only. A host file that changed in between isn't overwritten — the
copy turns read-only and the client says so.

**Phone pairing** (`remotePair` feature). The one thing a client needs from the
host's mobile server gets a dedicated frame rather than a hole in that denylist:

- client → `{ "t": "remotePair", "reqId" }`
- host → `{ "t": "result", "reqId", "ok", "value" }` — `value` is the QR payload
  (`code`, `url`, `svg`, `host`, `hosts`, `port`, `fingerprint`, `serverId`) the
  phone scans. `fingerprint` and `serverId` are absent from an older host; the
  fingerprint is still the URL's `f=`.

The host arms the code and computes the payload itself: the addresses and the
leaf certificate the phone must reach and pin are the host's, and neither is
knowable from the client. It runs entirely in host Rust — no webview dispatch —
so a headless host with no UI answers it like any other. The asking Mac displays
the QR, which is how a phone pairs with a machine that has no screen of its own. A phone
connected to the asking Mac can also request it through `machinePair` and redeem
the code itself, without any QR.

**Updating lpm** (`selfUpdate` feature, macOS hosts only — elsewhere lpm is
updated the way it was installed). The updater is on the denylist, so this too
gets dedicated frames:

- client → `{ "t": "selfUpdate", "reqId" }` — the host runs the same install as its
  own Update button, on a worker thread, with no prompt on either side: pairing
  already grants full control.
- host → `{ "t": "selfUpdateProgress", "reqId", "phase" }` (`checking`,
  `downloading`, `installing`) or `{ …, "progress" }` (whole percent of the
  download), as it goes. The host's own windows show the same steps.
- host → `{ "t": "result", "reqId", "ok": true, "value": { "cancelled": true } }`
  when cancelled, or `ok: false` with the error. A finished install sends no
  result: lpm restarts on the host and the connection drops, which the client
  reads as the restart and confirms from `hostVersion` on the next `ready`.
- client → `{ "t": "selfUpdateCancel", "reqId" }` → `result` with `true` while the
  install can still stop (checking or downloading), `false` once it has started
  replacing the app or when none is running.

**Host settings** (`hostSettings` / `hostSettingsAll` features). `save_settings`
stays on the denylist, so the client's Settings view reaches the host's settings
through these frames, which touch only the fields that view shows (`SHARED` in
`peersettings.rs`: theme, sidebar, Git, notification, terminal, shortcut,
speech, update-channel and Claude usage-reading settings). Window geometry, sidebar order and the rest of what the host keeps
for itself are out of reach. A `hostSettings` host without `hostSettingsAll`
shares only `defaultProjectDirectory`, `checkOrigin` and `doubleClickToToggle`;
the client asks the user to update it rather than send it the frames.

- client → `{ "t": "settingsGet", "reqId" }` → `result` with those fields the host
  has set; a missing field means its default.
- client → `{ "t": "settingsSet", "reqId", "patch": { … } }` → `result` with the
  fields as stored afterwards. Each field is checked against its kind (bool, path,
  name, bounded number, one of a few words, or a map of hotkey ids to combos);
  `null` clears any field, and `""` clears a path or name. Any other key or kind
  fails the whole patch and writes nothing. On success the host emits
  `peer-settings-changed` so its own windows reload settings. Setting
  `claudeLimitsEnabled` also installs or removes the host's usage-reading
  forwarder, as the host's own toggle does.

**Message history.** Each Mac keeps what was typed on it, a paired Mac's
terminals included: `message_history_*` never routes. A Mac's history popover
(and its phones' history) merges in every connected host's, over the generic
invoke. The host answers in Rust (a headless host keeps history too) and always
from its own rows — it never asks its own hosts:

- `{ "cmd": "message_history_query", "args": { "input": { scope, projectName,
  collection, search, cursorAt, cursorSeq, limit, … } } }` → the host's rows,
  newest first. `projectName` is the bare name, which the host matches under its
  own name and as any of its peers' projects of that name. The client marks each
  row's id `peer-{slug}-{id}`, names its project as it sees it, and orders the
  merged page by (`at` desc, machine, `seq` desc). A folder is each Mac's own, so
  a folder's page asks no host.
- `{ "cmd": "message_history_toggle_favorite", "args": { "id" } }` → the new
  favorite state (`null` from an older host).
- `{ "cmd": "message_history_delete", "args": { "id" } }` → `null`.

An older host answers the same commands through its page.

**Host folders** (`hostFolders` feature). The host's folders (`groups.json` and
its `sidebarOrder`) are the one layout every viewer of its projects shares — its
own window, its phones, a paired Mac — so a client shows them in the host's
section and edits them one op at a time, applied to what is on disk at that
moment; it never writes back a whole layout it read earlier. Both commands are
answered in host Rust (a headless host has folders too), over the generic invoke:

- `{ "cmd": "host_folders", "args": {} }` → `{ "order": [...], "groups": [{ id,
  name, collapsed?, members }] }` — `order` is the top-level slots (host project
  names and `group:<id>` tokens), without the host's own `peer:<slug>` slots.
- `{ "cmd": "host_folders_edit", "args": <op> }` → the layout afterwards, same
  shape. `op` is one of `{ "op": "create", "name", "members"?, "before"? }` (a
  new folder in the slot before `before`, or last, taking `members` with it),
  `{ "op": "rename", "id", "name" }`, `{ "op": "fold", "id", "collapsed" }`
  (`hostFolderFolds` only), `{ "op": "ungroup", "id" }` (the folder
  goes, its projects take its slot), `{ "op": "move", "item", "folder", "before" }`
  (a project into folder `folder` before its member `before`, or with `folder:
  null` to the top level before the slot `before`; `item` may also be a
  `group:<id>` at the top level; a missing `before` means last), or
  `{ "op": "copies", "order" }` (a project's copies in a new order, which only
  `projectOrder` holds). An unknown project or folder fails the op and writes
  nothing. On success the host emits `projects-changed` and `sidebar-changed`.

Which folders are folded is part of the layout on a host with
`hostFolderFolds`: the client shows `collapsed` and folds with the `fold` op, so
a folder folds on every Mac at once. Against a host without it, the client
ignores `collapsed` and keeps its own per host. Deleting the projects in a folder is not an op; a client only
ungroups. A client re-reads the layout on a forwarded `sidebar-changed` or
`projects-changed`. A host without the feature has its section listed flat, in
the order the client keeps for it.

**Host automations** (`hostJobs` feature). A client lists a host's automations
with the generic `list_all_jobs` and acts on them with the per-project job
commands (`run_job_now`, `stop_job_run`, `set_job_enabled`, `job_history`,
`mark_job_seen`, …), whose peer-marked project routes them; a standalone job's
project is the empty name, which the client marks too (`peer-<slug>-`).
`clear_job_state_global` and `mark_all_jobs_seen` take no project, so the client
sends them to the host explicitly. An automation in one project lives in that
project's config, which the client already edits through the project. One in
several projects, every project or none lives in the host's global config,
which is on the denylist as a whole; these two commands, answered in host Rust,
reach only its `jobs:`:

- `{ "cmd": "host_global_job_save", "args": { "id", "yaml" } }` → `null` — writes
  `jobs.<id>`; `yaml` is the job's body as the client's editor built it (YAML so
  its keys keep their order), naming projects by the host's own names.
- `{ "cmd": "host_global_job_delete", "args": { "id" } }` → `null` — removes
  `jobs.<id>` and leaves its runs' state, which `clear_job_state_global` forgets.

Both emit `job-status` (`project: ""`) on the host. A client doesn't send them to
a host without the feature and asks for an update instead; listing and the
per-project commands work with any host.

**Review-pane watches** (`gitwatch.rs`). A window's review pane keeps a live
watch on its project's working tree, which emits `git-changed`:
`start_watching_project { path, owner }` and `stop_watching_project { path,
owner }`, where `owner` is the window (`main`, `detached:<project>`) and `path`
names the project, which routes the call to its machine. Every window has a
watch of its own and windows on the same project share one watcher, so no
window's watch replaces another's. A stop for a project the window has since
left is ignored. The host answers both in Rust, filing a paired Mac's watches
under its connection, and ends them when that connection closes. A host that
predates owners keeps one watch for everyone, and the last start wins.

**Host Claude accounts** (`hostClaudeAccounts` feature, `hostclaude.rs`). A
client manages a host's Claude accounts as the host's own Settings does: the
account commands (`save_claude_accounts`, `remove_claude_account`,
`set_claude_pool`, `resume_claude_pool`, …) reach it over the generic invoke —
`accounts.json` holds labels, not credentials. A project's account is picked
through the project (`set_claude_account_choice`). For reading, one command
answered in host Rust gathers what the project menu and Settings show:

- `{ "cmd": "host_claude_accounts", "args": {} }` → `{ accounts: [{ id, label }],
  statuses: [{ id, signedIn, email }], usage, pool }` — `pool` is the host's
  switching state as its own Settings reads it; the client marks its pools'
  project names.

Signing in runs `claude /login` in a terminal on the host: the client sends
`start_claude_login { accountId, machine: "peer-<slug>-" }` (the marked, empty
`machine` is what routes a command that takes no project), and attaches the
terminal it answers with like any host terminal.

## Port tunnel

`portTunnel` feature (`porttunnel.rs`). The client opens a host project's web
server as if it ran on its own localhost: `peer_port_forward(slug, port)` listens
on the client's loopback — on `port` itself when it is free there, any free port
otherwise — and answers with that local port. Each connection to it becomes a
stream, by an `id` the client picks:

- client → `{ "t": "tcpOpen", "id", "port" }` — the host dials `127.0.0.1:port`
  on its own loopback. Bytes sent before the dial completes wait for it.
- either way → `{ "t": "tcpData", "id", "d" }` — `d` is base64, at most 32 KiB raw.
- either way → `{ "t": "tcpClose", "id", "error"? }` — no more bytes from the
  sender. The receiver half-closes its socket once what it queued is written, so a
  request that ends in a half-close still gets its response. A failed dial is a
  `tcpClose` with `error`.

Data frames wait for room in the connection's queue instead of being dropped as
terminal output may be: a byte stream can't be reseeded. A dropped connection ends
its streams on both sides; the client's listener stays open and carries new
connections once the host is back. A client doesn't open a tunnel to a host
without the feature and asks for an update instead.

An SSH project of the host's forwards its server's ports to the host's loopback
(`add_port_forward` runs there, like the rest of its Ports commands), so the
client opens a forwarded port through this tunnel in turn.

## File sync

`ignoredSync` feature (`ignoredhost.rs`, driven from `ignoredrun.rs`). The client
copies files between one of its projects and the same project on the host, in
either direction: what git ignores (Sync Ignored Files) or any file or folder
(the Files tab's Send / Get). Every frame names the host folder as `cwd`, which
must be a project root the host manages; paths are project-relative, `/`-separated,
and refused when they leave the project, enter `.git`, or pass through a link.
Replies use `result`, like `invoke`.

- `{ "t": "ignoredList", "cwd", "dir" }` → `{ entries: [{ path, dir, size, files,
  mtime, digest }], more, origin? }` — `dir` empty lists what git ignores (an
  ignored folder is one entry ending in `/`) and carries the project's git
  `origin`; otherwise the children of that folder. `more` counts entries past the
  2000 returned.
- `{ "t": "ignoredManifest", "cwd", "paths" }` → `{ files: [{ path, size, mtime,
  digest, exec, link? }] }` — every file the paths hold. `digest` is the SHA-256
  of files up to 4 MB, otherwise size and modification time; a link carries its
  target and is never followed.
- `{ "t": "ignoredRead", "cwd", "pieces": [{ path, offset, len }] }` → `{ pieces:
  [{ path, offset, data }] }` — `data` base64, at most 1 MiB raw per frame. A
  short read fails: the file changed since it was described.
- `{ "t": "ignoredWrite", "cwd", "batch", "pieces": [{ path, offset, size, mtime,
  exec, link?, data }] }` → `{}` — pieces arrive in order into a hidden
  temp beside each file, which replaces it only once whole. What it replaces, and
  every folder it had to make, is recorded under `~/.lpm/ignored-sync/backups/
  <batch>` on the host.
- `{ "t": "ignoredFinish", "batch" }` → `{ added, replaced }` — throws away any
  half-arrived file. A batch left unfinished is dropped after 10 minutes.
- `{ "t": "ignoredUndo", "cwd", "batch" }` → `{ restored, paths }` — removes what
  the batch added and puts back what it replaced. Backups are kept 7 days.
- `{ "t": "ignoredOrigin", "cwd" }` → `{ origin }` — the project's git `origin`, so
  two folders of the same name are synced only when they hold the same repository.

A client remembers a list per project and per computer in
`~/.lpm/ignored-sync/lists.json`, kept in sync by default; each kept list is
compared every 30 s while its computer is connected, both ways, against the
digests both sides last agreed on. An undo that puts back a kept file pauses that
list and forgets what it agreed on. A file changed on both is left alone and
reported as `ignored-sync-conflict` `{ project, slug, remoteRoot, machine, paths }`.

## Terminal streaming

- client → `{ "t": "sub", "id", "from"?, "claim"? }` — subscribe to a host
  terminal. The host replies once with a `seed`. `from` is the stream offset this
  client has already applied, sent only when it still has that terminal's
  emulator on screen. Current clients send `claim: false`, since they subscribe
  every tab, background ones included, and report what they show through `ctl`
  (see Control ownership). Without it the host claims display control for the
  peer, as it did for clients that predate `ctl`.
- host → `{ "t": "seed", "id", "d", "off", "reset" }` — the answer to `sub`,
  delivered before any live output.
  - `reset: false` — `d` is exactly the bytes emitted since the `from` that was
    asked for. Apply it untouched to the surviving screen; clearing first would
    erase the screen it continues.
  - `reset: true` — `from` was absent or no longer honourable, so `d` is a replay
    of the recent scrollback (96 KiB of a 512 KiB ring, trimmed to a clean line
    boundary) for a screen rebuilt from scratch. The client prefixes it with its
    own emulator-reset sequence.
  - `off` is the stream offset `d` ends at, in UTF-8 **bytes**.
- host → `{ "t": "o", "id", "d", "off" }` — live output chunks. `off` is the
  **end** offset of `d` in the terminal's byte stream, again in UTF-8 bytes, so
  `off - len(d)` is where the chunk starts. A chunk starting past what the client
  holds means the host dropped frames for a backed-up queue: the client stops
  resuming that terminal and asks for a replay instead.
- host → `{ "t": "exit", "id", "code" }` — the terminal exited; its ring is freed.
- client → `{ "t": "unsub", "id" }` — stop; the host releases control.

Offsets are per terminal and only ever move forward. The host retires every offset
it has handed out whenever hosting is toggled — terminals keep running while it is
off, but their output goes unrecorded, so a later resume would hand back a slice
with a silent hole in front of it. A retired offset simply falls back to a
`reset` seed.

After a `reset` seed the host nudges the terminal's winsize by a row and restores
it ~80 ms later, so a full-screen program repaints onto the rebuilt screen (an
unchanged winsize raises no SIGWINCH). A resize from the viewer inside that window
retires the nudge, and the restore is skipped unless the geometry is still exactly
what the nudge set.

The client re-emits these locally under the prefixed event names the mirrored
ProjectDetail already listens on, so the frontend needs zero changes:

- `seed`/`o` → Tauri event `pty-output-peer-{slug}-{id}` with the `d` string
  (seed arrives as the first chunk, before live output).
- `exit` → `pty-exit-peer-{slug}-{id}` with the exit code.

On reconnect the client re-sends `sub` for every terminal the frontend currently
has attached (tracked via `peer_term_attach` / `peer_term_detach`), carrying the
offset it holds for each, then a `ctl` `present` for each one a window still shows.

**Compatibility.** A host that sends no `off` predates this contract: its `d` is
always a full replay, so the client takes the reset path and forgets the offset.
A host that gets a `from` it cannot honour answers with `reset: true`.

## Host tabs

A Mac showing a host project opens a tab for each terminal the host lists, and
closes the tabs the host closed. It asks `list_project_terminals { projectName,
withTabs: true }` (answered in Rust, so a headless host answers too) when the
project mounts, when the host emits `terminals-changed`, and when its window gains
focus. The host emits `terminals-changed` when a project's tabs, their order,
names, pins or icons change. The answer is `{ terminals, tabs, run, follow }`:

- `terminals` — the host's live terminals in its tab order, as without `withTabs`.
- `tabs` — the ids of every tab the host's window has open for the project,
  finished ones included. Null until the window has reported them, which it does
  only once its saved tabs are restored, so an empty list means every tab closed.
  A headless host has no window and never reports them.
- `run` — changes every time the host app starts.
- `follow` — the host keeps the tabs' names and order for every Mac (below).

A project the host hasn't shown since it started has no `tabs` yet. Asking about
one that has saved tabs makes the host restore them off screen; its
`terminals-changed` follows once they are back.

The client closes a tab the host listed earlier in the same `run` and no longer
lists, without stopping its terminal: an Undo on the host brings the tab back, and
the next sync opens it again. A tab the host hasn't listed yet (one this Mac just
opened there) stays, and so do tabs from before a host restart.

**Following the host.** With `follow`, the host's tab tree is the one place a
project's tabs are named and ordered. The client gives each host terminal the
host's label, pin and icon, and orders the tabs within each of its panes as the
host lists them (its pane layout stays its own). A rename, pin, reorder or "use
conversation title" made on the client goes to the host as `terminal_tab_op
{ projectName, op: "rename"|"pin"|"reorder"|"title", id?, label?, emoji?, order? }`
(the same relay a phone's tab edits take), and comes back with the next listing.
So does restarting a terminal whose process ended (`op: "restart"`, by `id`): the
host runs it again in its own tab, and the client's tab is replaced by the new
one in the next listing. A host that predates it answers `unknown tab op`.
After a host restart (a new `run`) the client asks `terminal_exists` about each
of its tabs the host no longer lists and closes the ones that are gone; the host's
restored tabs open in their place.

**Compatibility.** A host that predates `withTabs` ignores it and answers with the
plain array, and the client closes nothing. A client that predates it never asks.
A host without `follow` gets no `terminal_tab_op`: the client keeps its own names
and order, as before.

After the host app restarts, each terminal is relaunched exactly once. A client
starting a terminal on the host adds `restoreHere: true` to the start command's
arguments; the host keeps that on the tab and, after a restart, relaunches it in
place, under its name, like its own tabs. A client whose host `follow`s drops its
dead tabs for that host on restore and gets the relaunched ones through the sync.
Without `follow` (an older host) the client relaunches the tabs it started, and
the host drops the dead ones that carry no `restoreHere`, so an older client still
relaunches its own and nothing runs twice. A tab the client opened because the
host had the terminal (`fromHost` in its saved tabs) is always the host's to
relaunch.

## Global event forwarding

The host forwards these Rust-emitted global events to every authed peer as
`{ "t": "evt", "name", "payload" }` (payload verbatim; non-blocking, overflow
drops and the client re-syncs):

`projects-changed`, `status-changed`, `git-changed`, `ports-changed`,
`port-auto-forwarded`, `port-forward-failed`, `action-output`, `action-done`, `action-bg-output`, `templates-changed`,
`sidebar-changed`, `job-status`, `job-seen`, `memory-changed`, `clone-done`,
`duplicate-done`, `terminals-changed`, `agent-session` and `agent-session-ended`
(a terminal's agent conversation started or was quit, `{ project, paneId, … }`),
`terminal-command` (the line a terminal's shell is about to run, `{ id, command, at }`,
or how it ended, `{ id, code, at }`; the client prefixes `id` like a terminal's name),
and the lines a coding agent prints while it generates something
(`commit-msg-progress`, `pr-title-progress`, `pr-description-progress`,
`branch-name-progress`, `merge-conflict-progress`, `action-yaml-progress`,
`composer-transform-progress`, `statusline-gen-progress`, `ai-generate-output`,
`skill-gen-progress`).

`action-output` `{ runId?, line }` and `action-done` `{ runId?, success, error? }`
name the run they belong to: the client passes `runId` to `run_action` and its
output modal shows only that run's lines. A host that predates it sends neither,
and the client takes those for its own.

The client re-emits each on a single per-peer wrapper channel `peer-evt-{slug}`
with payload `{ name, payload }`; the TS shim demultiplexes, translates
identifier fields (project names → prefixed, roots/paths → prefixed root,
terminal ids → prefixed), and dispatches to the same callbacks the local events
would.

`agent-limits-changed` (the host's Claude and Codex readings) is forwarded too,
but not re-emitted under its own name: those aren't the client's readings. The
client reads it off `peer-evt-{slug}` for the meters beside the host's accounts.
So are `claude-pool-changed` (the host's account switching state, as
`claude_pool_state` answers it) and `claude-account-switched` (`{ key, project,
from, to, pick }`, one automatic move of a pool's new sessions): the client keeps
the host's state apart from its own, marks its pools' project names, shows its
switching notes in the sidebar under the host's name, and toasts its moves.
Taking a suggestion there is `accept_claude_pool_pick { key }` over the generic
invoke.

**Agent chimes and banners.** `status-sound` (`{ value, project, terminal }`)
carries a done, waiting or error transition to a Mac that plays the chime and
posts the banner under its own settings. A headless host forwards every one to
every Mac. Any other host announces a transition itself while one of its windows
is in front, or when it was used after the paired Macs; otherwise it sends the
transition only to the Mac that last took control of one of its terminals (a
`ctl` `claim`), and stays quiet itself. Without a connection to that Mac it
announces it itself.

## Config sync

Mirrors the portable subset of `~/.lpm` between two paired Macs: projects (present
on both — intersection only), synced global files + dirs (union — created when
one-sided), and templates referenced by a matched project. Machine-local parts
(project `root`/`ssh`/`claudeAccount`/`claudeAccounts`/`parent_name`, settings.json window/geometry
keys) are stripped from the compared **portable digest** and preserved locally on
apply, so two Macs that differ only in local paths compare as in sync. The client
drives every sync; the host answers. Each side that receives changes first copies
what a sync can overwrite (projects, templates, the synced global files and dirs) to
`~/.lpm.backup-<ts>`. File-browser metadata (`.DS_Store`, `Thumbs.db`,
`desktop.ini`) in a synced dir is never synced. Rust: `peersync.rs` (shared digest / plan /
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
  host → `result` `{ "items": [wire item…], "more"?: [{kind,name}], "errors"?: […] }`.
  Read-only; used to pull content the client will apply. Unchanged between
  versions. A host packs at most ~4 MiB of items into one reply and lists the rest,
  in request order, under `more`; the client sends `more` back as the next fetch
  until it comes back empty. An item over 12 MiB is never sent and is named in
  `errors` instead. An older host sends everything in one reply.
- **Apply** — client → `{ "t": "syncApply", "v", "reqId", "device"?, "items":[wire item…] }`
  host → `result` `{ "applied", "errors":[…] }`. The host snapshots, applies each
  item with the portable-merge rules, and (at `v:2`) records the sender's revisions.
  The client splits a push into requests of at most ~4 MiB of items each and
  leaves out (with an error) any single item over 12 MiB, so no message nears
  tungstenite's 16 MiB frame limit. Each request is backed up and recorded on its
  own; a client records the bases of a batch only once the host applied all of it.

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
{ "kind", "name", "enc": "text|b64", "content", "mtime", "deleted"?, "rev"?, "device"?, "secret"? }
```

Text files travel as UTF-8, binaries as base64. `deleted:true` (v2) is a pushed
deletion — empty content, the host removes the file (path-validated like a write,
synced-dir files only). `rev`/`device` (v2 push) let the host record the base
without holding the pusher's digest map.

`secret` rides only with `telegram.json` (bot + chats): the bot token, which the
file leaves out. The receiver stores it in its own secret store (Keychain on
macOS), never on disk; a sender that can't read its token leaves it off and the
receiver keeps its own. An empty link (no bot, no chats) is a disconnect and makes
the receiver drop its token. The digest covers the file only, so the token never
enters the digest map or the backups. An older peer refuses `telegram.json` as a
global it doesn't sync, so the token never reaches it.

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
the *source* host's base for that unit stale until the next exchange refreshes it,
so a passive host that only ever serves syncs could over-report a conflict in its
own preview until it synced itself. To close that gap, computing sync status (either
side's Settings pane, or an auto-sync status exchange) also commits the converged
bases — facts only, the units currently equal on both Macs, no item states — so a
host's bases heal as soon as its UI recomputes. The conflict winner is deterministic
regardless, and a backup is always taken.

### Legacy interop

| client ↔ host | behavior |
| --- | --- |
| new ↔ new | configSync2: revision direction, conflict detection, deletions cross. |
| new ↔ old | old host advertises only `configSync`; client sends `v:1` and uses the mtime plan — no revisions, no deletions (identical to pre-Phase-2). |
| old ↔ new | old client sends `v:1`; new host answers with the stripped legacy map (no revisions, tombstones removed) and applies without touching its sidecar. |

Deletions and revision fields are therefore never sent to, nor accepted from, a peer
that does not speak `configSync2`.

### Auto sync

Per peer, config sync can run unattended (opt-in, off by default — the peer's
`autoSync` flag in peer.json). A client-side engine (`autosync.rs`) drives the same
`sync_run` the manual button uses — never a separate protocol. The host needs no
auto-sync code: it answers the sync frames and forwards its config-change events as
always.

**Triggers** (each coalesces into a per-peer "wants to sync" flag):

- **Local change** — the config watcher's own debounced projects/templates
  classification also nudges every auto-enabled peer.
- **Remote change** — a forwarded `projects-changed` / `templates-changed` event
  for a peer nudges that peer.
- **Connect** — a peer session reaching `ready` (feature flags stored) nudges it
  and clears its backoff.
- **Anti-entropy** — every enabled+connected auto peer is nudged every 30 minutes,
  so a dropped (lossy) forwarded event is only ever a delay, never a lost change.

**Pacing.** A 2s quiet-period debounce per peer coalesces a burst of edits; a hard
rate floor keeps consecutive runs for one peer at least 5s apart (the safety valve
so a convergence pull→push can't become a hot loop); one run at a time per peer (a
trigger during a run reruns once it finishes). On a run failure the peer backs off
30s → 2min → 10min (capped), reset on the next success or reconnect.

**Gating.** An auto run happens ONLY when auto-sync is on AND the peer is enabled,
connected, advertises `configSync2`, and is identity-pinned (`tlsFp` set).
Unattended mode never takes the legacy mtime path and never an unpinned/plaintext
channel; a manual "Sync now" still works for a legacy or unpinned peer exactly as
before. When the toggle is on but a gate is unmet the engine does nothing quietly
(the Settings row hints why).

**Convergence & echo.** An auto run right after applying a remote change computes an
empty plan (the digests are equal and the sidecar echo guard suppresses a re-bump)
— a cheap no-op, not a loop. The settings.json fixpoint's single push-back is a
normal small push right after a pull, spaced by the rate floor.

**Surfacing.** After each run the engine emits `peer-autosync-result`
`{ slug, applied, pushed, errors[], conflicts[] }` (`conflicts` = plan items that
resolved as a both-sides change). The frontend toasts only on a conflict (kept the
newer change, backup saved) or an error (throttled per peer); clean runs are silent.

**Dual driver.** Both Macs may enable auto-sync for each other. That stays stable:
the conflict resolver is symmetric (both pick the same winner) and digests converge,
so runs are idempotent — once a change has propagated, the follow-up runs on both
sides compute empty plans and stop.

## Usage limits

A Claude login's plan limits belong to the account, so both ends of a link trade
the readings their own sessions reported (`agent_limits_share.rs`). One frame, in
both directions:

```
{ "t": "limits", "claude": [ { "identity", "label"?, "fiveHour"?, "weekly"?,
                               "updatedAt", "noLimits"? } ] }
```

Each window is `{ "usedPercent", "resetsAt", "observedAt"? }`. `identity` is
`accountUuid:organizationUuid` from the login's `.claude.json` (account ids are
each machine's own); a reading lands on every login on the receiving side signed
in as that identity, and on none when there is no such login. `observedAt` (unix
secs) is when a session observed the window, absent for a replayed or relaunched
reading. The receiver folds readings in with the rules that settle two local
sessions: the later observation wins (ties go to the later `resetsAt`, then the
higher percent, so both ends settle on the same one), an observed reading beats a
replay until its window runs out, and two replays go by `resetsAt` then percent.
`observedAt` is capped at the receiver's own clock and windows that have already
reset are dropped.

The client sends `limits` after `ready` when the host advertises `agentLimits`,
and on every change after. The host answers a connection's first `limits` with
its own and from then on sends that client its changes. A change that came from
the peer goes back to it and changes nothing there, which ends the exchange.

## Keepalive

`{ "t": "ping" }` / `{ "t": "pong" }`. The client pings every 20s.

## Control ownership

A peer is one control surface on the host, under a distinct owner kind `"peer"`
(never collides with `"window"` / `"mobile"`; identity is `(kind, id)`). It
follows the same rules as a host window, reported by the client:

- client → `{ "t": "ctl", "id", "op" }`, `op` one of:
  - `claim` — a window there shows the terminal and is focused, or its user took
    control. The peer becomes the owner; host windows show "Take control".
  - `present` — a window there shows the terminal without focus. The peer joins
    the presenters and owns it only if no host window does.
  - `unpresent` — no window there shows it any more; ownership passes to the
    next presenter.

  `claim` and `present` are ignored for a terminal the host doesn't have. A tab
  that opened only because the other Mac opened its terminal presents for its
  first moments instead of claiming, so control stays with the Mac that opened
  it. A focused client window re-sends `claim` on every focus, since it can't see
  a host window taking control in between.

`unsub` releases control like `unpresent`. On disconnect the host drops that
surface from every terminal, so control transfers back to a host window instead
of stranding on a gone client.

**Compatibility.** A host that predates `ctl` ignores the frame and the `claim`
field, and claims on every `sub` as before. A client that predates `ctl` sends
`sub` without `claim`, so a current host still claims for it.

## Tab sharing (guests)

A host can open one terminal to another person's lpm without pairing it. The
other machine is a **guest**: it holds a token for one share, and a share reaches
one terminal. Host side: `tabshare.rs` (the shares, in memory only, so quitting
lpm ends them) and `peer/guest.rs` (a guest's connection). Guest side:
`peerclient/share.rs`. Guests use the same listener, TLS identity and terminal
rings as paired machines, and nothing else.

**Invite.** `lpm-share:` + unpadded base64url of `{v:1, h:hosts, p:port, s:secret,
f:fp}`, plus `n` (this machine's name), `l` (the tab's label) and `j` (its
project), each at most 64 characters, for the join dialog and the browser page
to greet with before anyone is let in; an older lpm leaves them out. `f` is
required: the guest dials pinned to it before the secret leaves the machine. One invite serves any number of people, each let in separately,
until the host stops sharing. The host hands it out as a link with the same
payload in the fragment, `https://lpm.cx/join#<payload>` (the browser never
sends it to the site); that page opens `lpm://join?i=<payload>`, which lpm
registers on every desktop platform (`sharelink.rs`) and turns into the Join
dialog, filled in. The dialog accepts all three forms.

**Join** (first frame, TLS only):
- guest → `{ "t": "shareJoin", "secret", "name", "platform" }`
- host → `{ "t": "shareJoinPending", "hostName", "label" }`, then waits up to
  120 s for someone at the host to answer (at most three askers wait per share).
  To a browser it adds `"match": "emoji"`: the page shows the handshake's four
  emoji (`sharenoise.rs`), or four digits for a host on lpm 0.7.26, which sent no
  `match`. To lpm it adds `"code"`: four emoji made for this request, which the
  host shows beside it, so either way someone holding a forwarded invite can't
  pass for the person it was sent to
- host → `{ "t": "shareJoined", "guestId", "token", "hostName" }`, or `error`
  (unknown/ended invite, declined, timed out), and closes. The host lets each
  asker in able to type or not: what the share gives new people, unless the
  answer picked otherwise.

**Resume.** `{ "t": "auth", "deviceId": guestId, "token" }`, the same frame a paired
machine sends. A host that finds no paired device checks its guests and answers
`{ "t": "ready", "guest": true, "share": { id, terminalId, project, label, canType,
asked, askType, others }, "features": [] }`. `canType` and `asked` are this
guest's own; `askType: true` says the host takes `shareAskType`; `others` names
the other guests connected right now. A token is stored as its sha256, like a
device token.

**What a guest may send**, each checked against the share on every frame, so a
change takes effect on the next frame rather than the next connection:
- `ping`
- `sub` / `unsub` for the shared terminal only (anything else gets the `gone`
  exit). A guest's `sub` never claims control; its `seed` adds `cols`/`rows`.
- `invoke` of `write_terminal` (only while the host lets this guest type) and
  `terminal_exists`, both for the shared terminal only. Every other command is
  refused, and nothing reaches the generic proxy.
- `{ "t": "shareAskType" }`: ask the host to let this guest type. Ignored while
  the guest may already type or is waiting for an answer, and for 20 s after the
  host said not now.
- `forget` (leave).

Everything else is ignored. A guest never resizes the terminal or takes control:
it renders at the host's size, which it learns from the seed and from
`{ "t": "size", "id", "cols", "rows" }` on every resize. It is never sent `evt`
frames or any frame addressed to a paired device.

**Host pushes:** `{ "t": "shareInfo", canType, asked, askType, label, project,
others }`, each guest's own, when the host lets that guest type or takes it
back, answers its asking, and when someone else connects, leaves or is removed;
`{ "t": "shareEnded", "reason" }` (`stopped`,
`removed`, `closed` when the terminal ends, `left`), after which the host closes
the connection. A guest that comes back with a token the host no longer knows
(it restarted) gets `unauthorized` and stops dialling.

**Guest side.** A joined tab is kept in `peer.json` under `joined`, apart from
`peers`, so nothing that lists paired machines sees it. It rides the same
connection code as a paired machine (reconnect, pinning, resume by offset) under
a slug of its own, and drops every host frame except `pong`, `result`, `seed`,
`o`, `exit`, `size`, `shareInfo` and `shareEnded`: whoever shared a tab is a
stranger to the guest machine.

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
- `peer_set_auto_sync(slug, enabled)` (unattended config sync; nudges a run when on)
- `peer_invoke({ slug, cmd, args }) -> value` (blocks up to 35s)
- `peer_update_mac(slug) -> "cancelled" | "disconnected"` (blocks for the install;
  progress arrives as `peer-update-progress` `{ slug, phase, progress }`)
- `peer_cancel_mac_update(slug) -> bool`
- `ignored_sync_list(project, targets: [{ slug, remoteRoot }], dir) -> { here,
  there: { <slug>: listing }, sameRepo: { <slug>: bool } }`,
  `ignored_sync_start(id, project, slug, remoteRoot, direction, paths)` (a one-time
  copy with one computer; the caller picks `id` and listens first; progress as
  `ignored-sync-progress`, the outcome as `ignored-sync-done` with the `batch`),
  `ignored_sync_set(id, project, targets, paths, prefer)` (remembers the list for
  each target and brings them all in step now, this Mac in the middle: one round
  per computer, then a second round for those before the last one that brought
  files here. `prefer` is `newest`, `here` or a target's slug for files that
  differ; same events, progress naming the `machine` being copied with, done with
  `sent`, `sentTo: [{ machine, files }]`, `received` and `batches`),
  `ignored_sync_cancel(id)`,
  `ignored_sync_undo(project, batches: [{ batch, slug?, remoteRoot? }])` (no slug:
  the batch landed on this Mac), `ignored_sync_read(project, targets, path) ->
  { here, there: { <slug>: text } }`, `ignored_sync_saved(project, slug)`,
  `ignored_sync_save(project, slug, remoteRoot, paths, keep)` (refused when the two
  `origin`s differ), `ignored_sync_forget(project, slug)` — `project` is the local
  one, so these never route to the host. Lists stay per computer; the background
  engine settles a project's computers together the same way, so a change on one
  reaches the others in one sweep while this Mac is on
- `peer_settings_get(slug) -> { <shared setting>? … }`
- `peer_settings_set(slug, patch) -> same shape` (both fail with an update hint on a
  host without `hostSettingsAll`)
- `peer_term_attach(prefixedId, resume)` / `peer_term_detach(prefixedId)` —
  `resume: true` asks for only the bytes missed since this Mac last applied
  output, and is the caller's word that the emulator those bytes were being
  applied to is still on screen. Nothing below the frontend can know that: the
  offsets outlive the webview, so after a reload every pane is a blank emulator
  while the offsets still point deep into their streams. `resume: false` drops
  the offset first, so the `sub` carries no `from` and the host replays in full.

Tab sharing, host role:
- `peer_shares() -> [share]`, each `{ id, terminalId, project, label, canType,
  invite, browser, guests: [{ id, name, joinedAt, connected, canType, via, asked,
  typedAt }], waiting: [{ id, name, code, via }] }`. The share's `canType` is what
  people let in from now on may do; each guest has its own. `via` is `lpm` or
  `browser`; `typedAt` is when this machine last heard that guest type (ms,
  noted at most every 2 s)
- `peer_share_start(terminalId, project, label) -> [share]` (turns the listener on
  for every interface, as pairing does; sharing a shared tab again keeps its invite)
- `peer_share_stop(id)`, `peer_share_set_can_type(id, canType)` (for people let in
  later), `peer_share_set_guest_can_type(id, guest, canType)` (also answers that
  guest's asking), `peer_share_decline_ask(id, guest)`,
  `peer_share_take_keyboards(id)`, `peer_share_remove_guest(id, guest)`,
  `peer_share_respond(request, allow, canType?)`, `peer_share_qr(link) -> svg`

Tab sharing, guest role:
- `peer_share_join(hosts, port, secret, fp) -> { slug }` (blocks for the host's
  answer); `peer_share_join_cancel()`
- `peer_joined_shares() -> [{ slug, hostName, host, terminalId, label, project,
  canType, asked, askType, others, connected, ended, lastError, cols, rows,
  joinedAt }]`
- `peer_share_ask_type(slug)`
- `peer_share_leave(slug)`

Frontend-facing events: `peer-state-changed`, `peer-invoke` (host dispatcher),
`peer-evt-{slug}`, `peer-autosync-result` (one per unattended run),
`peer-update-progress`, `peer-settings-changed` (host side, after `settingsSet`),
`pty-output-peer-{slug}-…`, `pty-exit-peer-{slug}-…`; for tab sharing
`peer-share-changed` and `peer-share-typed` (host; `{ share, guest, at }`, at
most every 2 s per guest), `peer-joined-changed`, `peer-share-join-pending` and
`pty-size-peer-{slug}-…` (guest).

## Limitations / trust model

- **A guest is not trusted, but typing is.** A guest reaches one terminal and
  nothing else (see **Tab sharing**), yet a guest allowed to type can run any
  command there as the host user. The host lets each guest in by hand and turns
  typing on for each guest explicitly; it is off by default.
- **A paired client is fully trusted, over a wide surface.** Pairing grants the
  same "full control" trust the mobile companion has, but through a generic
  command proxy rather than a fixed message set. Every command not on the host
  denylist runs on the host with the host user's privileges — including
  filesystem commands (`read_file`, `write_file`, `save_text_file`) and
  open-in-editor/Finder commands, which read/write files and launch apps *on the
  host Mac*. Pair only Macs you control. The denylist (`is_denied` in `peer.rs`)
  blocks app-meta, control-ownership, and global-mutator commands as defense in
  depth, but is not a sandbox.
- **The client never shows a "Take control" placeholder.** The host doesn't
  push ownership changes to the client, so a client window keeps rendering a
  terminal a host window has taken, until it is focused again and re-claims.

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
