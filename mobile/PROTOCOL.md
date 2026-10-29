# lpm mobile ↔ desktop wire protocol (v1)

The desktop server lives in `desktop/frontend/src-tauri/src/remote.rs`. The phone
is a WebSocket client. This document is the contract both sides implement.

## Transport

- `wss://<host>:<port>/` — WebSocket over TLS (`tungstenite` wrapping a `rustls`
  server session; see `desktop/frontend/src-tauri/src/remotetls.rs`). There is
  **no plaintext (`ws://`) fallback** — every accepted socket is wrapped in TLS
  before the WebSocket handshake.
- Default port `8765` (configurable under + above your projects → Phone).
- The server binds every interface (`0.0.0.0`) whenever remote control is on, so
  a paired phone reaches it over the LAN, and away from home over a **Tailscale**
  tailnet (connect to the Mac's tailnet IP); the tailnet and TLS layers simply
  compose. Reaching the port grants nothing by itself: every connection still has
  to pair or authenticate (below).
- **Certificate & pinning.** The Mac presents a single **self-signed** leaf
  certificate (ECDSA P-256, CN `lpm`, ~10-year validity), generated once and
  persisted as PEM next to `remote.json` in `~/.lpm` (`remote-cert.pem` /
  `remote-key.pem`, mode `0600`) — it is **never rotated**. The client does **not**
  use a CA/PKI: it **pins the leaf certificate's SHA-256** (lowercase hex of the
  DER) and refuses any connection whose presented leaf does not match the pinned
  value.
  - **QR pairing:** the pairing QR URL (`lpm://pair?p=<port>&c=<code>&h=<host>…`)
    carries the fingerprint as **`&f=<hex sha256>`**; the phone pins that value up
    front and verifies the leaf against it on the pairing connection.
  - **Trust-on-first-use:** a device that has no pinned fingerprint yet (paired
    before TLS, or paired by a path without `f=`) pins the leaf SHA-256 it observes
    on its **first successful** pair/auth, then enforces it on every later connect.
  - A fingerprint **mismatch** is treated as a failed/refused connection by the
    client (never silently trusted).
- Every frame is a **text** WebSocket message containing a JSON object with a
  discriminator field `t`. Unknown `t` values are ignored (forward-compatible).
  **Unknown *fields* inside a known frame are ignored too, on both sides** — the
  Mac reads named keys off the decoded object and the phone reads named keys off
  the decoded dictionary, so neither trips over an extra one. That is what makes
  every optional addition below (e.g. `replaces` on `pair`) safe in both
  directions: a newer phone can send it to an older Mac, and a newer Mac never
  requires it from an older phone.

## Discovery (Bonjour/mDNS)

The desktop advertises the WebSocket server over Bonjour so the phone can find it
on the LAN — and, crucially, **re-find a saved Mac whose LAN IP changed** by
matching the stable `serverId` in the TXT record rather than a remembered address.

- **Service type:** `_lpm._tcp.` (`_lpm._tcp.local.`).
- **SRV port:** the effective WebSocket port actually bound (the same port the
  phone connects to — includes the dev instance's port offset).
- **Instance name:** `<serverName> [<first 6 chars of serverId>]`, sanitized and
  truncated to the 63-byte instance-label limit while always keeping the id
  fragment. It exists only to be unique on the wire; the phone shows the `name`
  TXT value, not the instance name.
- **TXT records:**
  - `id` — the full `serverId` UUID (the match key; equals the `serverId` from
    `paired`/`ready`).
  - `name` — the user-visible `serverName` (same value as `paired`/`ready`).
  - `v` — protocol version, currently `"1"`.
  - `rp` — `"1"` when this machine can show a **pair-by-approval** dialog, `"0"`
    when it cannot (a headless host: nobody is at it to tap Allow, so a
    `pairRequest` there is refused on the spot — see
    [Pair by approval](#handshake-first-frame-required-within-20s)). The phone
    should hide the "ask to pair" affordance on a `"0"` record and offer the
    machine's pairing code instead. **Absent** on a desktop that predates the
    key; treat a missing `rp` as `"1"` (every such build is a Mac).
  - `dev` — present and `"1"` **only** on a dev build; absent on release. Lets the
    phone distinguish a dev and a prod instance running on the same Mac (which
    also have distinct `serverId`s and ports).
- **When advertising is active:** whenever the remote server is **running** — it
  listens on every interface while remote control is on (see
  [Transport](#transport)). The record is withdrawn when the server stops or
  can't bind its port, and re-published (with a fresh port/name) whenever a
  config change rebinds the server. Dev and prod instances each advertise their
  own record.

## Handshake (first frame, required within 20s)

The phone sends exactly one of the frames below. Every one of them (`pair`,
`pairRequest`, `auth`, `relay`, `unpair`) also carries `"phoneId": "<uuid>"`:
this install's own id, a lowercase UUID minted once and kept in the Keychain
beside the credentials, never rotated. It names the phone behind any credential,
so a Mac that removed it can refuse it however it arrives. Macs that predate it
ignore the field; the examples leave it out.

**Pair** (first time, using a one-time code from the desktop's QR):
```json
{ "t": "pair", "code": "AB12-CD34", "name": "My iPhone" }
```
`replaces` (**optional**) names a device id this pairing supersedes:
```json
{ "t": "pair", "code": "AB12-CD34", "name": "My iPhone", "replaces": "<uuid>" }
```
The phone sends it when it is **re-pairing** a Mac it already has a credential
for — the "Pair Again" flow it offers after an `unauthorized` reply — passing the
`deviceId` the Mac just rejected. The Mac then drops that record in the same
write that appends the new one, so the phone ends up with exactly one device
record instead of accumulating a ghost per re-pair. Omit it (or send an empty
string) for a first-time pairing; an older phone that never sends it, and an
older Mac that ignores it, both behave exactly as before — the only difference is
that the superseded record stays until it is revoked by hand.

→ on success the server replies and the code is consumed (single use):
```json
{ "t": "paired", "deviceId": "<uuid>", "token": "<base64 bearer token>",
  "serverId": "<uuid>", "serverName": "My MacBook Pro", "platform": "macos",
  "hosts": ["192.168.1.23", "100.101.102.103"] }
```
The phone stores `deviceId` + `token` in the Keychain. `serverId` is this Mac's
stable identity (minted once, persisted in `remote.json`); `serverName` is its
user-visible computer name (from `scutil --get ComputerName`, falling back to the
hostname). Together they let a phone paired with **several Macs** tell them apart
and label each one.

`platform` is the operating system of the machine that answered, spelled as Rust's
`std::env::consts::OS` — `"macos"` for a Mac, `"linux"` for a headless host a Mac
installed lpm on. It rides `paired` **and** `ready` (see below) so a phone learns
it on the pairing and re-learns it on every resume. A phone talking to a Linux
host should not offer what only a Mac has: pair-by-approval, or anything that
assumes someone is sitting in front of the machine. **Absent** from a desktop that
predates the field; treat a missing `platform` as `"macos"`.

`version` is the lpm release the machine runs (`"dev"` for a development build),
and `selfUpdate` is true when the phone may install a newer release there (see
[Updating lpm](#updating-lpm)) — only a release build on macOS replaces itself.
Both ride `paired` **and** `ready`. **Absent** from a desktop that predates them;
treat a missing `selfUpdate` as false.

`features` lists requests this machine answers that an older one silently
ignores, so the phone sends them only where they will get a reply. Today:
`"fileUpload"` — the chunked attach (`uploadBegin` … `uploadDone`, under
[Requests](#requests-phone--desktop-and-their-replies)); `"serviceLogsWatch"` — live service logs
(`serviceLogsWatch` / `serviceLogsUnwatch`); `"serviceRestart"` — `restartService` /
`stopService`, and an ended service reported as `exited`; `"agentAnswers"` — a terminal
agent's answers for the copy key (`answers`); `"restartTerminal"` — running an ended
terminal again in its tab (`restartTerminal`); `"agentLaunch"` — `agentOptions`, and
`newTerminal` starting an agent; `"agentSessions"` — `agentSessions` and `resumeSession`;
`"actionPrompt"` — `runAction` with a `prompt`;
`"listDir"` — browsing a project's folders (`listDir`); the last four under
[Agent tabs and files](#agent-tabs-and-files); `"tabMenu"` — `forkTerminal`,
`forkTerminalCopy`, `titleTerminal` and `closeOtherTerminals`; `"weeklyRecap"` — the
desktop's weekly recap card (`weeklyRecap`); `"recapMonth"` — `weeklyRecap` with
`period: "month"`; `"agentArchive"` — seen agents
(`seenEntries`, `seen`, `seenAgentsShown`) and `archiveStatus`, `markStatusSeen` and
`markStatusUnread` (see [Seen and archived agents](#seen-and-archived-agents)); `"limitReminders"` —
`limitReminders`, `setLimitReminder` and `clearLimitReminder` (see
[Limit reminders](#limit-reminders)); `"wake"` — waking another paired machine (`wake`, see
[Waking a sleeping Mac](#waking-a-sleeping-mac)). Rides `paired` **and** `ready`;
**absent** from a desktop that predates it, which means none.

`hosts` (**optional**) is the Mac's current candidate address list, most-preferred
first — the same LAN-then-Tailscale list the pairing QR's repeated `h=` params
carry (the Tailscale entry only while that toggle is on and a tailnet interface
is up). It is **omitted** when the Mac has nothing usable to advertise (the QR's
loopback fallback is never sent here). The phone **merges** these into the saved
record for the frame's `serverId` — never replaces the list, and never applies
them to any other Mac — so a phone paired by approval (no QR) still learns the
Tailscale address, and an address that changed after pairing reaches every phone
on its next connect. Older apps ignore the unknown field.

`wake` (**optional**, `ready` only) lists the network cards the Mac can be woken
through: `[{ "mac": "3a:07:2a:86:ff:1c", "ip": "192.168.1.23", "broadcast": "192.168.1.255" }…]`
— the card's hardware address as its network knows it, its private IPv4 address and
that network's broadcast address. Absent when the Mac knows none (Windows, or a Mac
that hides its hardware addresses from lpm). The phone saves it on the record for the
frame's `serverId`, replacing what it had, and uses it to wake the Mac later (see
[Waking a sleeping Mac](#waking-a-sleeping-mac)).

The code is **single use and expires 10 minutes** after the Phone screen arms it; the
desktop clears an expired code rather than leaving it redeemable in
`remote.json`. On rejection:
```json
{ "t": "error", "error": "pairing rejected" }
{ "t": "error", "error": "pairing unavailable" }
```
`pairing rejected` means the **code** was wrong, already used, or expired — ask
the Mac for a fresh one (a wrong-code decline is also delayed ~500ms, and the
connection closes after it, which bounds guessing). `pairing unavailable` means
the code was fine but the Mac **could not save** the new device (`remote.json`
is unreadable, or another writer holds it), so a fresh code won't help either;
lpm on the Mac shows what to fix. Both end the attempt and the connection. The
strings stay readable sentences on purpose: a phone that predates
`pairing unavailable` passes unknown error text straight to the user, so it
still reads as an explanation rather than a code.

`{ "t": "error", "error": "revoked" }` answers a `pair` whose code another Mac
armed for this phone (`machinePair`) when the user removed this phone on this
Mac. The phone stops adding the machine on its own and says it must be paired
on that Mac itself (nearby, QR or a code armed there), which clears the removal.

**Pair by approval** (first time, no typed code — for a phone that found this Mac
via [Discovery](#discovery-bonjourmdns) and asks the user to approve on the Mac):
```json
{ "t": "pairRequest", "name": "My iPhone" }
```
It accepts the same **optional** `replaces` key as `pair`, with the same meaning
(`{ "t": "pairRequest", "name": "My iPhone", "replaces": "<uuid>" }`) — this is
the path the "Pair Again" flow takes for a Mac found on the LAN.

The server replies immediately with one of:
```json
{ "t": "pairPending", "matchCode": "1234" }
{ "t": "pairDenied", "reason": "busy" }
{ "t": "pairDenied", "reason": "declined", "message": "<why, in a sentence>" }
```
`pairPending` means the Mac is now showing an approval dialog; `matchCode` is 4
random digits the Mac displays and the phone should show too, so the user can
confirm the same device (the phone never sends it back — a human compares them).
`busy` means another request is already pending or one was shown too recently
(the Mac spaces prompts out) — the phone may retry shortly.

An immediate `declined` means this machine cannot present the dialog at all — a
headless host has nobody at it to tap Allow — and it carries an **optional**
`message`, a sentence to show the user pointing them at the machine's pairing
code instead. It is `declined` rather than a new reason so a phone that predates
the field still reads it as the terminal refusal it is. This is the same thing
the `rp` TXT key advertises ahead of time, so a phone that reads `rp` should
never get here.

Then, within a 30-second window, exactly one of:
```json
{ "t": "paired", "deviceId": "<uuid>", "token": "<base64 bearer token>",
  "serverId": "<uuid>", "serverName": "My MacBook Pro", "platform": "macos",
  "hosts": ["192.168.1.23", "100.101.102.103"] }
{ "t": "pairDenied", "reason": "declined" }
{ "t": "pairDenied", "reason": "timeout" }
```
`paired` (user tapped Allow) is byte-for-byte the same shape and meaning as the
code-based `paired` above — same token/device minting, same optional `hosts`
(this path had no QR, so it is how an approval-paired phone learns the Mac's
Tailscale address at all), same post-pairing behavior. `declined` (user tapped Deny) and `timeout` (30s elapsed with no
decision) are terminal; the server then closes the connection. If the phone
disconnects while pending, the Mac cancels the request and dismisses its dialog.

**Auth** (every subsequent connect):
```json
{ "t": "auth", "deviceId": "<uuid>", "token": "<base64 bearer token>" }
```
→ `{ "t": "ready", "serverId": "<uuid>", "serverName": "My MacBook Pro",
"platform": "macos", "version": "0.6.10", "selfUpdate": true,
"features": ["fileUpload", "serviceLogsWatch", "agentAnswers"], "hosts": ["192.168.1.23", "100.101.102.103"] }`
on success, or `{ "t": "error", "error": "unauthorized" }`. `serverId` and
`serverName` are the same stable identity + computer name returned by `paired`,
re-sent on every resume so a phone paired with multiple Macs keeps them labeled
and can route each connection to the right Mac. `platform` is the same OS name as
on `paired`, re-sent for the same reason — a phone that paired before the field
existed learns it on its next connect. `hosts` is the same optional
candidate address list as on `paired` (merge into this `serverId`'s saved
record; omitted when the Mac has nothing usable to advertise) — re-sent on every
resume so a LAN or Tailscale address that changed since pairing propagates
without re-pairing.

The server stores only `sha256(token)`; the raw token never leaves the phone
after pairing. Revoking a device on the desktop (+ above your projects → Phone)
deletes its hash and drops any live connection.

Before checking the token the Mac **re-reads the paired-device list from
`remote.json`** (at most once a second, and only the device list — never the
server settings). A read that *fails* doesn't spend that second: it is retried
after a much shorter floor, so a momentary failure can't turn away, for a whole
second, phones this Mac would otherwise accept — while a file that stays damaged
still isn't re-read on every frame.

A device paired or revoked by another lpm instance sharing the same config is
therefore honoured immediately, without restarting either build: the running
process accepts a phone the other one just paired, and stops accepting one it
just revoked.

Already-authed connections get the same refresh every few seconds, so a revoke
reaches a phone that is **already connected** — its socket is dropped mid-session
rather than surviving until it next reconnects. This refresh is best-effort: if
another writer holds the file it is skipped and retried on the next pass, so it
never delays terminal output.

`unauthorized` means the Mac holds **no record** for this `deviceId`/token —
revoked, or the app's data was reset. Retrying the same credential can never
succeed, so the phone stops reconnecting and offers to pair again (sending
`replaces` with the dead `deviceId`, above) rather than looping.

`{ "t": "error", "error": "revoked" }` instead means the Mac removed **this
phone** (Revoke under the desktop's + above your projects → Phone, or
`lpm mobile revoke`, remembered by
`phoneId`). The Mac sends it at `auth`, and to a phone connected at that
moment just before it closes the socket. The phone removes the Mac from its own
list, as if the user had removed it there, but sends no `unpair`, and says once
that the Mac removed it. A removed Mac that a phone opened through another Mac
goes alone; a direct one takes the machines opened through it with it.

**Relay** (instead of `auth`, to open one of the Mac's
[machines](#machines-this-mac-connects-to) without pairing with it):
```json
{ "t": "relay", "deviceId": "<uuid>", "token": "<base64 bearer token>", "slug": "<machine slug>" }
```
The credential is this Mac's, checked exactly as for `auth`; `slug` names the
machine in the `machines` reply. The Mac carries the connection on over its own
link to that machine, and from there on the machine answers as itself: its
`ready` (with its own `serverId`, `serverName`, `platform`, `version`, `features`,
and no `hosts`), then every request and push exactly as on a direct connection,
in the same order. The machine knows the phone by the `deviceId` it has on this
Mac, so a terminal's `owner` still names this phone. Its push notifications
don't reach a phone that way — `apnsToken` and `pushToken` belong to Macs the
phone is paired with — and the machine's own phone server can be off.

Failures, each followed by the Mac closing the connection:
`{ "t": "error", "error": "unauthorized" }` as for `auth`;
`{ "t": "error", "error": "revoked" }` — the machine removed this phone
(by `phoneId`), sent as the first frame of the carried session; the phone stops
retrying and offers pairing on that machine itself, as for a `pair` refused the
same way;
`{ "t": "error", "error": "relay-offline" }` — the Mac isn't connected to the
machine right now (retry with backoff); `{ "t": "error", "error":
"relay-unsupported" }` — the machine's lpm predates relayed phones. A relayed
connection also ends when the Mac loses its link to the machine. The machine
says `bye` when it sleeps or quits, but not when its own phone server is turned
off — that doesn't end a relayed connection. A Mac that predates `relay` closes
the connection without a reply; the phone only relays to a machine marked
`relay: true`.

**Unpair** (instead of `auth`, when the user removes this Mac from the phone):
```json
{ "t": "unpair", "deviceId": "<uuid>", "token": "<base64 bearer token>" }
```
The credential is checked exactly as for `auth`. On a match the Mac deletes the
device's record — as Revoke on the desktop does, dropping any live
connection for it and its push registration — replies `{ "t": "unpaired" }` and
closes; an open Phone screen refreshes its device list. A credential with no
record gets `{ "t": "error", "error": "unauthorized" }`, and a Mac that can't
save the removal (`remote.json` unreadable or held by another writer) answers
`{ "t": "error", "error": "unpair unavailable" }` and keeps the record.

The phone sends it on a short-lived connection of its own, on the pinned
certificate only, and drops its own credential either way: removal never waits
for the Mac. A Mac that is off or unreachable, that answers `unpair unavailable`,
or that predates `unpair` and closes without a reply, stays in the phone's
pending list. That list is kept with the credentials (the iOS Keychain, sealed
on Android). The phone tries again at launch and each time it comes to the
foreground, for 30 days. `unpaired` or an `unauthorized` reply settles it. A machine opened [through another Mac](#machines-this-mac-connects-to)
holds no credential of its own, so removing it sends nothing.

## Requests (phone → desktop) and their replies

| Request | Reply |
|---|---|
| `{ "t": "projects" }` | `{ "t": "projects", "projects": [ProjectInfo…], "workStatuses": [CustomWorkStatus…], "workStatusOrder": ["<status key>"…], "autoPullMode": "off"\|"chosen"\|"all", "seenAgentsShown": N, "keepFinishedAgents": bool }` — `seenAgentsShown` and `keepFinishedAgents` (only when `features` has `"agentArchive"`) are the Mac's Settings › Agents › In the sidebar › Seen agents per project (1–10) and Keep finished agents until archived (off by default; see [Seen and archived agents](#seen-and-archived-agents)). `workStatuses` is the user's own work-status palette (`{ label, emoji, withNote? }` each), and `workStatusOrder` the order the Status menu was dragged into (each entry a status key: a built-in state, or `custom:<label>`). Both live in the Mac's `~/.lpm/statuses.json` (as `custom` and `order`; the wire names predate that file). `workStatuses` always starts with the five shipped statuses (Review, Ready, Waiting, Needs decision, Paused), then the user's own additions; `workStatusOrder` is `[]` until the user reorders the menu. The phone lists its three built-in states (In progress / Blocked / Done) plus that list, sorted by the order (its own default order when that is empty), and assumes the five shipped statuses when a Mac too old to send `workStatuses` omits the key. `autoPullMode` is the Mac's Settings › Git › Auto pull: `off` (never), `chosen` (only projects set to On), `all` (every project not set to Off); a missing or unknown value reads as `off`. A project's effective auto pull is: off when the mode is `off`; else its own `autoPull` when set; else, for a duplicate or worktree, its parent's `autoPull` when set; else on only in `all`. |
| `{ "t": "stats", "days": N, "machine": "all"\|"local"\|slug?, "fresh": bool? }` | `{ "t": "stats", "ok": true, "machine": "…", "stats": AgentUsageStats, "machines": [UsageMachine] }` / `{ "ok": false, "error": "…", "machine": "…" }` — agent token-usage stats for the last `N` days (`0` = all time), i.e. the desktop Stats page. `machine` picks whose: `"local"` (the default when absent, which is all an older Mac answers) this Mac's own, a paired computer's `slug` that computer's, read over the Mac's peer link, or `"all"` every connected computer's added together (a project, model or day they share is one row; `recentSessions` then carry `machine`). A computer that is offline or fails is left out of `"all"` and marked in `machines`; picking it alone fails the request. Each computer keeps a read for a minute, so switching computers after `"all"` answers at once; `fresh: true` (pull to refresh) scans again, as does any request without `machine`. The Mac scans Claude Code / Codex session-history files (usage metadata only — no prompts or responses), so it runs off this connection's read loop and the reply arrives **asynchronously** (later than a fast request sent after it). SSH projects are excluded. The usage rows under the projects list ask for `days: 1` with no `machine` (today's spend on this Mac, as the desktop sidebar does) while the list is showing — at most every 30 seconds and every 3 minutes at rest — and tell the two apart from the Stats screen's by the `days` and `machine` the reply echoes |
| `{ "t": "weeklyRecap", "week": "last"\|"this", "period": "week"\|"month"?, "fresh": bool? }` | `{ "t": "weeklyRecap", "ok": true, "week": "last"\|"this", "period": "week"\|"month", "recap": WeeklyRecap }` / `{ "t": "weeklyRecap", "ok": false, "week": "…", "period": "…", "error": "…" }` — the desktop's weekly recap ("My agents' week", or "My agents' month"): last week (the default) or this week so far, Monday to Sunday by the **Mac's** calendar, or with `period: "month"` last or this calendar month, added up over this Mac and every connected computer as the desktop's own card is. `period` defaults to `"week"`; send `"month"` only when `features` has `"recapMonth"`, since an older Mac ignores it and answers with a week and no `period`. Reads the agents' history and the user's commits, so it runs off the read loop and the reply arrives **asynchronously**; the Mac keeps a week's read for ten minutes, or until a paired computer that was offline for it connects, and `fresh: true` (pull to refresh) reads again. The phone draws the card itself from `recap` with the desktop's rules (see **WeeklyRecap**) and shares it as an image; no project name goes on the card. Only when `features` has `"weeklyRecap"` |
| `{ "t": "limits" }` | `{ "t": "limits", "ok": true, "limits": AgentLimits, "claudeEnabled": bool, "now": unix MILLIS }` / `{ "ok": false, "error": "…" }` — the agent plan-usage meters (the desktop Usage page): how much of each tool's 5-hour and weekly window is used. Answered inline from an in-memory store, so it is fast and ordered. `claudeEnabled` is false when Claude reporting has not been switched on for this Mac — the phone must show "off on this Mac" rather than an empty spinner, because an off Mac never reports Claude windows at all. Codex needs no opt-in. `now` is the Mac's own clock when it built the frame; it anchors `updatedAt`, which the Mac stamps, and not `resetsAt`, which comes from the tool's own servers (see AgentLimits below) |
| `{ "t": "ttsSpeak", "reqId": "<uuid>", "text": "…" }` | `{ "t": "ttsSpeak", "reqId": "<uuid>", "ok": true, "format": "aac", "audio": "<base64>" }` / `{ "ok": false, "error": "…" }` — synthesizes `text` with the Mac's configured OpenAI voice and returns the whole clip as base64 AAC. Slow (a network round trip per chunk, and long text is split across several), so the reply arrives on the out-queue rather than in order; `reqId` lets the phone drop the answer to a request it has already superseded. Requires an OpenAI key in the Mac's Keychain — without one the reply is `ok: false`. |
| `{ "t": "jobs" }` | `{ "t": "jobs", "ok": true, "jobs": [JobInfo…] }` / `{ "ok": false, "error": "…" }` — every automation across local projects |
| `{ "t": "jobHistory", "project": "<name>", "jobId": "<id>" }` | `{ "t": "jobHistory", "project": "<name>", "jobId": "<id>", "ok": true, "entries": [JobHistoryEntry…] }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "jobLiveOutput", "project": "<name>", "jobId": "<id>" }` | `{ "t": "jobLiveOutput", "project": "<name>", "jobId": "<id>", "ok": true, "live": { "startedAt": N, "text": "…" }\|null }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "runJob", "project": "<name>", "jobId": "<id>" }` | `{ "t": "runJob", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "stopJob", "project": "<name>", "jobId": "<id>" }` | `{ "t": "stopJob", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "setJobEnabled", "project": "<name>", "jobId": "<id>", "enabled": bool }` | `{ "t": "setJobEnabled", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "markJobSeen", "project": "<name>", "jobId": "<id>", "at": N? }` | `{ "t": "markJobSeen", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — mark this automation's runs read up to `at`, the entry the phone opened, leaving anything newer unread; omit `at` to read all of it. The watermark only moves forward, so opening an older run can't un-read newer ones. Read state is per project/job pair and shared with the desktop, so a job spanning several projects needs one call per entry in `targets`. Pushes `jobs-changed` |
| `{ "t": "markAllJobsSeen" }` | `{ "t": "markAllJobsSeen", "ok": true }` / `{ "ok": false, "error": "…" }` — mark every automation read. Pushes `jobs-changed` |
| `{ "t": "sendJobFollowup", "project": "<name>", "jobId": "<id>", "at": N, "message": "…", "agent": "…", "model": "…", "effort": "…" }` | `{ "t": "sendJobFollowup", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — continues the conversation containing history entry `at`; empty agent/model/effort use the automation's settings. A conversation waiting on a question (an entry with an open `JobAsk`) takes the message as the answer, in the user's own words |
| `{ "t": "answerJobQuestion", "project": "<name>", "jobId": "<id>", "askId": "<ask id>", "answers": { "<question id>": true\|false\|["<label>"…]\|"<text>" } }` | `{ "t": "answerJobQuestion", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — answers the question the automation is waiting on (`JobInfo.ask`; `project` is `ask.project`). One answer per question id: a bool for `confirm`, the picked option labels for `choice` (with `other`, a label may be the user's own words), text for `text` and any type the phone doesn't know. Optional questions may be left out. The first answer from any device wins; a later one fails with a message saying so. An agent run resumes with the answer; a command run that was waiting carries on. Pushes `jobs-changed` |
| `{ "t": "dismissJobQuestion", "project": "<name>", "jobId": "<id>", "askId": "<ask id>" }` | `{ "t": "dismissJobQuestion", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — drops the question unanswered: an agent run stays where it stopped, a waiting command hears that no answer is coming. Pushes `jobs-changed` |
| `{ "t": "jobConfig", "project": "<name>", "jobId": "<id>", "source": "project"\|"repo"\|"global" }` | `{ "t": "jobConfig", "project": "<name>", "jobId": "<id>", "ok": true, "job": { …raw YAML body… } }` / `{ "ok": false, "error": "…" }` — the stored job body (`label`/`emoji`/`schedule`/`check`/`duplicate`/`run`/`projects`) read from `source`'s layer file, so the phone editor can seed an edit. Mirrors the desktop's readJobPayloadFrom |
| `{ "t": "saveJob", "id": "<id>", "source": "project"\|"repo"\|"global", "project": "<name>", "job": { …body… } }` | `{ "t": "saveJob", "ok": true, "id": "<id>" }` / `{ "ok": false, "id": "<id>", "error": "…" }` — write `job` to `jobs.<id>` in `source`'s layer file (create if new, overwrite if it exists). A new job's `id` is a fresh slug the phone derives from the label, uniquified against every visible job id so it never shadows another job's saved history; editing reuses the job's own id. An empty `id` is rejected. `job` is the full YAML body (same shape the desktop's buildJobPayload writes): `label`, optional `emoji`, `schedule` (`{ manual: true }` \| `{ every: "30m"\|"6h"\|"2d" }` — the interval floor is 5 minutes \| `{ at: "09:00", days?: [mon…] }`), optional `check`, optional `verify` (a shell command run after the run finishes, deciding whether it is reported as done or as needing a look; rejected on `action` jobs, which lpm hands off without waiting), optional `duplicate` (`true` for a plain copy with default options, or `{ mode?: "copy"\|"worktree", pullLatest?, reinstallDeps?, excludeUncommitted? }` — **write back every key you read**, since the body replaces the job's whole mapping), `run` (`{ action }` \| `{ cmd }` \| `{ prompt, agent?, model?, effort?, access?: "read" }`), and — global-layer jobs only — `projects` (the "runs in" list; `[]` = standalone, omitted = every project), and optional `machines` (the computers that may run it, best first: hostIds, `"this"` for this Mac, a paired computer's name, and `"any"` last for any other computer that's on; `[]` = every computer that has it). A body without `machines` keeps the job's own, and a new job without one runs on this Mac only. New jobs use `source: "global"`. Writes off the read loop; on success the desktop's Jobs views refresh and a `jobs-changed` push goes to phones. The scheduler validates on its next read, so a bad body surfaces as an invalid row, not an error here |
| `{ "t": "deleteJob", "id": "<id>", "source": "project"\|"repo"\|"global", "project": "<name>", "deleteCopies": bool }` | `{ "t": "deleteJob", "ok": true, "id": "<id>" }` / `{ "ok": false, "id": "<id>", "error": "…" }` — remove the job from `source`'s layer file and forget its saved state (run history, pause override); `deleteCopies` also tears down the duplicates its runs left behind. Writes off the read loop; refreshes desktop + pushes `jobs-changed` like `saveJob` |
| `{ "t": "terminals", "project": "<name>" }` | `{ "t": "terminals", "project": "<name>", "terminals": [Terminal…] }` — a project the Mac hasn't shown since lpm started has its saved tabs restored first (off screen), so the reply can take a few seconds |
| `{ "t": "slash", "id": "<termId>", "project": "<name>" }` | `{ "t": "slash", "id": "<termId>", "commands": [SlashCommand…] }` — slash-command autocomplete; empty unless the terminal runs a known AI CLI (the frontend registers each terminal's CLI, detected from its launch command) |
| `{ "t": "answers", "id": "<termId>", "project": "<name>", "limit": N, "reqId": <any> }` | `{ "t": "answers", "id": "<termId>", "ok": true, "answers": [{ "text": "…", "at": N\|null }…], "reqId": <any> }` / `{ …, "ok": false, "error": "…" }` — the terminal agent's most recent answers, **newest first**, as the raw markdown it wrote (read from its Claude Code or Codex transcript, the same text the desktop's copy pill copies). `at` is epoch ms, `null` when the record had no timestamp. `limit` defaults to 1 and is clamped to 1–20; the phone's copy key asks for 1, its earlier-answers sheet for 20. The phone names the terminal, never a session: the Mac maps it to the conversation the desktop's tab tree reported, and a terminal with none (a plain shell, a Codex session before its first hook, a peer-hosted or SSH tab) answers `ok: true` with an empty list. A reply carries at most about 1 MiB, dropping the oldest answers first; the newest always goes out whole. Runs on a worker thread, so replies may arrive out of order: `reqId` is echoed verbatim. Only when `features` has `"agentAnswers"` |
| `{ "t": "upload", "id": "<termId>", "data": "<base64 blob>", "mime": "image/jpeg", "name": "<original filename>"?, "reqId": <any>? }` | `{ "t": "upload", "id": "<termId>", "ok": true, "path": "<on-Mac path>", "reqId": <any>? }` / `{ "ok": false, "error": "…", "reqId": <any>? }` — saves the blob to a temp file on the Mac (scp'd first for a remote pane); the phone drops the path into the composer, which pastes it so an agent loads it. With `name` the file is saved under its **original basename** (uniquified in a fresh temp subdir) and **any** `mime` is accepted — arbitrary files, not just images. Without `name` (image-only callers, unchanged) the file is keyed by `mime` (default `image/png`) like before. Runs on a worker thread (base64 decode + fs write + possible scp), so a large upload never stalls this connection's keystrokes/resizes — replies may therefore arrive **out of order**. Pass `reqId` (string or number) and it is echoed verbatim so the phone correlates each reply to its request by id rather than FIFO (FIFO desyncs permanently if a reply is lost on a socket drop). Omit `reqId` (older phones) → the reply omits it too, unchanged |
| `{ "t": "uploadBegin", "id": "<termId>", "name": "<original filename>", "bytes": N, "reqId": <any> }` | `{ "t": "uploadBegin", "id": "<termId>", "ok": true, "uploadId": "<id>", "chunk": 1048576, "reqId": <any> }` / `{ …, "ok": false, "error": "…" }` — starts the **chunked attach**, for a file too big for one `upload` frame (the phone uses it for every video and Files pick when `features` has `"fileUpload"`). The Mac opens an empty file under the name's basename in a fresh temp folder; over 1 GiB is refused here, before any bytes. `chunk` is the piece size to send. The same state machine takes a file from another Mac (`peeruploadhost.rs`) |
| `{ "t": "uploadChunk", "id": "<termId>", "uploadId": "<id>", "offset": N, "b64": "<base64 piece>", "reqId": <any> }` | `{ "t": "uploadChunk", "id": "<termId>", "ok": true, "received": N, "reqId": <any> }` / `{ …, "ok": false, "error": "…" }` — appends one piece. Pieces must arrive **in order** (`offset` = bytes received so far) and the Mac answers each on its own thread, so send the next only after this reply. A piece out of order or past `bytes` is refused and nothing is written. An upload untouched for 10 minutes is deleted |
| `{ "t": "uploadDone", "id": "<termId>", "uploadId": "<id>", "reqId": <any> }` | `{ "t": "uploadDone", "id": "<termId>", "ok": true, "path": "<on-Mac path>", "reqId": <any> }` / `{ …, "ok": false, "error": "…" }` — closes the file and answers with its path, quoted for pasting exactly as `upload` quotes it (scp'd first for a remote pane, which can take a while). Refused while bytes are missing; the upload stays open so the rest can still be sent |
| `{ "t": "uploadAbort", "id": "<termId>", "uploadId": "<id>" }` | — (no reply) deletes the partial file. The phone sends it when it gives up on an upload, queued across a reconnect so the Mac still frees the space |
| `{ "t": "mentions", "project": "<name>" }` | `{ "t": "mentions", "project": "<name>", "entries": [{ path, dir, changed }…] }` — @-mention targets: the project's files/dirs (relative paths), with git working-tree changes flagged. Fetched once, filtered client-side |
| `{ "t": "history", "project": "<name>", "q": "<search>" }` | `{ "t": "history", "project": "<name>", "rows": [HistoryRow…] }` — recent sent prompts for the project (newest first), for recall |
| `{ "t": "historyAdd", "project": "<name>", "id": "<termId>", "label": "<tab>", "text": "…" }` | — records a prompt the phone sent into the shared message history |
| `{ "t": "status", "project": "<name>" }` | `{ "t": "status", "project": "<name>", "status": [StatusEntry…], "seen": [StatusEntry…] }` — `seen` (only when `features` has `"agentArchive"`) is the project's seen agents, the same list as its `seenEntries` (see [Seen and archived agents](#seen-and-archived-agents)) |
| `{ "t": "clearStatus", "project": "<name>", "paneId": "<terminal id>", "value": "Done"\|"Error" }` | — dismisses a finished agent status (the Activity screen's clear), acting on **every** entry on `paneId` whose value is `value`; two agents sharing one terminal therefore clear together, which is why the phone only offers it when the row is the pane's only holder of that value. The terminal screen also sends it, once per value, for the `Done` and `Error` its terminal shows when it opens and on the next touch while it is on top — the desktop's tab click — and leaves `Waiting` alone. While the Mac's **Keep finished agents until archived** is on (`features` has `"agentArchive"`), those entries are marked **seen** — they move from `statusEntries` to `seenEntries` — instead of removed; with it off, or on an older Mac, they are removed. No reply: on a change the Mac emits `status-changed`, which refreshes the desktop and every connected phone. A no-op when nothing matches |
| `{ "t": "archiveStatus", "project": "<name>", "keys": ["<status key>"…] }` | — archives agents: removes each key's `Done` or `Error` from `statusEntries`, or its entry from `seenEntries`. A `Running` or `Waiting` entry is left alone. No reply; `status-changed` follows a change. Only when `features` has `"agentArchive"` |
| `{ "t": "markStatusSeen", "project": "<name>", "keys": ["<status key>"…] }` | — marks agents seen without opening them: each key's `Done` or `Error` moves from `statusEntries` to `seenEntries`. No reply; `status-changed` follows a change. Only when `features` has `"agentArchive"` |
| `{ "t": "markStatusUnread", "project": "<name>", "keys": ["<status key>"…] }` | — takes seen agents back to new: each key's entry moves from `seenEntries` back to `statusEntries`, unchanged. No push notification is sent for them again. No reply; `status-changed` follows a change. Only when `features` has `"agentArchive"` |
| `{ "t": "sub", "id": "<termId>", "from": <streamOffset>? }` | `{ "t": "seed", "id": "<termId>", "cols": N, "rows": N, "data": "<recent scrollback>", "off": <streamOffset>, "reset": bool, "owner": ControlOwner\|null, "draft": { "text": "…", "rev": N }? }`, then a live stream of `o` frames. A terminal the Mac no longer has gets `exit` with `gone: true` instead of a seed. Subscribing also *claims* the terminal (see control ownership below); `owner` tells the phone whether it may render live or must show a "take control" placeholder. `cols`/`rows` are the PTY's current size, which can still be the previous owner's — an owning phone whose fitted size differs sends `resize` right after the seed. The optional `draft` carries the terminal composer's mirrored active-input text (see composer draft sync below); it is **present only** when a non-empty draft is stored, so on (re)open/reconnect the phone restores it — but only into an empty input, never clobbering a prompt in progress. **Resuming:** a phone that still has the terminal on screen (reconnect, unlock, a gap in `o` frames) sends `from` = the offset it last applied; when the Mac still holds that point the reply is `reset: false` and `data` is **only the missed slice**, appended to the live emulator. Otherwise (`from` omitted, or scrolled out of the ring) it is `reset: true`: reset the emulator and replay `data` as the whole screen. Prefer resuming — a replay only approximates the screen a running full-screen program believes it is drawing on, so its next incremental update lands on stale cells |
| `{ "t": "unsub", "id": "<termId>" }` | — (also stops presenting the terminal) |
| `{ "t": "claim", "id": "<termId>" }` | — (the "Take control" action) takes ownership of the terminal; the previous owner is pushed a `control` frame and flips to its own placeholder |
| `{ "t": "in", "id": "<termId>", "d": "ls\r" }` | — (keystrokes; see hex framing) |
| `{ "t": "resize", "id": "<termId>", "cols": N, "rows": N }` | — (see note) |
| `{ "t": "runAction", "project": "<name>", "action": "<actionName>", "inputValues": { "<key>": "<val>"… }, "confirmed": bool, "prompt"?: "<text>" }` | `{ "t": "runAction", "ok": true }` — relay for **terminal/command** actions: forwarded to the desktop's owner window, which runs the action in its normal terminal flow (needs the main window open). The phone now owns the inputs + confirm gauntlet, so it sends the collected `inputValues` and `confirmed: true` and the Mac runs the action **directly without re-prompting** (an omitted/`false` `confirmed` falls back to the Mac's own inputs/confirm dialogs). A non-empty `prompt` (only when `features` has `"actionPrompt"`) is submitted to the agent the action opens once it is ready, in place of the action's own `prompt` — see [Agent tabs and files](#agent-tabs-and-files). An item of a header split button or menu opens in its group's colour when it has none of its own. The new terminal appears on a subsequent `terminals` re-request |
| `{ "t": "runActionBackground", "project": "<name>", "action": "<actionName>", "inputValues": { "<key>": "<val>"… }, "runId": "<uuid>" }` | `{ "t": "runActionBackground", "ok": true }` / `{ "ok": false, "runId": "<uuid>", "error": "…" }` — runs a **non-terminal** action (type `background` or the default headless type) entirely in Rust on a worker thread, so it works **even with the Mac's main window closed**. The caller-minted `runId` keys the run for polling/cancel; output + status stream into the background registry (poll with `actionBgOutput`). Also emits the desktop's `action-bg-output` event so a live Mac window shows its toast |
| `{ "t": "actionBgOutput", "project": "<name>", "runId": "<uuid>" }` | `{ "t": "actionBgOutput", "ok": true, "found": bool, "runId": "<uuid>", "project": "<name>", "label": "<action>", "startedAt": <unix>, "text": "<accumulated output>", "running": bool, "success": bool, "error": "…" }` — one poll of a background run's live output + terminal status (the phone polls every ~2s while `running`, mirroring `jobLiveOutput`). `found:false` once the run has been reaped (finished runs are retained ~5 min) or never existed |
| `{ "t": "cancelActionBackground", "runId": "<uuid>" }` | `{ "t": "cancelActionBackground", "ok": true, "runId": "<uuid>" }` — reaps the run's process tree; a no-op if it already finished or is unknown |
| `{ "t": "backgroundRuns", "project": "<name>" }` | `{ "t": "backgroundRuns", "ok": true, "project": "<name>", "runs": [{ "runId", "label", "startedAt", "running", "success", "error" }…] }` — running plus recently-finished background runs for the project (newest first), so a reconnecting phone can re-attach to a run it started before relaunch |
| `{ "t": "newTerminal", "project": "<name>", "agent"?: "<agent id>", "model"?: "<value>", "effort"?: "<value>", "prompt"?: "<text>" }` | `{ "t": "newTerminal", "ok": true }` / `{ "ok": false, "project": "<name>", "error": "…" }` — same relay; opens a new tab in the project, behind whatever the Mac shows. Without `agent` (or with `""`) it is a plain terminal. With one (an `id` from `agentOptions`, only when `features` has `"agentLaunch"`) the tab starts that agent — see [Agent tabs and files](#agent-tabs-and-files). The new terminal appears on a subsequent `terminals` re-request |
| `{ "t": "closeTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "closeTerminal", "ok": true }` — owner-window relay; kills the terminal and removes its tab. Re-request `terminals` to refresh |
| `{ "t": "renameTerminal", "project": "<name>", "id": "<termId>", "label": "<new>" }` | `{ "t": "renameTerminal", "ok": true }` — relay; renames the desktop tab (a `terminals.json` write, no PTY op) |
| `{ "t": "pinTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "pinTerminal", "ok": true }` — relay; toggles the tab's pinned flag |
| `{ "t": "restartTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "restartTerminal", "ok": true }` — relay; runs a terminal whose process ended again in its own tab, as the desktop's **Restart** does: a fresh shell that resumes the tab's agent session, or reruns the command it was opened with. The tab keeps its name and place under a **new** id, which the next `terminals` push carries — follow it to the tab now in the old one's place. A terminal still running is left alone. Only when `features` has `"restartTerminal"` |
| `{ "t": "forkTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "forkTerminal", "ok": true }` — relay; the desktop's **Fork session**: a new tab beside this one continues its agent conversation while the original keeps running. The fork arrives on a later `terminals` push. Only for a terminal listed with `canFork`, and only when `features` has `"tabMenu"` |
| `{ "t": "forkTerminalCopy", "project": "<name>", "id": "<termId>" }` | `{ "t": "forkTerminalCopy", "ok": true }` — relay; the desktop's **Fork into copy**: makes one copy of the project (working tree as it is, nothing pulled) and continues the conversation in a tab there. The copy arrives on the projects list. Ask before sending it, as the desktop does — the Mac doesn't. Only for a terminal listed with `canForkCopy`, and only when `features` has `"tabMenu"` |
| `{ "t": "titleTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "titleTerminal", "ok": true }` — relay; the desktop's **Use conversation title**: the tab drops its manual name and follows its agent conversation's title again. Only for a terminal listed with `canTitle`, and only when `features` has `"tabMenu"` |
| `{ "t": "closeOtherTerminals", "project": "<name>", "id": "<termId>" }` | `{ "t": "closeOtherTerminals", "ok": true }` — relay; closes every other **unpinned** terminal of the project, in any of the desktop's panes, at once, and keeps `id`. Pinned tabs and the desktop's browser, files and other non-terminal tabs stay. Ask before sending it. Only when `features` has `"tabMenu"` |
| `{ "t": "duplicate", "name": "<name>", "count": N, "labels": ["<per-copy>"…], "groupName": "<folder>", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool, "runMode": "none"\|"action"\|"command", "action": "<actionName>", "command": "<cmd>", "prompt": "<text>" }` | Streams `{ "t": "duplicateProgress", "done": i, "total": N, "name": "<copy>" }` per copy as they're created, then a final `{ "t": "duplicate", "ok": true, "name": "<first>", "names": [...], "warning": "…"? }` / `{ "ok": false, "error": "…" }` — clones the project, mirroring the desktop modal. Rust creates each copy directly (works with no main window) with `labels[i]` as copy i's display label (blank → auto-named); `groupName` groups them under a sidebar folder (replicating the desktop's applySidebarLayout — writes groups.json + settings.json). The three git toggles default false (phone seeds `pullLatest` true from settings). **runMode** `action`/`command`: after creation, each copy's task is relayed to the main window (`remote-run-task`) which runs it in the copy's terminal (types the command, seeds the AI `prompt`) — **that step needs the desktop main window open**; if it's closed, copies are still made and the reply carries a `warning`. Copies also reach the phone via `projects-changed`. `name` = first copy; `names` = all created |
| `{ "t": "duplicateDefaults" }` | `{ "t": "duplicateDefaults", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool }` — the desktop's persisted duplicate-modal toggle defaults (from `settings.json`), so the phone's duplicate modal opens with the same initial state. Fallbacks mirror the desktop: `excludeUncommitted`/`reinstallDeps` default false, `pullLatest` defaults true |
| `{ "t": "remove", "name": "<name>" }` | `{ "t": "remove", "ok": true }` / `{ "ok": false, "error": "…" }` — tears down the project and, for a duplicate, deletes its folder from disk. Refuses an original that still has duplicates referencing it. The phone only offers this for duplicates |
| `{ "t": "renameProject", "project": "<name>", "name": "<new label>" }` | `{ "t": "renameProject", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — sets the project's display label, reusing the desktop's `set_project_label` (writes the project's own YAML; an empty `name` clears the label so it falls back to the project id). Emits the desktop's `projects-changed`, so the Mac's own window and every paired phone refresh the list |
| `{ "t": "setWorkStatus", "project": "<name>", "status": { "state": "in_progress"\|"blocked"\|"done"\|"custom", "label": "…", "emoji": "…", "note": "…" }\|null }` | `{ "t": "setWorkStatus", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — sets the person-set work status on a project (originals and duplicates alike), reusing the desktop's `set_work_status` (writes the project's own YAML under `~/.lpm/projects/`). A `null` or absent `status` clears it. `label`/`emoji` describe a `custom` status and are dropped for a built-in one; a `custom` with no `label` is rejected. `since` is stamped by the Mac: entering a different status restarts it, editing only the note or emoji keeps it. Emits the desktop's `projects-changed`, so the Mac's own window and every paired phone refresh the list |
| `{ "t": "setAutoPull", "project": "<name>", "value": true\|false\|null }` | `{ "t": "setAutoPull", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — sets the project's own auto pull choice (originals, duplicates and worktrees alike), writing `autoPull` in the project's own YAML under `~/.lpm/projects/`. A `null` or absent `value` removes the key, so the project follows its parent or the Mac's `autoPullMode` again. Emits the desktop's `projects-changed`, so the Mac's own window and every paired phone refresh the list |
| `{ "t": "claudeAccounts" }` | `{ "t": "claudeAccounts", "ok": true, "accounts": [ClaudeAccount…], "switching": ClaudeSwitching }` — what the desktop's project menu › Claude account submenu reads: every Claude login the Mac knows, the main login (`id: "default"`) first and then each account added in Settings › Accounts & usage › Claude, plus where automatic switching stands (see ClaudeAccount and ClaudeSwitching below). The phone shows its Claude Account menu only once an account beyond the main login exists, and never for an SSH project, whose agents run under the far host's login. Reading it opens every project file and each account's login, so the reply arrives on the out-queue. Usage per account comes from `limits` (keys `claude:<id>`) |
| `{ "t": "setClaudeAccount", "project": "<name>", "choice": { "kind": "parent" } \| { "kind": "main" } \| { "kind": "pin", "id": "<id>" } \| { "kind": "list", "ids": ["<id>"…] }, "confirm"?: ["<id>"…] }` | `{ "t": "setClaudeAccount", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — sets which login new Claude sessions in the project use, reusing the desktop's `set_claude_account_choice`, which writes `claudeAccount` and `claudeAccounts` in the project's own YAML together: `parent` removes both so a copy follows its parent again; `main` removes both on an original and writes `claudeAccounts: []` on a copy; `pin` writes `claudeAccount` (`""` is the main login only); `list` writes 1 to `maxMembers` ids, in order, to take turns on. Sessions already running keep their login. `confirm` names accounts the person just confirmed are theirs alone, recorded (with consent to the current notice) before the choice is written, as the desktop's confirmation dialog does; the phone asks before a list gains a signed-in account whose `confirmed` is false. Emits the desktop's `projects-changed`. Out-queue |
| `{ "t": "sidebarCreateFolder", "name": "<folder>" }` | `{ "t": "sidebarCreateFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — creates an empty sidebar folder and appends it to the top-level order. The reply carries the **updated** sidebar (same shape as `sidebar`) so the requesting phone re-renders; the desktop learns of the change via the emitted `projects-changed` (as the duplicate flow's group write does). See the sidebar folder ops note below |
| `{ "t": "sidebarRenameFolder", "name": "<folder>", "newName": "<new>" }` | `{ "t": "sidebarRenameFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — renames the folder matched by `name` (exact, then case-insensitive) |
| `{ "t": "sidebarDeleteFolder", "name": "<folder>" }` | `{ "t": "sidebarDeleteFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — deletes the folder; its member projects spill back into the top-level order at the folder's former slot (they are **not** removed) |
| `{ "t": "sidebarMoveProject", "project": "<name>", "folder": "<folder>"\|null }` | `{ "t": "sidebarMoveProject", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — moves a project into the folder named `folder` (matched by name, **created** if it doesn't exist — the "New folder…" affordance), detaching it from wherever it currently sits; a `null`/absent `folder` moves it back out to the top level (ungrouped) |
| `{ "t": "readFile", "project": "<name>", "path": "<relative path>" }` | `{ "t": "file", "project": "<name>", "path": "<path>", "ok": true, "content": "<utf-8 text>", "truncated": bool }` / `{ "ok": false, "error": "…" }` — reads a project file for the phone's file viewer. The path is resolved through symlinks and **confined to the project root** (a `..` or symlink escaping the root is rejected), the read is capped at ~1 MB (`truncated: true` when the file is longer), and **non-UTF-8 (binary) content is refused** with an error. fs work runs on a worker thread, so the reply arrives **asynchronously** via the out-queue |
| `{ "t": "fileChunk", "project": "<name>", "path": "<abs \| ~/… \| relative path>", "offset": N, "length": N, "reqId": <any> }` | `{ "t": "fileChunk", "ok": true, "reqId": <any>, "path": "<resolved abs path>", "size": N, "mtime": <ms since epoch>, "offset": N, "data": "<base64>" }` / `{ "t": "fileChunk", "ok": false, "reqId": <any>, "missing": bool, "error": "…" }` — one byte range of **any** file, for the phone's file preview (a path tapped in a terminal, or the eye button in the @-mention list). `~/…` and absolute paths resolve on their own; a relative path resolves against `project`'s root. **Not** confined to the project (unlike `readFile`) — a paired phone already drives a shell on this machine. `length` is capped at 1 MiB; a range past the end returns empty `data`. Every reply carries the file's current `size` + `mtime`, so the phone can tell the file changed between ranges and start over. `missing: true` marks a path that doesn't exist: a path read off the terminal can be a guess (a long path the agent CLI line-wrapped, rejoined), so the phone then tries its next reading. SSH projects are refused (their files are on another machine). Each range reads on its own worker thread, so replies arrive **out of order** — the phone keeps several ranges in flight, matches them by `reqId`, and re-asks a range whose reply was lost |
| `{ "t": "start", "name": "<name>", "profile": "" }` | `{ "t": "start", "ok": true }` / `{ "ok": false, "error": "…" }`. The optional `profile` starts exactly that profile's services (empty = the project's active/default set); the phone offers a "Start with profile" variant when `ProjectInfo.profiles` is non-empty |
| `{ "t": "stop", "name": "<name>" }` | `{ "t": "stop", "ok": … }` |
| `{ "t": "toggleService", "name": "<name>", "service": "<svc>" }` | `{ "t": "toggleService", "ok": … }` |
| `{ "t": "restartService", "name": "<name>", "service": "<svc>" }` | `{ "t": "restartService", "ok": true }` / `{ "ok": false, "error": "…" }` — stops the service's process (if it still runs) and starts it again in its pane; also how a service that ended (`exited` in `services`) is brought back. Async (worker): a restart waits up to ~3s for the old process. Older desktops never answer it |
| `{ "t": "stopService", "name": "<name>", "service": "<svc>" }` | `{ "t": "stopService", "ok": true }` / `{ "ok": false, "error": "…" }` — stops one service whatever its state; unlike `toggleService`, never starts one that ended. Async (worker). Older desktops never answer it |
| `{ "t": "ping" }` | `{ "t": "pong" }` — an app-level round trip the server answers; the iOS app doesn't use it (its keepalive is a **protocol-level** WebSocket Ping every ~20s, `URLSessionWebSocketTask.sendPing`, answered by tungstenite automatically). Liveness on the server keys off **any successful read** — a data frame, the phone's Ping, or a Pong: after ~30s of read silence the Mac sends a protocol-level Ping of its own (URLSession answers it with no app code involved), and after ~90s of silence it drops the connection — so a phone that vanished without a TCP reset can't leave a zombie session holding terminal control |

### Git review & ship

Review a project's working-tree changes and ship them (pull, push, fetch, switch
branch, commit, open a PR, discard) from the phone — mirroring the desktop's
project Git submenu. Every reply echoes the `project` it was addressed to, so a
reply can be matched to its request even with several in flight. The **local**
ops (`gitDiff`, `gitCommit`, `gitBranches`, `gitCheckout`, `gitDiscardAll`) reply
inline; the **worker** ops — the `git` snapshot and `gitDiffs` batch (a status
scan / many-file diff can be slow on a big repo), the **network / AI** ops
(`gitPull`, `gitPush`, `gitFetch`, `gitAutoPullUndo`, `gitCreatePr`, and the AI generators) — run on
a worker thread on the desktop, so their reply arrives asynchronously (the
project is still resolved inline first, so a bad project fails fast). There is no
separate ack, the phone just waits for the typed reply below.

Pull, push, and fetch take no flags from the phone: the desktop applies the
user's persisted git options (`gitPull` `{strategy, autostash, noVerify}`,
`gitPush` `{mode, noVerify, tags}`, `gitFetch` `{all, prune, pruneTags, tags}`),
identical to the desktop submenu, so behavior stays consistent across surfaces.

| Request | Reply |
|---|---|
| `{ "t": "git", "project": "<name>" }` | `{ "t": "git", "project": "<name>", "ok": true, "isRepo": bool, "branch": "…", "detached": bool, "hasUpstream": bool, "ahead": N, "behind": N, "defaultBranch": "…", "ghCli": bool, "files": [{ path, status, staged, stamp }…], "linesAdded": N, "linesRemoved": N, "autoPulled"?: { "count": N, "branch": "…", "from": "<sha>", "to": "<sha>", "at": unix MILLIS }, "aheadOfDefault"?: N }` — the project's git status + changed files in one shot. `aheadOfDefault` is present only for a branch with no upstream that isn't the default branch (a fresh worktree's): its commits not on `defaultBranch`, the work that exists only there. `status` ∈ `added`\|`deleted`\|`renamed`\|`modified`\|`untracked`\|`conflicted` (an unmerged path, left by a merge, rebase or pull with conflicts). `stamp` is an **opaque change token** for the file's working-tree content: if a file's `stamp` is unchanged between two snapshots, its diff is unchanged and needn't be refetched (skip the `gitDiff` round-trip); treat an unknown or absent `stamp` as changed (older servers omit it, so always refetch then). `ghCli` reports whether the `gh` CLI is available (gates the "Open PR" affordance). `linesAdded`/`linesRemoved` total the lines the changed files add and remove, counted as the review screen diffs them (a tracked file against HEAD, an untracked file as wholly added, a binary file as nothing); the terminal header shows them beside the file count. Older Macs omit them, and the phone then shows the file count alone. `autoPulled` describes the last time lpm fast-forwarded the project by itself (`count` commits onto `branch`, HEAD moving from `from` to `to`, both 7-character short SHAs) and is present only while that auto pull can still be undone with `gitAutoPullUndo`. When the project isn't a git repo: `ok:true, isRepo:false` with empty/zero fields. On a bad project: `{ "ok": false, "error": "…" }`. Async (worker) |
| `{ "t": "gitDiff", "project": "<name>", "path": "<file>" }` | `{ "t": "gitDiff", "project": "<name>", "path": "<file>", "ok": true, "diff": "<unified diff>", "binary": bool, "truncated": bool }` — the unified diff (HEAD vs working tree) for one file, including untracked files. A binary file returns `binary:true, diff:""`. The diff is capped at ~400 KB, truncated at a line boundary with `truncated:true` when it exceeds that. Errors → `{ "ok": false, "error": "…" }`. Inline |
| `{ "t": "gitDiffs", "project": "<name>", "paths": ["<file>"…] }` | `{ "t": "gitDiffs", "project": "<name>", "ok": true, "files": [{ "path": "<file>", "diff": "<unified diff>", "binary": bool, "truncated": bool }…] }` — **batch** form of `gitDiff`: one `files` entry per requested path (same order), each with the same `binary`/`truncated`/~400 KB-cap semantics as `gitDiff`. Fetched from a single `git diff HEAD -- <paths>` split per file (plus a per-file diff for untracked paths), so N files cost one round trip instead of N. A path whose diff couldn't be produced degrades to an entry `{ "path": "<file>", "error": "…" }` (no `diff`) rather than sinking the batch — the phone routes such an entry through its per-file error state. On a bad project the whole reply is `{ "ok": false, "error": "…" }`. Async (worker) |
| `{ "t": "gitCommit", "project": "<name>", "message": "…", "files": ["<path>"…] }` | `{ "t": "gitCommit", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — stages exactly the given files (resetting the index first) and commits them with `message` |
| `{ "t": "gitPush", "project": "<name>" }` | `{ "t": "gitPush", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — `git push -u origin HEAD`, applying the persisted `gitPush` flags (`--force-with-lease` when `mode=="force-with-lease"`, `--no-verify`, `--tags`). Async (network) |
| `{ "t": "gitPull", "project": "<name>" }` | `{ "t": "gitPull", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — pulls with the persisted `gitPull` strategy (`ff` default \| `ff-only` \| `rebase`) and flags (`--autostash`, `--no-verify`). Async (network) |
| `{ "t": "gitFetch", "project": "<name>" }` | `{ "t": "gitFetch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — fetches with the persisted `gitFetch` flags (`--all`, `--prune` default on; `--prune-tags`, `--tags` default off). Async (network) |
| `{ "t": "gitAutoPullUndo", "project": "<name>" }` | `{ "t": "gitAutoPullUndo", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — undoes the project's last auto pull (the one `autoPulled` describes) with `git reset --keep <from>`. Auto pull then skips those commits until origin moves again. The phone reloads the `git` snapshot on success. Async (worker) |
| `{ "t": "gitBranches", "project": "<name>" }` | `{ "t": "gitBranches", "project": "<name>", "ok": true, "current": "<branch>", "branches": [{ name, committerDate, remote? }…] }` / `{ "ok": false, "error": "…" }` — the branch list for the "Switch branch" picker (local + remote, newest first). `remote` is **omitted** for a local branch (present only for a remote-tracking one). `current` is the checked-out branch. Inline |
| `{ "t": "gitCheckout", "project": "<name>", "branch": "<name>", "remote": "<remote>" }` | `{ "t": "gitCheckout", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — checks out `branch`; pass the `remote` from a `gitBranches` entry to create a local tracking branch (empty `remote` for a plain local checkout). Inline |
| `{ "t": "gitCreateBranch", "project": "<name>", "name": "<branch>", "from"?: "<branch>" }` | `{ "t": "gitCreateBranch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — creates a new branch off HEAD and checks it out (reuses the desktop's `create_branch`: `git branch` + checkout, falling back to `git switch -c`). Optional `from` starts it at that branch instead (a `gitBranches` name, or `<remote>/<name>` for a remote one; the new branch tracks nothing); older Macs ignore it and branch off HEAD. Rejects an empty or already-existing name. Inline; on success the phone re-requests `gitBranches` + `git` so the new current branch shows |
| `{ "t": "gitDiscardAll", "project": "<name>" }` | `{ "t": "gitDiscardAll", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — discards all working-tree changes (reset + clean). Inline |
| `{ "t": "gitWatch", "project": "<name>" }` | `{ "t": "gitWatch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — starts watching the project's working tree **for this connection**; while watched, the desktop sends a debounced `git-changed` push (below) on each burst of file changes so the review screen self-refreshes. Watching an already-watched project is a no-op (still `ok:true`). The watch is scoped to the connection and is dropped on `gitUnwatch`, disconnect, and device revocation. Inline |
| `{ "t": "gitUnwatch", "project": "<name>" }` | `{ "t": "gitUnwatch", "project": "<name>", "ok": true }` — stops watching the project for this connection (no-op if it wasn't watched). Inline |
| `{ "t": "gitGenMessage", "project": "<name>", "files": ["<path>"…] }` | `{ "t": "gitGenMessage", "project": "<name>", "ok": true, "message": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a commit message from the diff of the given files. Async (AI). Uses the desktop's persisted AI settings (`aiCli` default `claude`, `aiModel`, `aiEffort`, `aiFast`) |
| `{ "t": "gitGenPr", "project": "<name>" }` | `{ "t": "gitGenPr", "project": "<name>", "ok": true, "title": "…", "body": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a PR title and description for the current branch vs the default branch. Async (AI); same AI settings as above |
| `{ "t": "gitCreatePr", "project": "<name>", "title": "…", "body": "…", "draft"?: bool }` | `{ "t": "gitCreatePr", "project": "<name>", "ok": true, "url": "<pr url>" }` / `{ "ok": false, "error": "…" }` — pushes the current branch and opens a PR via the `gh` CLI against the default branch, returning its URL. Optional `draft: true` opens it as a draft (`gh pr create --draft`); omitted means ready for review, and older Macs ignore it. Async (network) |

#### Auto Commit, Auto Commit and Push, Auto Create PR

The desktop's AI shortcuts, run **by the desktop end to end**: a run chains
several AI generations and outlives a locked phone's socket, so the desktop keeps
the latest state per project and **broadcasts** every change as a `gitAuto`
frame to every paired phone (not just the one that asked). A phone that
reconnects sends `gitAutoState` for any run it still shows as running. One run
per project: starting while one is running answers with that run instead.

| Request | Reply |
|---|---|
| `{ "t": "gitAuto", "project": "<name>", "kind": "commit"\|"commitPush"\|"pr", "nonce": "<phone-chosen id>" }` | `gitAuto` frames (below), the first right away with every step `pending`. `commit` = AI message, then commit every changed file; `commitPush` = the same, then push (rebasing onto new remote commits when origin moved on, as desktop's auto commit & push does); `pr` = AI branch name + branch (only when on the default branch or detached), commit, push, AI title + description, `gh pr create` against the default branch. Refused up front when there's nothing to submit, or when the branch already has an open PR (`url` set to it). Bad project / unknown kind → `{ "t": "gitAuto", "project": "<name>", "ok": false, "error": "…" }`. AI settings as `gitGenMessage` |
| `{ "t": "gitAutoState", "project": "<name>" }` | One `gitAuto` frame with the project's latest run, or `"run": null` when the desktop holds none (it restarted). Async |
| `{ "t": "gitAutoCancel", "project": "<name>" }` | No direct reply: the run's next `gitAuto` frame has `canceling: true`, then `phase: "canceled"`. Kills an AI generation in flight; a git step already running (commit, push, `gh`) finishes first, and the run stops before the next step |
| `{ "t": "gitAutoSwitchBase", "project": "<name>", "base": "<branch>" }` | `{ "t": "gitAutoSwitchBase", "project": "<name>", "ok": true, "base": "<branch>", "pullError"?: "…" }` / `{ "ok": false, "error": "…" }` — after a PR lands: check out `base`, then pull it with the persisted `gitPull` options. A failed pull still counts as switched and says why in `pullError`. Async |

`gitAuto` frame: `{ "t": "gitAuto", "project": "<name>", "ok": true, "run": GitAutoRun|null }`, where
`GitAutoRun` is `{ runId, nonce?, kind, phase: "running"|"done"|"failed"|"canceled", canceling, steps: [{ id, status, detail? }…], error?, message?, rebased, url?, title?, branch?, base? }`.
Always the whole state, never a delta; drop a frame whose `runId` is lower than the
one shown. `nonce` echoes the start that created the run: a phone waiting on its own
start treats a *finished* run with another nonce as the project's previous run
(its start never arrived), while a *running* one is the run it re-attached to. Step `id`s in order: `commit` (+ `push`) for the commit kinds, `branch`,
`commit`, `push`, `pr` for `pr`. `status` ∈ `pending`|`running`|`done`|`failed`|`skipped`;
`detail` is what a running step is doing, what a done step produced (branch name,
the commit's first line, `origin/<branch>`, the PR title), or why it was skipped.
Result fields fill in as their step lands: `message` (commit first line) and
`rebased` for the commit kinds; `url`, `title`, `branch`, `base` for `pr`.

### Composer parity (AI actions, transform, service logs, history)

Bring the mobile composer to parity with the desktop composer: the user's AI
rewrite actions, running those rewrites headlessly (with variants), service log
capture, and the full message-history surface (paging, favorites, folders,
drafts). The AI/subprocess ops (`transform`, `services`, `serviceLogs`) run on a
worker thread and reply asynchronously through the client out-queue, like the git
AI generators; the history ops are local SQLite and reply inline.

| Request | Reply |
|---|---|
| `{ "t": "composerDraft", "id": "<termId>", "text": "…" }` | — (no direct reply) mirrors the phone's composer active-input text to the Mac. The Mac stores it keyed by `termId`, then **broadcasts** it to every client — including the desktop composer — as `{ "t": "composerDraft", "id": "<termId>", "text": "…", "rev": N, "origin": "<sender deviceId>" }` (see composer draft sync below). Fire-and-forget: send it debounced on each edit; a dropped frame is superseded by the next edit or the `seed` on reconnect |
| `{ "t": "composerActions" }` | `{ "t": "composerActions", "actions": [{ id, icon, label, instruction }…] }` — the user's **enabled** composer AI actions from `~/.lpm/composer-actions.json`. When that file is absent, the two seeded defaults (`improve`, `concise`) are returned, matching what the desktop shows on a fresh install. `id` is only a stable client-side key (dedup/selection) — it is **not** sent on the wire. To run an action, the phone sends its `instruction` **text** as `transform`'s `instruction` field, exactly like the free-form "Ask AI to rewrite…" path; the server has no action registry and never resolves an id |
| `{ "t": "transform", "reqId": <any>, "project": "<name>", "instruction": "…", "text": "…", "variants": N }` | Streams `{ "t": "transform", "reqId": <any>, "idx": i, "ok": true, "text": "<rewrite>" }` / `{ "ok": false, "error": "…" }` per variant as it settles, then a final `{ "t": "transformDone", "reqId": <any>, "ok": bool }`. `reqId` is echoed verbatim (string or number) so the phone matches replies to the request. `variants` is clamped to 1..=5 and runs that many rewrites in parallel; for `variants > 1` each run gets a diversity suffix so the picker isn't near-identical outputs. A failed variant replies `ok:false` but doesn't fail the batch — `transformDone.ok` is true if **any** variant succeeded. AI params (cli/model/effort/fast) come from the desktop's persisted settings (`aiCli` default `claude`, `aiModel`, `aiEffort`, `aiFast`), the same source the git AI generators use. A bad `project` replies one `transform` `ok:false` then `transformDone ok:false` |
| `{ "t": "services", "project": "<name>" }` | `{ "t": "services", "project": "<name>", "ok": true, "running": bool, "services": [{ name, paneIndex, running, cmd, port }…] }` / `{ "ok": false, "error": "…" }` — service discovery for the logs viewer. When the project is running, each running service carries its `paneIndex` (the index to pass to `serviceLogs`) and `running:true`, in pane order; when stopped, every declared service is listed with `paneIndex: null` and `running:false`. A service whose process ended while the project runs keeps its `paneIndex` (its logs are still there) with `running:false`, `exited:true` and `exitCode` (null when the shell couldn't say). `cmd`/`port` are the service's command and label port |
| `{ "t": "serviceLogs", "project": "<name>", "paneIndex": N, "lines": N }` | `{ "t": "serviceLogs", "project": "<name>", "paneIndex": N, "ok": true, "text": "<recent pane output>" }` / `{ "ok": false, "error": "…" }` — captures a running service pane's recent output (tmux capture). `lines` is capped at 200. `project`/`paneIndex` are echoed for matching. Discover valid `paneIndex` values via `services` |
| `{ "t": "serviceLogsWatch", "project": "<name>", "paneIndex": N }` | Pushes `serviceLogs` frames (the same shape as the reply above, 200 lines) for that pane: one at once, then one whenever its output changes, checked every 500 ms like the desktop's logs pane — nothing while it is quiet. A pane that can't be read pushes `ok: false` once, until it can again. Watching the same pane again restarts the watch (and its immediate push). The watch belongs to the connection: it ends on `serviceLogsUnwatch` or when the socket closes, so the phone sends it again after a reconnect. Only when `features` has `"serviceLogsWatch"`; otherwise poll `serviceLogs` |
| `{ "t": "serviceLogsUnwatch", "project": "<name>", "paneIndex": N }` | — (no reply) stops that pane's `serviceLogsWatch` |
| `{ "t": "historyQuery", "project": "<name>"?, "search": "…"?, "favoritesOnly": bool?, "folder": "<folderId>"?, "before": { "at": N, "seq": N, "machine": "<slug>"? }? }` | `{ "t": "historyQuery", "items": [{ id, text, images, timestamp, favorite, folder, kind, project, at, seq, machine?, machineName? }…], "hasMore": bool }` — keyset-paginated history (page size 60): the Mac's own merged with every connected paired computer's (+ above your projects → Another computer or Server), newest first, so a prompt typed on one computer can be picked on another. `project` scopes to that project — under that name on any computer (omit/empty = all projects). `favoritesOnly` or `folder` selects a collection (favorites wins if both set); a folder is the Mac's own, so a folder's page lists only its rows. `before` is the previous page's **last item's** `{ at, seq, machine }` — pass it to fetch the next page; omit for the first page. `kind` is `"sent"` or `"draft"`; `folder` is the folder id or null; `project` is the project's name without any paired computer's marker; `timestamp`/`at` are unix millis (`at` + `seq` + `machine` form the cursor). `machine` (the paired computer's slug) and `machineName` (its name, for display) are set only on a row typed on another computer: its `id` is `peer-{slug}-{id}`, and `historyToggleFavorite`/`historyDelete` with it are carried out on that computer, while `historySetFolder` refuses it (`ok: false`). `hasMore` is true when more rows exist beyond this page |
| `{ "t": "historySaveDraft", "message": "<text>", "project": "<name>"?, "id": "<termId>"?, "label": "<tab>"?, "images": { "<token>": "<path>" }? }` | `{ "t": "historySaveDraft", "ok": true }` — saves the composer text as an unsent draft in shared history (badged as a draft, spared by "clear history"). `message` is the draft text (an object with a `text` field is also accepted); the rest is optional context |
| `{ "t": "historyToggleFavorite", "id": "<msgId>" }` | `{ "t": "historyToggleFavorite", "id": "<msgId>", "ok": true, "favorite": bool }` / `{ "ok": false, "error": "…" }` — flips a message's favorite flag and returns the new state |
| `{ "t": "historySetFolder", "id": "<msgId>", "folder": "<folderId>"? }` | `{ "t": "historySetFolder", "ok": true }` / `{ "ok": false, "error": "…" }` — moves a message into a folder; omit `folder` to remove it from its folder |
| `{ "t": "historyDelete", "id": "<msgId>" }` | `{ "t": "historyDelete", "ok": true }` / `{ "ok": false, "error": "…" }` — deletes a message from history |
| `{ "t": "historyFolders" }` | `{ "t": "historyFolders", "folders": [{ id, name, count }…] }` — the message folders (name-sorted) with per-folder message counts |
| `{ "t": "historyCreateFolder", "name": "<name>" }` | `{ "t": "historyCreateFolder", "ok": true, "folder": { id, name, count } }` / `{ "ok": false, "error": "…" }` — creates a folder and returns it |
| `{ "t": "historyDeleteFolder", "id": "<folderId>", "name": "<name>"? }` | `{ "t": "historyDeleteFolder", "ok": true }` / `{ "ok": false, "error": "…" }` — deletes a folder (its messages are un-filed, not deleted). Pass the folder `id`, or a `name` which is resolved to the matching folder's id |

The pre-existing `{ "t": "history", "project", "q" }` / `{ "t": "historyAdd", … }`
messages are unchanged — `historyQuery` is the richer superset for the paged
history screen, while `history` remains the simple project-scoped recall list
(it merges in connected paired computers' rows the same way).

### Add / import / clone projects

Create projects from the phone: a new empty folder, an existing folder on the
Mac, a git clone, or an SSH (remote) project — mirroring the desktop's Add
Project flow. The folder browser (`listDirs`) and SSH host list (`listSshHosts`)
feed the pickers. `createProject`/`createSshProject` write a config file and
finish quickly, so they reply **inline**; `cloneProject` blocks on the network,
so it runs on a **worker thread** and its reply arrives **asynchronously** via
the out-queue (arm a longer, ~120s, timeout for it). Each successful creation
emits the desktop's `projects-changed`, so the Mac window and every paired phone
refresh their project list.

| Request | Reply |
|---|---|
| `{ "t": "listDirs", "path": "<abs path>" }` | `{ "t": "listDirs", "ok": true, "path": "<canonical>", "parent": "<abs>"\|null, "dirs": ["<name>"…] }` / `{ "ok": false, "error": "…" }` — one level of the Mac's filesystem for the folder picker. An empty `path`, `~`, or `~/…` resolves to `$HOME`; any other value is an absolute path. `dirs` are the immediate child directory names (sorted, case-insensitive; dot-dirs skipped); `parent` is null at the filesystem root. Inline (runs off the UI thread on the Mac) |
| `{ "t": "listSshHosts" }` | `{ "t": "listSshHosts", "ok": true, "hosts": [SshHost…] }` / `{ "ok": false, "error": "…" }` — the Mac's `~/.ssh/config` Host aliases (non-wildcard, `Include`s followed), for the Add-SSH-project picker. Inline |
| `{ "t": "createProject", "name": "<name>", "root": "<abs or ~ path>" }` | `{ "t": "createProject", "ok": true, "name": "<landed name>", "existing": false, "services": ["web", "api"] }` / `{ "ok": false, "name": "<name>", "error": "…" }` — creates the project `name` rooted at `root`, creating the folder if missing (so it works for both a new project and importing an existing folder). The services are detected from the folder's own manifests (package.json scripts, Procfile, manage.py, Gemfile, go.mod, Cargo.toml, compose files, workspace members and conventional subfolders such as `backend/` or `apps/*`); `services` lists the names written, and is empty when nothing was found and the placeholder `dev` service was seeded instead. `name` is only a wish: when it is already taken (possibly by a project shown under another label) the project lands as `<name>-2`, `<name>-3`, …, and the reply's `name` is the one it landed under. When `root` is already a project's root, nothing is written and the reply carries that project's `name` with `existing: true`. Rejects an invalid name. Inline; emits `projects-changed` |
| `{ "t": "createSshProject", "name": "<name>", "ssh": { "host": "<host>", "user": "<user>", "port": N, "key": "<key path>", "dir": "<remote dir>" } }` | `{ "t": "createSshProject", "ok": true, "name": "<name>" }` / `{ "ok": false, "name": "<name>", "error": "…" }` — creates a remote (SSH) project. `host` + `user` are required; `port` `0`/omitted means default 22; `key`/`dir` are optional. Seeds a `shell` service. Inline; emits `projects-changed` |
| `{ "t": "cloneProject", "name": "<name>", "url": "<git url>", "branch": "<branch>", "destParent": "<abs parent dir>" }` | `{ "t": "cloneProject", "ok": true, "name": "<name>", "services": ["web"] }` / `{ "ok": false, "name": "<name>", "error": "…" }` — `git clone`s `url` (optionally `--branch <branch>`, empty = default branch) into `destParent/<name>` and registers the project, with its services detected from the fresh checkout exactly as `createProject` does (`services` is empty when it got the placeholder). Validates synchronously (bad name / URL / branch / missing-or-unwritable parent fail fast), then the network clone runs on a **worker thread**; the reply arrives **asynchronously** and the friendly clone error (auth, not-found, offline, …) is surfaced in `error`. Emits `projects-changed` on success. Because a clone can be slow, arm a **~120s** timeout, not the usual ~20s |

### Config editing (services, profiles, actions, raw YAML)

Edit a project's config from the phone across its three layers — `project` (the
registry file `~/.lpm/projects/<name>.yml`, or the parent's for a duplicate),
`repo` (`<root>/.lpm.yml`), and `global` (`~/.lpm/global.yml`). Two editing
styles:

- **Raw YAML** (`readConfig`/`saveConfig`) round-trips a layer's **exact text**,
  so **comments are preserved**. `readConfig` is a fast inline read;
  `saveConfig` writes on a worker thread (async reply) through the same routing
  the desktop uses (a duplicate writes to its parent's file; a project-layer
  rename moves the file). `readConfig` for the `repo` layer of an SSH/rootless
  project returns `available:false` (there is no local `.lpm.yml`).
- **Structured edits** (`serviceBody`/`actionBody` reads + `saveService`/
  `deleteService`/`saveProfile`/`deleteProfile`/`saveAction`/`deleteAction`
  writes) seed and mutate individual entries through `serde_yaml`. **DATA is
  preserved but comments reflow** — the same accepted tradeoff as `saveJob`. An
  edit lands in the topmost layer that **owns** the entry; a new entry is created
  in the `project` layer. The read verbs are inline; every write verb runs on a
  **worker thread**, replies **asynchronously** via the out-queue, and emits
  `projects-changed` on success. (Profiles need no read verb — the seed comes
  from `ProjectInfo.profiles` already in the projects push.)

| Request | Reply |
|---|---|
| `{ "t": "readConfig", "project": "<name>", "layer": "project"\|"repo"\|"global" }` | `{ "t": "readConfig", "ok": true, "project": "<name>", "layer": "<layer>", "content": "<raw yaml>", "available": bool }` / `{ "ok": false, "project": "<name>", "layer": "<layer>", "error": "…" }` — the layer's exact text (a missing file reads as `""`, `available:true`). `available:false` (with `content:""`) means the layer doesn't apply here — the `repo` layer of an SSH/rootless project. Inline |
| `{ "t": "saveConfig", "project": "<name>", "layer": "project"\|"repo"\|"global", "content": "<raw yaml>" }` | `{ "t": "saveConfig", "ok": true, "project": "<name>", "layer": "<layer>", "name": "<possibly-renamed>" }` / `{ "ok": false, "project": "<name>", "layer": "<layer>", "name": "<name>", "error": "…" }` — writes the exact text back (**comments preserved**). For the `project` layer, changing the top-level `name:` renames the project and `name` echoes the new project id (blocked while duplicates exist); a duplicate always writes to its parent's file and keeps its own name. `repo`/`global` echo the input project as `name`. Invalid YAML → `error` `"invalid YAML: …"`. Async (worker); emits `projects-changed` |
| `{ "t": "serviceBody", "project": "<name>", "key": "<service>" }` | `{ "t": "serviceBody", "ok": true, "project": "<name>", "key": "<service>", "body": ServiceBody, "source": "project"\|"repo" }` / `{ "ok": false, "project": "<name>", "key": "<service>", "error": "…" }` — the service's stored mapping from the topmost layer that defines it (compact `key: cmd` normalized to `{ "cmd": … }`), to seed the phone's service editor. `source` is which layer it came from. Inline |
| `{ "t": "actionBody", "project": "<name>", "key": "<action>" }` | `{ "t": "actionBody", "ok": true, "project": "<name>", "key": "<action>", "body": ActionBody, "section": "actions"\|"terminals", "source": "project"\|"repo"\|"global" }` / `{ "ok": false, "project": "<name>", "key": "<action>", "error": "…" }` — the action's full stored mapping from the topmost body-bearing layer, searching **both** `actions:` and `terminals:` (scalar shorthand normalized to `{ "cmd": … }`). `key` may be a `parent:child` composite (a nested child, resolved by descending `actions:` submaps). `section` says which section it lives in, `source` which layer. Inline |
| `{ "t": "saveService", "project": "<name>", "key": "<service>", "payload": ServiceBody, "previousKey": "<old>"? }` | `{ "t": "saveService", "ok": true, "project": "<name>", "key": "<service>" }` / `{ "ok": false, "project": "<name>", "key": "<service>", "error": "…" }` — creates or edits `services.<key>`. `payload` carries the managed fields (`cmd` required; optional `cwd`, `port`, `portConflict`, `env`, `dependsOn`) — a field the payload **omits** is removed from the entry, so a cleared value doesn't linger, while user-authored fields outside that set survive. A compact `key: cmd` entry is promoted to a mapping before patching. With `previousKey` ≠ `key` the service is renamed: the map key moves in its owning layer and **every** reference (each `profiles:` list, other services' `dependsOn`/`depends_on`) is rewritten across all layers. A new key is created in the `project` layer. Async (worker); comments reflow; emits `projects-changed` |
| `{ "t": "deleteService", "project": "<name>", "key": "<service>" }` | `{ "t": "deleteService", "ok": true, "project": "<name>", "key": "<service>" }` / `{ "ok": false, "project": "<name>", "key": "<service>", "error": "…" }` — deletes `services.<key>` from its owning layer and strips every reference to it (profile lists + other services' `dependsOn`/`depends_on`) across all layers, dropping an emptied `services:` map. Async (worker); comments reflow; emits `projects-changed` |
| `{ "t": "saveProfile", "project": "<name>", "name": "<profile>", "services": ["<service>"…], "previousName": "<old>"? }` | `{ "t": "saveProfile", "ok": true, "project": "<name>", "name": "<profile>" }` / `{ "ok": false, "project": "<name>", "name": "<profile>", "error": "…" }` — sets `profiles.<name>` to the given service list. With `previousName` ≠ `name` the profile is renamed in its owning layer first. A new profile is created in the `project` layer. Async (worker); comments reflow; emits `projects-changed` |
| `{ "t": "deleteProfile", "project": "<name>", "name": "<profile>" }` | `{ "t": "deleteProfile", "ok": true, "project": "<name>", "name": "<profile>" }` / `{ "ok": false, "project": "<name>", "name": "<profile>", "error": "…" }` — deletes `profiles.<name>` from its owning layer, dropping an emptied `profiles:` map. Async (worker); comments reflow; emits `projects-changed` |
| `{ "t": "saveAction", "project": "<name>", "key": "<action>", "payload": ActionBody, "previousKey": "<old>"?, "section": "actions"\|"terminals"? }` | `{ "t": "saveAction", "ok": true, "project": "<name>", "key": "<action>" }` / `{ "ok": false, "project": "<name>", "key": "<action>", "error": "…" }` — creates or edits an action. The existing body is read first and **merged**: the payload's managed fields (`label`, `emoji`, `shortcut`, `cmd`, `cwd`, `type`, `reuse`, `confirm`, `port`, `portConflict`, `display`, `layer`, `actions`, `position`) replace those on the entry, while **unmanaged** fields (`env`, `inputs`, hand-authored keys) ride along untouched — so `payload` is the full managed mapping the form built (omit a managed field to clear it). The edit lands in the entry's existing section + layer; a new entry is created under `section` (default `actions`) in the `project` layer. With `previousKey` ≠ `key` the entry is renamed, preserving its section. A **new** key containing `:` is rejected (composite names address an existing nested child, edited through its parent's payload). Async (worker); comments reflow; emits `projects-changed` |
| `{ "t": "deleteAction", "project": "<name>", "key": "<action>" }` | `{ "t": "deleteAction", "ok": true, "project": "<name>", "key": "<action>" }` / `{ "ok": false, "project": "<name>", "key": "<action>", "error": "…" }` — deletes the action from the topmost layer/section that has it (`actions:` then `terminals:`), dropping an emptied section. Async (worker); comments reflow; emits `projects-changed` |

### Composer draft sync

The terminal composer's **active-input text** is mirrored between the desktop and
every paired phone, keyed by terminal `termId`, so a prompt typed on one surface
appears on the other. Only the active input tab's plain text syncs — multiple
prepared prompts (the tab strip) stay device-local, and attachments/images do not
sync (a literal `[Image #N]` token, if present, rides along as text; its Mac-local
file does not).

- **Mac is the source of truth.** Both directions funnel through the Mac hub: the
  desktop composer pushes via a Tauri command, the phone via the `composerDraft`
  request above. Each write stores the text keyed by `termId` and stamps it with a
  **globally monotonic `rev`**, then the Mac broadcasts `{ "t": "composerDraft",
  id, text, rev, origin }` to all clients and emits an internal event so the
  desktop composer applies phone-typed drafts. `origin` is `"mac"` or the sending
  phone's `deviceId`.
- **Last-writer-wins, with guards.** A receiver drops a frame whose `rev` is ≤ the
  last it applied for that terminal (stale), and drops a frame whose `origin` is
  its own identity (echo of its own push). It also **yields to the local typist**:
  if the input is focused and was edited within the last ~1.5s, an inbound draft is
  dropped so remote text can't yank the field out from under active typing.
- **Debounced, fire-and-forget.** Both sides debounce the push (~250ms trailing)
  and send it best-effort (no ack). Sending a message flushes the resulting cleared
  draft immediately. Empty text **clears** the stored draft on the Mac.
- **Restore on open/reconnect.** The stored draft rides the `seed` (the `draft`
  field), present only when non-empty, and is applied **only into an empty input**
  so reconnecting never clobbers a prompt in progress. The `rev` reset that a clear
  would imply is avoided by the global counter — a re-typed draft always outranks a
  prior clear.

### Sidebar folder ops

The read-only `sidebar` message returns `{ order, groups }` (see above). The four
`sidebar*` mutations write both `~/.lpm/groups.json` (the folder defs) and the
settings `sidebarOrder` + flattened `projectOrder`, replicating the desktop's
`applySidebarLayout` — the exact same helpers the duplicate flow's
`group_copies_into_folder` uses. After each write the desktop's `projects-changed`
is emitted (so the Mac's own window and other phones refresh) and the reply
carries the **updated** `order` + `groups` inline, so the requesting phone
re-renders without a follow-up `sidebar` round-trip. All four are local config ops
and work with the Mac's main window closed. Folders are matched by **name** (exact,
then case-insensitive), consistent across create/rename/delete/move; moving a
project to a folder name that doesn't exist creates it.

### Machines this Mac connects to

The Linux servers and other Macs this Mac is connected to (desktop: + above
your projects → Server or Another computer), so the phone can add them without
a QR per machine. For each one the phone doesn't have, it asks for a pairing offer and redeems the code with a
normal [`pair`](#handshake-first-frame-required-within-20s) directly against that
machine. The machine is then an ordinary saved machine that the phone reaches on
its own, with this Mac asleep. A machine the phone hasn't added can still be
opened through this Mac with a `relay` connection.

| Request | Reply |
|---|---|
| `{ "t": "machines" }` | `{ "t": "machines", "machines": [{ "slug": "<id>", "name": "…", "platform": "linux"\|"macos"\|"", "serverId": "<uuid>"\|"", "state": "ready"\|"offline"\|"update", "projects": [ProjectInfo…] }…] }` — every enabled connection. `name` is what this Mac's sidebar calls it. `serverId` is the one the machine sends phones on `paired`/`ready`, so a phone can skip a machine it already has; empty until this Mac has talked to a build of it that reports one. `state`: `ready` = this Mac is connected and can get a code; `offline` = not connected; `update` = its lpm predates arming a pairing on request. `projects` (only on a connected machine that answered, and only from a Mac that has it) is the machine's own list in the `projects` reply's shape, its names as the machine itself uses them, in the row order this Mac's sidebar shows. `relay: true` means the phone can open it through this Mac with a [`relay`](#handshake-first-frame-required-within-20s) connection, without pairing with it (absent on a Mac that predates relaying). The sidebar order holds each machine's slot as a `peer:<slug>` token. The Mac also pushes this frame unasked, debounced, whenever a machine connects, drops, or changes its projects or agent statuses. Async: waits up to 8s on each machine. A Mac that predates this request never replies |
| `{ "t": "machinePair", "slug": "<id>" }` | `{ "t": "machinePair", "slug": "<id>", "ok": true, "code": "…", "hosts": ["…"], "port": N, "fingerprint": "<hex sha256>", "serverId": "<uuid>", "name": "…", "platform": "…" }` / `{ "t": "machinePair", "slug": "<id>", "ok": false, "error": "…" }` — has the machine arm a single-use pairing code (the same one its QR would carry, 10-minute expiry) and turns its phone server on. `hosts` leads with the address this Mac reaches it at (for a server reached over SSH, the SSH hostname), then the machine's own addresses; loopback is never included. `fingerprint` is the machine's certificate, to verify on the pairing connection like a QR's `f=`. Async: waits on the machine for up to 20s |

### Updating lpm

Installs a newer lpm on the Mac, the same install as its own Update button. Only
sent to a Mac whose `paired`/`ready` carried `selfUpdate: true`; anywhere else
each request answers `{ "t": "<request>", "ok": false, "error": "…" }`. All three
run on a worker, so the reply arrives on the out-queue.

| Request | Reply |
|---|---|
| `{ "t": "updateCheck", "force": bool? }` | `{ "t": "updateCheck", "ok": true, "currentVersion": "0.6.10", "latestVersion": "0.6.12", "updateAvail": true, "phase": "idle", "progress": -1 }` / `{ "t": "updateCheck", "ok": false, "error": "…", "phase": …, "progress": … }` — the newest release on the Mac's update channel (Stable, or Beta when the Mac's Settings choose it) and whether this Mac is behind it. The release check is cached on the Mac for an hour, and a change of channel starts it over, so asking on every connect is fine. `force: true` (the phone's **Check for lpm Updates…**) skips that cache and asks GitHub now, refreshing it; a Mac that predates `force` ignores it and answers from the cache. `phase`/`progress` are the install running now, as in `updateProgress` below, and ride a failed check too — a phone that reconnects mid-install sends this to catch up |
| `{ "t": "updateInstall" }` | Steps arrive as `updateProgress` (below). A finished install restarts lpm, so there is **no** reply: the connection drops, and the next `ready` carries the new `version`. A reply means it stopped short: `{ "t": "updateInstall", "ok": true, "cancelled": true }`, or `{ "t": "updateInstall", "ok": false, "error": "…" }` (already up to date, another install already running, the app can't replace itself where it sits, a failed download…) |
| `{ "t": "updateCancel" }` | `{ "t": "updateCancel", "ok": true, "stopping": bool }` — stops the install while it is still checking or downloading. `stopping` is false once it has started replacing the app (it then runs on to the restart) or when none is running |

**`updateProgress`** (pushed to **every** phone, for every install on the Mac —
started by a phone, by someone at the Mac, or by another Mac):
`{ "t": "updateProgress", "phase": "checking"|"downloading"|"installing"|"idle", "progress": N }`.
Always the whole state, never a delta. `progress` is the download's whole percent,
`-1` until known and in every other phase. `idle` means an install stopped short
(cancelled or failed); an install that finished never sends it — lpm restarts
instead. Once `installing` arrives the Mac can't stop it, and the connection
dropping after it is that restart.

### Agent tabs and files

What the phone's New Tab sheet, Resume Session list and Files screen read. Each
needs its feature flag: `"agentLaunch"` (`agentOptions`, `newTerminal` with an
`agent`), `"agentSessions"` (`agentSessions`, `resumeSession`), `"actionPrompt"`
(`runAction` with a `prompt`), `"listDir"` (`listDir`). Opening a tab, new or resumed, is the main window's job (the
`runAction` relay), so those answer `ok: false` while it is closed. SSH projects
get no session list and no folder listing: their agents and files are on another
machine.

**Starting an agent.** `newTerminal` with an `agent` runs the project's own
button for it when it has one — a terminal action with no inputs and no prompt
of its own whose command launches that CLI — in a **new** tab with that action's
label, emoji and colour; otherwise the CLI's bare command (`claude`, `codex`,
`gemini`, `opencode`), labelled with the agent's `label`. `model` and `effort`
are pinned as session-only flags, as the desktop's launch picker pins them
(Claude Code and Codex; `""` leaves the agent's own default). A non-empty
`prompt` is submitted once the agent is ready. An `agent` the Mac doesn't know
opens a plain terminal.

**The New Tab sheet** offers what the desktop's empty project offers: a
terminal, then the project's actions that open an agent — a `terminal` action
whose `cmd` runs one of the `agentOptions` ids as a command word (`claude`,
`/usr/local/bin/codex …`, `codex.exe` on Windows), in `actions` order. A
header split button or menu holding any of them stays one entry, with only
those items: a split leads with the item its button runs (`primary`, or the
item last run from it for `last-used`), a menu with no `primary` and no `cmd`
of its own only opens. Picking one runs the action with `runAction` and the
typed task as its `prompt`, after its inputs and confirmation. A project with
no such action, or a Mac without `"actionPrompt"`, offers the bare agents of
`agentOptions` instead, each with its model and effort, opened with
`newTerminal`.

**Sessions** are the desktop's Resume session list: every conversation Claude
Code and Codex stored for the project's folder, newest first, minus the rows
hidden on the desktop. A row's `title` is the name the person gave its tab, else
the agent's title, else the opening prompt, else the closed tab's label, else
`"Untitled session"`. `preview` (the opening prompt) is `""` when it only restates
the title. Closed tabs with no transcript behind them aren't listed.

| Request | Reply |
|---|---|
| `{ "t": "agentOptions" }` | `{ "t": "agentOptions", "agents": [AgentOption…] }` — the agents a tab can start, in the desktop's order, with the models and levels its launch picker lists (see AgentOption below). `[]` until the Mac's main window has started. Inline |
| `{ "t": "agentSessions", "project": "<name>", "search"?: "<text>", "limit"?: N }` | `{ "t": "agentSessions", "project": "<name>", "search": "<as asked>", "limit": N, "ok": true, "sessions": [AgentSession…], "hasMore": bool }` / `{ "t": "agentSessions", "project": "<name>", "search": "<as asked>", "limit": N, "ok": false, "error": "…" }` — one page, newest first. `search` and `limit` echo the request (`""` and 40 when it left them out): replies can land out of order, so drop one whose `search` isn't the query on screen. `search` matches titles and opening prompts on the Mac; `limit` defaults to 40 (clamped 1–500). `hasMore` means older ones exist: ask again with a bigger `limit`. Reading transcripts takes a while, so the reply arrives on the out-queue |
| `{ "t": "resumeSession", "project": "<name>", "provider": "claude"\|"codex", "sessionId": "<id>", "title": "<row title>" }` | `{ "t": "resumeSession", "ok": true }` / `{ "ok": false, "project": "<name>", "error": "Open the lpm app on your Mac to resume a session." }` — relay; continues the conversation in a new tab behind whatever the Mac shows, exactly as picking it in the desktop's Resume session does: the tab history's own resume command and name when the project closed that tab, else `claude --resume <id>` / `codex resume <id>` named `title`. A conversation already open in a tab (its row's `openIn`) gets no second one — open that tab instead. The new terminal appears on a subsequent `terminals` re-request |
| `{ "t": "listDir", "project": "<name>", "dir": "<relative dir>" }` | `{ "t": "listDir", "project": "<name>", "dir": "<dir>", "ok": true, "root": "<abs project root>", "entries": [DirEntry…] }` / `{ …, "ok": false, "error": "…" }` — one folder (`""` = the project root), as the desktop's Files tab lists it: folders first, then names in natural order regardless of case; `.git` and other VCS folders never listed. The path is confined to the project (`..` is refused). A file opens with `fileChunk` at `<dir>/<name>`; `root` joined with that is its absolute path (Copy Path). Out-queue |

Go to file needs no request of its own: it filters the `mentions` index.

### Seen and archived agents

Only when `features` has `"agentArchive"`. A finished agent (`Done` or `Error`) has
three states, the desktop sidebar's and the phone's alike:

- **New** — in `statusEntries`, as before: drawn in its state's color, notifies.
- **Seen** — in `seenEntries`, with `seenAt`: opened at least once. Drawn muted (gray
  name, gray mark, time kept) in its place among the project's agents. It notifies
  nothing and counts for nothing; only the agent list shows it.
- **Archived** — in neither list. The tab stays open and the agent keeps running.

Opening an agent's terminal sends `clearStatus` as before; the Mac turns that into
*seen* while its **Keep finished agents until archived** setting is on
(`keepFinishedAgents` in `projects`, off by default). While it's off, opening a
finished agent removes it as before, `markStatusSeen` archives, and the phone offers
no Mark as Seen. The agent's
next report on that tab (a new turn) drops its seen entry, so a tab never holds both.
Closing the tab drops it too. The Mac archives a seen entry by itself once it has
been seen longer than its **Archive seen agents automatically** setting, and archives
every seen entry when the setting is switched off.

The phone lists a project's seen agents with its others, one row per terminal like
the rest (a seen entry on a terminal that also has a `statusEntries` entry is not
listed). When a project has more seen rows than `seenAgentsShown` (from `projects`,
default 3), the most recently seen ones show and the rest fold into one
“N more seen” line that expands in place.

A row that is `Done` or `Error`, new or seen, can be archived (`archiveStatus`, with
every key the row stands for); a `Running` or `Waiting` row can't. A new row can be
marked seen without opening it (`markStatusSeen`) and a seen one marked unread
(`markStatusUnread`). The phone holds an archive back for 5 seconds behind an Undo,
hiding the row meanwhile, and sends `archiveStatus` only once that passes.

### Session memory

Per-project work-session logs (`~/.lpm/memory/<owner>/<session>.md`), co-written
by the desktop Memory tab and by agent CLIs through the lpm-memory skill. A
duplicate reads and writes its **original's** folder, so `dir` is echoed on the
list reply and the phone derives the owner from its last path segment — never
assume the folder is named after the project. Unavailable for SSH projects
(`"Session memory isn't available for SSH projects."`); fine for peer projects,
which are evaluated on the Mac that owns them. All four run on a worker.

Unlike the desktop pane, which inlines every session's full text in one call, the
list carries a **truncated preview** (first 1200 characters) and `memorySession`
fetches one document in full — a phone on cellular should not pull every log to
render a list.

| Request | Reply |
|---|---|
| `{ "t": "memory", "project": "<name>" }` | `{ "t": "memory", "project": "<name>", "ok": true, "exists": bool, "dir": "<abs owner dir>", "sessions": [MemorySession…] }` / `{ "ok": false, "error": "…" }` — lists the owner folder, newest first (`updatedAt` DESC, then `name` ASC). `exists:false` with a filled `dir` means the folder simply isn't there yet, which is the empty state, **not** an error. Each session's `content` is the preview, not the document. Async (worker) |
| `{ "t": "memorySession", "project": "<name>", "name": "<slug>" }` | `{ "t": "memorySession", "project": "<name>", "name": "<slug>", "ok": true, "title": "…", "path": "<abs>", "updatedAt": N, "size": N, "content": "<full markdown>" }` / `{ "ok": false, "error": "This session was removed." }` — one document in full, fields flattened onto the reply. A doc over 1 MiB comes back with `content` replaced by a placeholder sentence while `size` still reports the true byte count. Async (worker) |
| `{ "t": "memorySave", "project": "<name>", "name": "<slug>", "content": "…", "baseline": "…"?, "reqId": <any>? }` | `{ "t": "memorySave", "project": "<name>", "name": "<slug>", "ok": true }` / `{ "ok": false, "error": "…" }` — compare-and-swap: with `baseline` the write lands only if the file still reads exactly like that, otherwise it fails with the bare literal `"modified"` (**not** a sentence — the phone shows its own copy and reloads). Omit `baseline` to overwrite unconditionally, which is what the create path does. A missing file matches only an **empty** baseline. Slugs must match `^[a-z0-9][a-z0-9-]{0,63}$` — the slug becomes a filename. Async (worker) |
| `{ "t": "memoryDelete", "project": "<name>", "name": "<slug>" }` | `{ "t": "memoryDelete", "project": "<name>", "name": "<slug>", "ok": true }` / `{ "ok": false, "error": "…" }` — takes no baseline (the user is discarding the whole session) and an already-missing file is success. Async (worker) |

### Notes

Per-project encrypted notebook — a SQLCipher database plus an AES-GCM blob store
under `~/.lpm/notes/<project>/`, both keyed by the Mac's Keychain vault key. The
Mac decrypts and serves plaintext over this (pinned, per-device-token) link; the
bytes never leave it in the clear. Notes deliberately do **not** sync between
paired Macs — a copied `notes.db` would be undecryptable on the other Mac.

The first call for a project opens the database (a Keychain round-trip, plus
migrations on a legacy file), so every verb runs on a worker. There is **no**
change event for notes: unlike memory, nothing pushes, and a phone refetches.

Message ordering is seq-based and newest-first; page by passing the oldest id you
hold as `beforeId` (`""` for the first page). Chat and message timestamps are unix
**milliseconds** — note this differs from session memory's `updatedAt`, which is
**seconds**.

| Request | Reply |
|---|---|
| `{ "t": "notesChats", "project": "<name>" }` | `{ "t": "notesChats", "project": "<name>", "ok": true, "chats": [NoteChat…] }` / `{ "ok": false, "error": "…" }` — every chat, most recently updated first. A project with no notebook yet is created on first open and back-fills a "General" chat. Async (worker) |
| `{ "t": "notesCreateChat", "project": "<name>", "title": "…" }` | `{ "t": "notesCreateChat", "project": "<name>", "ok": true, "chat": NoteChat }` / `{ "ok": false, "error": "…" }` — Async (worker) |
| `{ "t": "notesRenameChat", "project": "<name>", "chatId": "<id>", "title": "…" }` | `{ "t": "notesRenameChat", "project": "<name>", "chatId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — Async (worker) |
| `{ "t": "notesDeleteChat", "project": "<name>", "chatId": "<id>" }` | `{ "t": "notesDeleteChat", "project": "<name>", "chatId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — deletes the chat, its messages, and any blobs they alone referenced, then sweeps pre-existing orphans. Async (worker) |
| `{ "t": "notesMessages", "project": "<name>", "chatId": "<id>", "limit": N, "beforeId": "<id>"\|"" }` | `{ "t": "notesMessages", "project": "<name>", "chatId": "<id>", "beforeId": "…", "ok": true, "messages": [NoteMessage…] }` / `{ "ok": false, "error": "…" }` — one page, newest first; `limit` defaults to 50. A short page means the history is exhausted. `beforeId` is echoed so a page landing out of order can be dropped. Async (worker) |
| `{ "t": "notesAddMessage", "project": "<name>", "chatId": "<id>", "text": "…", "attachments": [NoteAttachmentInput…], "reqId": <any>? }` | `{ "t": "notesAddMessage", "project": "<name>", "chatId": "<id>", "ok": true, "message": NoteMessage }` / `{ "ok": false, "error": "…" }` — attachment bytes ride inline as base64 and are capped at **8MiB each** on this link (the desktop's own drop limit is 100MB); over that the reply is `"That file is too large to send from your phone. Add it from your Mac instead."` and nothing is written. The cap is set by the frame, not the disk — base64 inflates by 4/3 and the desktop refuses to read a WebSocket frame over 16MiB. Sending to a deleted chat is rejected before any blob is stored. Async (worker) |
| `{ "t": "notesEditMessage", "project": "<name>", "id": "<messageId>", "text": "…" }` | `{ "t": "notesEditMessage", "project": "<name>", "id": "<messageId>", "ok": true }` / `{ "ok": false, "error": "…" }` — stamps `editedAt`. Async (worker) |
| `{ "t": "notesDeleteMessage", "project": "<name>", "id": "<messageId>" }` | `{ "t": "notesDeleteMessage", "project": "<name>", "id": "<messageId>", "ok": true }` / `{ "ok": false, "error": "…" }` — Async (worker) |
| `{ "t": "notesSearch", "project": "<name>", "query": "…", "limit": N }` | `{ "t": "notesSearch", "project": "<name>", "query": "…", "ok": true, "hits": [NoteSearchHit…] }` / `{ "ok": false, "error": "…" }` — substring match across the project's messages, newest first, `limit` default 50. `query` is echoed so a stale reply from a superseded keystroke can be dropped. Async (worker) |
| `{ "t": "notesAttachment", "project": "<name>", "hash": "<sha256 hex>", "reqId": <any>? }` | `{ "t": "notesAttachment", "project": "<name>", "hash": "<sha256 hex>", "ok": true, "data": "<base64>" }` / `{ "ok": false, "error": "…" }` — one attachment's bytes. Over 8MiB the reply is `"This attachment is too large to open on your phone. Open it on your Mac instead."`; the phone knows each attachment's `size` from its message, so it should not ask in the first place. Async (worker) |

### Limit reminders

A reminder that a usage limit has reset, set from the desktop's Usage page or a
phone's Usage screen. The Mac keeps the list (`~/.lpm/limit-reminders.json`) and the
clock: when the window's reset has passed (plus 30 seconds), it shows a banner on the
Mac, pushes the `usage` notification to the phones (above), and drops the reminder.
One reminder per limit and window; setting one again replaces it. Only when
`features` has `"limitReminders"`.

| Request | Reply |
|---|---|
| `{ "t": "limitReminders" }` | `{ "t": "limitReminders", "ok": true, "reminders": [LimitReminder…] }` |
| `{ "t": "setLimitReminder", "limit": "claude:<account>"\|"codex", "window": "fiveHour"\|"weekly", "resetsAt": <unix SECONDS>, "name": "<what the row is called>" }` | the same frame with the new list, or `"ok": false, "error": "…"` and the unchanged list — a window that has already reset, or an unknown window. `limit` is the key of the `limits` map; `resetsAt` is the window's `resetsAt` as the `limits` frame gave it; `name` is the title the banner and notification show. |
| `{ "t": "clearLimitReminder", "limit": "…", "window": "…" }` | the same frame with the new list (clearing one that isn't set is not an error) |

**LimitReminder**: `{ "limit": "claude:work", "window": "fiveHour", "resetsAt": 1793300000, "name": "Work" }`.
The Mac pushes the same `limitReminders` frame to every connected phone whenever the
list changes (see Server-initiated pushes).

### Waking a sleeping Mac

When the active Mac stops answering (asleep, or not answering on the home network),
the phone offers Wake. It uses what the Mac said in `ready`'s `wake`, and:

1. sends a wake packet — six `0xFF` bytes then the card's 6-byte hardware address
   sixteen times, UDP to ports 9 and 7 — straight to each card's `ip` (an iPhone may
   not broadcast; Android also sends to `broadcast`);
2. opens a TCP connection to each saved home-network address on the Mac's lpm port,
   which a Bonjour Sleep Proxy (an Apple TV or HomePod) answers by waking the Mac;
3. asks every other saved machine that answers and has `"wake"` in `features` to do
   the same on its own network:

| Request | Reply |
|---|---|
| `{ "t": "wake", "targets": [{ "mac", "ip", "broadcast" }…], "port": <lpm port> }` | `{ "t": "wake", "ok": true }` once the packets are on their way (they're sent off the read loop), or `"ok": false, "error": "Nothing to wake."` when no target parses. The machine broadcasts a wake packet to each `broadcast`, to 255.255.255.255 and to each `ip`, then connects to each `ip` on `port`. |

Then the phone keeps reconnecting for a minute. Nothing here needs the sleeping Mac's
cooperation beyond "Wake for network access" being on, which macOS has on by default.

### Push notifications (APNs and FCM)

While the app is backgrounded its socket dies, so agent status changes reach the
phone as pushes instead: APNs for iPhones, Firebase Cloud Messaging (FCM) for
Android phones. The desktop sends them via a relay (the lpm website) that holds
the APNs signing key and the FCM service account; notification content is
end-to-end encrypted, so the relay sees only opaque blobs and device tokens.

| Request | Reply |
|---|---|
| `{ "t": "apnsToken", "token": "<hex APNs device token>", "env": "production"\|"sandbox", "key": "<base64 32-byte push key>", "notify": { "waiting": bool, "done": bool, "error": bool, "automationStarted": bool, "automationDone": bool, "automationError": bool, "weeklyRecap": bool } }` | `{ "t": "apnsToken", "ok": true }` / `{ "t": "apnsToken", "ok": false, "error": "…" }` — registers (or refreshes) this device's push identity; sent after every successful `auth`, since the token can rotate, and re-sent immediately when the user changes notification preferences. A phone also sends `{ "t": "presence", "active": bool }` (no reply) when its app leaves or returns to the screen, and `active: false` right after `ready` if a connection comes up while it's away; every new connection starts out counted as on screen, and older phones that never send it keep today's behavior. `env` is the APNs environment the build's token belongs to (debug builds → `sandbox`, TestFlight/App Store → `production`). `key` is the phone-generated AES-256 push key; the phone keeps **one** push key (Keychain, shared with the notification extension) and registers the same key with every paired Mac, so the extension never has to guess which key decrypts. `notify` selects which agent and automation outcomes this device wants pushed; the desktop filters **before** sealing/sending, so a disabled kind never leaves the Mac. `notify.projects` (**optional**) is `{ "<project name>": "waiting"\|"off" }`: `"waiting"` lets only an agent waiting on the user (and an automation run asking a question) through for that project, `"off"` lets nothing through; a project it doesn't name gets everything the other fields allow, and a duplicate the map doesn't name follows the project it was made from. The phone sends one map to every Mac, so names another Mac doesn't have are ignored. Missing agent fields default to enabled for older phones; missing automation and `weeklyRecap` fields default to disabled. All-false keeps the device registered with notifications off. Everything persists on the device record in `remote.json`. `ok` is **false** for three reasons: the payload failed validation (`error` says which field), the Mac holds no device record for this `deviceId`, or — since every write became a read-modify-write, below — the device is paired but the registration **could not be saved**, e.g. `remote.json` is unreadable or another writer holds the lock too long. In that last case the device stays paired and the socket stays up; only push registration is missing, and the phone's next `auth` re-sends it |
| `{ "t": "pushToken", "platform": "fcm"\|"apns", "token": "<push token>", "env": "production"\|"sandbox", "key": "<base64 32-byte push key>", "notify": { …as apnsToken… } }` | `{ "t": "pushToken", "ok": true }` / `{ "t": "pushToken", "ok": false, "error": "…" }` — the same registration for any push platform, with the same timing, `key`, `notify` defaults, persistence and `ok` semantics as `apnsToken`. Android phones send it with `platform: "fcm"`, their FCM installation ID as `token`, and no `env` (FCM has none; one sent anyway is ignored). `platform: "apns"` takes an APNs token and `env` exactly as `apnsToken` does; iOS keeps sending `apnsToken`, which stays supported. Validation: an `fcm` token is 1–4096 characters of `A–Z a–z 0–9 _ : -`; an `apns` token is ≤200 hex characters with `env` `production` or `sandbox`; `key` must decode to 32 bytes; any other `platform` (or none) fails with `error: "invalid platform"`. A desktop that predates `pushToken` ignores it and never replies, so the phone treats a missing ack as not registered and sends it again on its next `auth` |

**When the desktop pushes.** On an agent status transition to `Waiting`, `Done`,
or `Error` (the same `status-changed` signal that drives the socket push), for
every registered device whose app is **not** on screen, filtered by that
device's `notify` preferences. On screen means a live authed connection that
hasn't reported `presence` `active: false` (that app already sees the change); a
locked or backgrounded phone keeps its socket for minutes, so it says it's away
and still gets the alert. Transitions are deduped
per (project, status key) so a re-reported identical status never re-notifies.
Automation results use the same delivery path and connection exclusion. The
`automationStarted`, `automationDone`, and `automationError` preferences cover
found-work/pending-window, completed, and error/timed-out results respectively.
An automation waiting on the user's answer is pushed with the status
`Waiting for your answer · <question>` when the device has `waiting` or
`automationDone` on.
`weeklyRecap` covers the weekly recap: when the desktop shows Monday's "Your
week in lpm is ready" toast (once a week, Monday to Wednesday, while the recap
is on), it also pushes it to every device with `weeklyRecap` on, through the
same delivery path and connection exclusion. Its plaintext is
`{ "serverId", "target": "recap", "week": "<its Monday, YYYY-MM-DD>", "title", "body", "ts", "key": "recap:<week>" }`:
show `title` and `body` as given, and open the weekly recap on last week when
it's tapped. A phone paired with several Macs gets one from each.
A limit reminder that fires (see [Limit reminders](#limit-reminders)) is pushed to
every device with any notification on, through the same delivery path and
connection exclusion, as
`{ "serverId", "target": "usage", "title", "body", "ts", "key": "reminder:<limit>/<window>" }`:
show `title` and `body` as given, and open the Usage screen when it's tapped.

A `Done` alert also carries what the turn left behind, when the Mac knows it:
`"changes": { "files": N, "added": N, "removed": N }` — the project's uncommitted
changes, counted as the terminal header counts them (absent when there are none, or
for an SSH project) — and `"summary": "…"`, the last paragraph of the answer a
Claude session ended this turn with, as one line of at most 200 characters, which is
most often the question the agent waits on (absent for other agents, and when no
answer from this turn is found). Show the counts with the status and `summary` as the
body. Older Macs send neither. A `Done` alert offering `reply` shows three buttons:
Reply (typed, as today), Review Changes (opens the project's review screen) and Open
Tab (opens the terminal, as a tap does).

**Payload encryption.** The notification plaintext is JSON:
```
{ "serverId": "<uuid>", "project": "<name>", "projectLabel": "<display name>", "target": "terminal"|"automation", "terminal": "<tab label or automation id>", "terminalId": "<terminal id>", "automationId": "<automation id>", "status": "<agent status or automation outcome>", "ts": <unix millis>, "key": "<status entry key>" }
```
(`terminalId` is present for terminal notifications and `automationId` is present
for automation notifications, allowing a tap to open the exact destination.
`project` is the project's file name — an id for a duplicate — and is what every
match, clear, and deep link keys off; `projectLabel` is the name the Mac's sidebar
shows for it (its label, else a duplicate's inherited parent label, else the
file name) and is what the notification title should display. It is **absent**
on older desktop builds; fall back to `project`.
`terminal` may be empty when the pane label is unknown; `key` identifies the
status entry so a later clear can find this notification. `serverId` is this Mac's
stable identity — the phone scopes notification matching by `(serverId, project,
key)` so a same-named project on another paired Mac isn't confused with this one;
it is **absent** on Macs running an older desktop build, so treat a missing
`serverId` as unscoped.) It is sealed with AES-256-GCM under the device's push
key, encoded as `nonce(12) || ciphertext || tag(16)` in standard base64 —
CryptoKit's `AES.GCM.SealedBox(combined:)` format.

**Withdrawing notifications.** When a pushed status is cleared on the desktop
(tab-click dismiss, pane close, agent moving on), the desktop sends a **silent
background push** per registered device whose blob plaintext is:
```
{ "serverId": "<uuid>", "clear": [ { "project": "<name>", "key": "<status entry key>" }… ] }
```
The app wakes briefly, decrypts, and removes the delivered notifications whose
`(serverId, project, key)` match. The top-level `serverId` scopes the clear to
this Mac so a phone paired with several Macs can't remove another Mac's
notifications for a same-named project; it is **absent** on older desktop builds
(treat as unscoped). Clears are sent regardless of `notify` preferences (they
can only remove). Best-effort by design: iOS throttles background pushes and
drops them entirely for force-quit apps, so the phone also **reconciles on
foreground** — after reconnecting and refreshing projects, it prunes delivered
notifications whose status entry no longer exists. Alert pushes also carry an
`apns-collapse-id` derived from `(serverId, project, key)` (sha-256 hex,
truncated to 60 chars), so a status change on the same pane (Waiting → Done)
replaces the displayed notification instead of stacking a new one. The `serverId`
is mixed in so two Macs with same-named projects can't collapse each other's
notifications on a phone paired with both.

**Relay contract.** The desktop POSTs JSON to the relay
(`https://lpm.cx/api/push` by default; `pushRelay` in `remote.json` overrides,
e.g. for a local `next dev`):
```
{ "token": "<hex device token>", "env": "production"|"sandbox", "blob": "<base64 sealed payload>", "type": "alert"|"background", "collapseId": "<≤64 chars>" }
```
`type` defaults to `alert`. `background` sends a silent push (`content-available:
1`, `apns-push-type: background`, priority 5, no alert/sound) carrying only the
`blob` — used for notification withdrawal. `collapseId` is optional and only
meaningful for alerts; it becomes the `apns-collapse-id` header.
The relay signs an APNs provider JWT with its `.p8` key (env vars
`APNS_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_TOPIC`, topic defaulting to
`cx.lpm.mobile`) and forwards to the matching APNs environment as an `alert`
push, priority 10, expiring after ~6h (a stale approval ping is noise):
```
{ "aps": { "alert": { "title": "lpm", "body": "Activity in lpm" }, "sound": "default", "mutable-content": 1 }, "blob": "<base64>" }
```
The `aps.alert` is a deliberately generic fallback: the phone's notification
service extension decrypts `blob` and rewrites the title/body (e.g.
"web-app — agent is waiting"); if decryption fails the generic text shows and
nothing leaks. Relay replies `{ "ok": true }` or
`{ "ok": false, "status": <apns http status>, "reason": "<apns reason>" }`; on
`410`/`Unregistered` the desktop clears that device's stored token so dead
installs stop generating traffic.

**Platforms.** Each device record stores its token's platform as
`push_platform` in `remote.json`: absent for APNs (every record written before
Android phones, and every `apnsToken` registration), `"fcm"` for an FCM token.
The token itself stays in `apns_token`, whichever platform it belongs to, so
existing files need no migration. A registration clears the push identity of
every **other** record holding the same token on the same platform (a stale
pairing of the same install). An older desktop sharing the file keeps the field
but doesn't read it, so it may offer an FCM token to the relay as APNs; the relay
rejects that body and nothing is sent.

For an FCM device the desktop adds `"platform": "fcm"` to the relay body and
leaves out `env`; every other field, and every kind of push (status alerts,
automation alerts, withdrawals), is the same:
```
{ "platform": "fcm", "token": "<FCM registration token>", "blob": "<base64 sealed payload>", "type": "alert"|"background", "collapseId": "<≤64 chars>" }
```
`platform` defaults to `apns`. The relay sends an FCM device a **data-only**
message through the FCM HTTP v1 API (`messages:send`, authorized with an OAuth2
token from a service account: env vars `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` /
`FCM_PRIVATE_KEY`), so FCM never shows a notification of its own:
```
{ "message": { "fid": "<installation id>", "data": { "blob": "<base64>", "type": "alert"|"background", "collapseId": "<id>" }, "android": { "priority": "HIGH"|"NORMAL", "ttl": "21600s", "collapse_key": "<id>" } } }
```
The Android app registers with FCM by its Firebase Installation ID (FID, 22 URL-safe
base64 characters, `onRegistered`), which the relay targets with `fid`; a longer
legacy registration token goes in `token` instead.
Alerts go at `HIGH` priority with `collapse_key` set to `collapseId`; withdrawals
(`type: "background"`) at `NORMAL`, without one; both expire after ~6h like an
APNs alert. The phone opens `blob` itself (the same `nonce || ciphertext || tag`
AES-256-GCM box: the first 12 bytes are the GCM IV) and posts the notification —
title and body as the iOS extension writes them, replacing an earlier one with
the same `collapseId` — or, for a `clear`, removes the matching ones, scoped by
`serverId` as on iOS. An FCM `UNREGISTERED` (404) or an `INVALID_ARGUMENT` about
the registration token answers `410` like APNs' `Unregistered`; FCM out of reach
answers `502` with `reason: "fcm unreachable"`. Each platform answers `503` with
`reason: "relay not configured"` while its own credentials are missing, so a
relay can serve one platform without the other.

#### Answering from a notification

Only when `features` has `"answerAgent"`. A terminal alert's plaintext may carry
`"actions"`: the answers the phone may send back without opening the app.
`["allow", "deny"]` on a `Waiting` that is a plain permission prompt of Claude
Code or Codex (not a question form — AskUserQuestion, a plan to approve — not an
MCP dialog, and not another agent's prompt); `["reply"]` on any agent's `Done`.
Absent means none — every other alert, and every alert from an older Mac. The
phone shows them as notification buttons: **Allow** and **Deny** (both need the
phone unlocked; Deny is destructive), and **Reply** with a text field; the plain
tap still opens the tab.

| Request | Reply |
|---|---|
| `{ "t": "answerAgent", "project": "<name>", "terminalId": "<id>", "key": "<status key>", "ts": N, "action": "allow"\|"deny"\|"reply", "text"?: "…", "reqId"?: <any> }` | `{ "t": "answerAgent", "ok": true, "reqId": <any> }` / `{ "t": "answerAgent", "ok": false, "error": "…", "reqId": <any> }` — `project`, `terminalId`, `key` and `ts` are the alert's own. `allow` types Enter and `deny` Esc into the terminal, only while that same report (`key`, `terminalId`, `ts`) is still a plain permission prompt — otherwise `error: "This prompt was already answered."` and nothing is typed. `reply` types `text` (trimmed; 1–4000 characters) into the agent and submits it, as the desktop composer does: bracketed paste when the program turned it on, then Enter as its own write once the screen is quiet, sent once more if nothing redrew. It's refused while the terminal has an agent `Waiting` or working on it, and once the agent has quit — the tab's shell back at its own prompt, or, where that can't be told (Windows, an SSH tab), the alert's `Done` report (`key`, `terminalId`, `ts`) no longer standing — so a late reply never runs as a shell command. The reply joins the shared prompt history. Runs off the read loop; `error` is a sentence to show the user |

The phone sends it on its live connection to that Mac, or — when the app was
woken in the background by the tap, or is talking to another Mac — on a
short-lived connection of its own, as the push-registration sweep does, then
tells the user how it went with a local notification only when it failed.

#### Live Activity

Only when `features` has `"liveActivity"`. A phone can show the agents at work on
a Mac while it is locked: an iPhone as a Live Activity (Lock Screen and Dynamic
Island), an Android phone as an ongoing notification. The phone starts it itself
while it shows that Mac and keeps it current from the live connection; from the
moment its app leaves the screen the Mac takes over and sends every change as a
push, until nothing is at work.

| Request | Reply |
|---|---|
| `{ "t": "liveActivity", "on": bool, "token"?: "<hex>", "env"?: "production"\|"sandbox" }` | `{ "t": "liveActivity", "ok": bool }` — turns live updates on or off for this device; persisted on its record in `remote.json` (`live_updates`, and for an iPhone `live_token` / `live_env`). An APNs device names the Live Activity's own push token (hex, ≤200 characters) and its environment, and sends it again whenever the activity's token changes or a new activity starts; an FCM device sends no token — its updates go to its push token. `on: false` clears it. `ok` is false for a missing or malformed APNs token, an unknown device, or a registration that couldn't be saved |

**When the Mac sends.** On every agent status change (coalesced over ~0.8 s) and
when a phone reports `presence` `active: false`, to every device with live
updates on whose app is not on screen for this Mac — skipping a device whose
last update said the same. The plaintext, sealed under the device's push key
exactly like an alert:
```
{ "serverId": "<uuid>", "ts": <unix millis>, "live": bool, "waiting": N, "working": N,
  "agents": [ { "project": "<name>", "projectLabel": "<display name>", "terminal": "<tab label>", "terminalId": "<id>", "key": "<status key>", "agent": "claude"|"codex"|"gemini"|"cursor"|"opencode"|"omp", "state": "Waiting"|"Running"|"Done"|"Error", "since": <ms>, "turnStart": <ms|0>, "endedAt": <ms|0> }… ] }
```
`agents` holds at most four, most urgent first: every `Waiting`, then every
`Running`, then `Done` / `Error` from the last 30 minutes; newest first within
each. `waiting` and `working` count all of them. `since` is when the state
began, `turnStart` when the turn did (0 when unseen), `endedAt` when it ended.
`live: false` means nothing is at work any more: that update **ends** the
activity, left up for 15 minutes — or taken down at once when `agents` is empty,
so no blank card stays up — and the Mac forgets an iPhone's activity token
(the phone registers the next activity it starts).

**Relay contract.** The desktop POSTs:
```
{ "token": "<activity token>", "env": "production"|"sandbox", "blob": "<base64>", "type": "liveactivity", "event": "update"|"end", "urgent": bool, "dismissAt"?: <unix seconds> }
{ "platform": "fcm", "token": "<FCM token>", "blob": "<base64>", "type": "liveactivity", "event": "update"|"end", "urgent": bool }
```
`urgent` is true when more agents wait on the user than in the last update, and
on `end`. For APNs the relay sends a `liveactivity` push to the topic
`<APNS_TOPIC>.push-type.liveactivity`, priority 10 when `urgent` and 5
otherwise, expiring after an hour, with the content state still sealed — the
phone's widget opens `blob` itself:
```
{ "aps": { "timestamp": <unix seconds>, "event": "update"|"end", "content-state": { "blob": "<base64>" }, "dismissal-date"?: <dismissAt> } }
```
For FCM it is a data message `{ "blob", "type": "liveactivity", "event" }` at
`HIGH` priority when `urgent`, `NORMAL` otherwise, with a one-hour `ttl`. A `410`
retires the activity token (APNs) or the push token (FCM).

### Server-initiated pushes (desktop → phone)

| Frame | Meaning |
|---|---|
| `{ "t": "o", "id": "<termId>", "d": "<utf-8 chunk>", "off": <streamOffset> }` | Terminal output. Feed straight into the terminal emulator. `off` is the terminal's byte-stream position **after** this chunk: drop a chunk whose `off` a seed already covered (seed and output share one socket, so they overlap), and when `off` minus the chunk's UTF-8 length runs past the offset already applied, output was dropped in transit — re-`sub` with `from` to fetch the gap instead of applying the chunk. |
| `{ "t": "exit", "id": "<termId>", "code": N, "gone": true? }` | The terminal's process exited. Also the reply to a `sub` for a terminal the Mac no longer has — it exited (a dropped `exit` frame) or lpm restarted since — with `code: -1, gone: true` and no seed. Keep the last output on screen but stop sending input; opening the terminal again re-asks. |
| `{ "t": "projects-changed" }` | A project started/stopped/renamed. Re-request `projects`. |
| `{ "t": "terminals", "project": "<name>", "terminals": [Terminal…] }` | The project's tabs changed on the Mac — one opened, closed, finished, renamed, pinned, given an icon or moved, from the Mac, this phone or a paired Mac. The same frame as the `terminals` reply: replace the project's list. Sent to every phone, whether or not it is showing the project. Older desktops never push it, so keep re-requesting after your own tab ops. |
| `{ "t": "status-changed", "project": "<name>" }` | A status badge changed (e.g. an agent is now Waiting). Re-request `status`. |
| `{ "t": "jobs-changed" }` | An automation started, stopped, or completed — or its read watermark moved, from this phone or the desktop. Re-request `jobs` and any open history/live output. |
| `{ "t": "git-changed", "project": "<name>" }` | The watched project's working tree changed (sent only to a connection that issued `gitWatch` for it, debounced ~400ms after the last change). Carries no payload — re-request `git` and any open `gitDiff`s to refresh the review screen. |
| `{ "t": "control", "id": "<termId>", "owner": ControlOwner\|null }` | The terminal's control owner changed. If `owner` is not this phone, show the "take control" placeholder and stop driving size; if it is (or `null`), render live. |
| `{ "t": "memory-changed", "project": "<owner name>" }` | A session-memory file changed on disk — usually an agent CLI writing through the lpm-memory skill while the Memory screen is open (FSEvents, ~500ms settle). `project` is the **owner** folder name, which for a duplicate is its original: refresh when it matches either the project you are showing or the owner you learned from that project's `dir`. Notes have no equivalent push. |
| `{ "t": "limits-changed", "limits": AgentLimits, "claudeEnabled": bool, "now": unix MILLIS }` | A tool reported new plan usage. Carries the full snapshot — apply it directly, **do not re-request** `limits`. Sent only on a meaningful change (a re-report of identical numbers is suppressed on the Mac). `now` is the Mac's clock at send time, as on the `limits` reply: re-measure the offset from every push, since the phone may have been asleep — or the Mac's clock corrected — since the last one. |
| `{ "t": "limitReminders", "reminders": [LimitReminder…] }` | A limit reminder was set, cleared or fired, from the desktop or any phone. Replace the list. Only from a Mac whose `features` has `"limitReminders"`. |
| `{ "t": "composerDraft", "id": "<termId>", "text": "…", "rev": N, "origin": "mac"\|"<deviceId>" }` | The terminal composer's active-input text changed on another surface. Apply it to that terminal's composer input (see composer draft sync below). `origin` is `"mac"` for a desktop-typed draft, else the deviceId of the phone that sent it — drop the frame when `origin` is your own deviceId (your echo). `rev` is monotonic; drop a frame whose `rev` is ≤ the last one applied for this terminal. |
| `{ "t": "updateProgress", "phase": "checking"\|"downloading"\|"installing"\|"idle", "progress": N }` | A step of an lpm install on the Mac, whoever started it. See [Updating lpm](#updating-lpm). |
| `{ "t": "bye", "reason": "sleep"\|"quit"\|"off", "at": unix MILLIS }` | The desktop is about to close this connection on purpose: the machine is going to sleep (macOS and Windows), lpm is quitting, or remote control was turned off. Sent just before the socket closes — for `sleep`, just before the machine sleeps, so the socket may stay open until the phone notices it went quiet. Remember it per machine until the next `ready`, and say so ("asleep since 11:42 PM", "lpm was closed") instead of reporting the drop as a network problem; keep reconnecting as usual. Older desktops never send it. |

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
seenEntries?: [StatusEntry] // finished agents already seen, each with `seenAt`; absent from a Mac without "agentArchive"
isRemote: bool
parentName: string        // the project this is a duplicate of; empty for originals — the phone offers Remove only when set
worktree: bool            // a duplicate made as a linked git worktree rather than a folder copy
autoPull?: bool           // the project's own auto pull choice; present only when its YAML sets one. Absent follows
                          // the parent (for a duplicate or worktree) or the Mac's `autoPullMode` (see `projects`)
claudeAccount?: string    // the one Claude account new sessions always use; "" is the main login only. Present only
                          // when the project's YAML sets it, and it outranks claudeAccounts
claudeAccounts?: [string] // the project's own ordered list to take turns on. [] on a duplicate means the main
                          // accounts rather than its parent's choice. Neither key: an original uses the main
                          // accounts, a duplicate follows its parent's keys
workStatus?: { state: "in_progress"|"blocked"|"done"|"custom", label?: string, emoji?: string, note?: string, since: unix MILLIS }
                          // a status the person set on the project ("what I want done with it"), unlike
                          // statusEntries, which is what the agent is doing. A custom one carries its own label
                          // and emoji so the row still reads on a Mac whose palette differs; a built-in one has
                          // neither. Absent when the project has no status. `since` is 0 when unknown
actions: [ActionInfo]     // recursive: { name (composite parent:child), label, emoji, cmd, type, display, layer?, position?, children[] … }
                          // `display` is header (also "" or "button"), footer, menu, or the name of a zone; `layer` picks
                          // the zone's layer (absent or unknown: its first). A display naming no zone shows in the header.
                          // `position` orders a row's buttons and zones together: positioned first, then by name.
                          // `label` is what the button shows, already rendered: a label with variables
                          // ({{git.branch}}, {{git.tag}}, {{git.tagAge}}, {{git.nextPatch}}, {{project}}) or
                          // $(command)s arrives as today's text, and `configLabel` then carries the label as
                          // written (absent when the two match). `emoji` renders the same way (its first word),
                          // with `configEmoji` as written, present (even "") whenever the emoji was rendered; a
                          // rendered-empty emoji is absent. The same holds for `inputs[].label` and
                          // `inputs[].options[].label`, each with its own `configLabel`. The Mac emits
                          // `projects-changed` when a rendered label moves (a new tag or branch, new command
                          // output, an age ticking over), so the phone redraws by refetching `projects`.
                          // An `emoji` of `✻`, `◆`, `✦` or `▣` (trimmed) is drawn as the claude, codex, gemini or
                          // opencode mark by clients that can, and shown as-is otherwise (a Terminal's `emoji` too).
                          // Editors read `actionBody`, which keeps the templates, and `labelRefresh`/`labelRefreshOnHover`/
                          // `labelRefreshOnChange` ride along as unmanaged keys (the Mac watches files itself). `labelRefreshOnHover: true` asks a pointer-driven client to
                          // rerun the action's commands when hovered; the phone has no hover and ignores it
zones: [ZoneInfo]         // framed groups of buttons in the header or footer row, sorted by position:
                          // { name, label, rows: 1…3, display: "header"|"footer", position?, layers?: [{ name, label?,
                          //   position? }], collapsed?: bool, source: "project"|"repo"|"global" }. Placement only: an
                          // action joins one with `display: <name>`. `rows` is the zone's height in buttons, filled
                          // top to bottom and then across. With `layers`, the zone shows one layer at a time;
                          // `collapsed` folds it into one button. `source` is the file that declares it
configError?: string      // why the Mac couldn't parse the project's YAML (the desktop's "Invalid configuration");
                          // services, actions and profiles are then empty. The phone marks the row red, shows the
                          // error with the raw-file editor in place of the project, and offers no Start
```

**ClaudeAccount** (from `claudeAccounts`):
```
id: string          // "default" is the main login; any other id is an account added on the Mac
label?: string      // the name given on the Mac; absent for the main login, which the phone calls "Main login"
signedIn: bool
email: string       // "" when unknown
plan: string        // "max" | "pro" | "team" | "enterprise" | "" when unknown. Only max and pro take turns
                    // without being in `switching.allowed`
planLabel: string   // "Max 20x", "Pro", … for display
confirmed: bool     // confirmed as the person's own; needed before it takes turns in a list
```

**ClaudeSwitching** (from `claudeAccounts`):
```
enabled: bool        // Settings › Accounts & usage › Claude › Switch accounts automatically
active: bool         // switching actually runs: on, confirmed, and possible on this Mac
paused: "hold"|"readings"|null   // why switching is paused, when it is
allowed: [string]    // team and work seats allowed to take turns
maxMembers: N        // the longest list a project or the main accounts can hold (3)
pools: [ { project: string|null, members: [string], current: string|null } ]
                     // each pool's account for new sessions: project null is the main accounts, a name is
                     // that project's own list (copies that follow it share it). `members` are the pool's
                     // account ids in order; absent from older Macs. The projects list's usage rows tag the
                     // main accounts' `current` "in use" and, while switching is active, its other members "pool"
```

**SshHost** (from `listSshHosts`) — a `~/.ssh/config` Host alias:
```
name: string          // the Host alias
hostName: string      // HostName (may be empty)
user: string
port: number          // 0 when unset
identityFile: string  // IdentityFile path (may be empty)
```

**ServiceBody** (the `body`/`payload` of `serviceBody`/`saveService`) — a
service's managed fields; a compact `key: cmd` entry reads back as `{ "cmd": … }`:
```
cmd: string           // required
cwd: string?
port: number?
portConflict: string?
env: { <k>: <v> }?
dependsOn: [string]?
```

**ActionBody** (the `body`/`payload` of `actionBody`/`saveAction`) — an action's
full mapping. Managed fields the form owns: `label`, `emoji`, `shortcut`, `cmd`,
`cwd`, `type`, `reuse`, `confirm`, `port`, `portConflict`, `display`, `layer`,
`actions` (nested children), `position`. Any other key (`env`, `inputs`, hand-authored) is
**unmanaged** and preserved across an edit. A scalar shorthand entry reads back
as `{ "cmd": … }`. `inputs` is the mapping keyed by input name that the desktop's
action wizard writes — `{ "<key>": { label?, type?: "radio"|"password", required?,
placeholder?, default?, persist?, options?: [value | { label, value }], position? } }`,
never a list. The phone's editor sends it whole, and `{}` once every input is
removed, since a payload that leaves `inputs` out keeps the stored ones.

**JobInfo**:
```
id: string
project: string
valid: bool
source: "project" | "repo" | "global"
label: string
emoji: string
enabled: bool
duplicate: bool
runKind: "action" | "cmd" | "prompt"
description: string       // what it runs: the prompt, the command, or the action name
schedule: { mode: "interval", everySecs: N, everyMaxSecs?, fromMinutes?, untilMinutes?, days? }
        | { mode: "calendar", atMinutes: N, alsoAtMinutes?: [N], days: ["mon"…], untilMinutes?, times?, pickDays?,
            monthDays?: [N], lastDay?, shortMonths?: "last", nth?: "first"…"last", nthOf?: "mon"…|"day"|"weekday",
            onDates?: ["YYYY-MM-DD"] }
        | { mode: "manual" }
lastRunAt: unix seconds | null
lastResult: string | null
nextFireAt: unix seconds | null
running: bool
runningSince: unix seconds | null
agent: string?
model: string?
effort: string?
targets: [string]         // the projects this job runs in
targetCount: number       // targets.length
runningCount: number      // how many of them are running it right now
standalone: bool          // runs outside any project; `targets` is then empty
unread: number            // runs that landed after the automation was last read,
                          // folded across `targets`. 0 = nothing new
ask: JobAsk?              // the question the automation is waiting on the user to
                          // answer, plus `project` (where it waits — the project to
                          // answer in) and `at` (the history entry that asked;
                          // absent while that run is still going). A shared job
                          // carries the first one found across its targets
machines: [JobMachine]?   // the computers that may run it, best first: the first
                          // that's on runs each run. Absent = every computer that
                          // has it runs it (automations from before this field)
anyMachine: bool?         // after `machines`, any other computer that has it and is on
machineId: string?        // this Mac's hostId, alongside `machines`
```

**JobMachine** — a computer an automation runs on, named as this Mac knows it:
```
id: string               // its hostId
name: string             // "" when this Mac doesn't know it
here: bool               // it is this Mac
```

The `jobs` reply also carries `machines: [JobMachine]`: this Mac first, then
each computer paired with it, either way round — what the editor offers. Config
sync copies an automation to every paired computer; each decides on its own
whether a run is its turn, so a phone sees this Mac's copy of an automation
another computer runs, and its history holds the runs made here.

**JobAsk** — a question an automation run put to the user (`lpm ask`):
```
id: string
askedAt: unix seconds
questions: [{
  id: string
  type: "confirm" | "choice" | "text" | string   // a type the phone doesn't know
                                                 // is answered as text
  text: string
  yes: string?  no: string?      // confirm: button labels (default Yes / No)
  options: [{ label: string, description: string? }]?   // choice
  multiple: bool?                // choice: pick several
  other: bool?                   // choice: also take the user's own words
  multiline: bool?  placeholder: string?                 // text
  optional: bool?
  default: bool | [string] | string?   // used when it expires unanswered
}]
blocking: bool?          // a command run is waiting live; otherwise an agent run
                         // ended its turn and resumes with the answer
expiresAt: unix seconds?
status: "open" | "answered" | "dismissed" | "unanswered" | string
answers: { "<question id>": bool | [string] | string }?
reply: string?           // answered in the user's own words, by a plain reply
answeredAt: unix seconds?
auto: bool?              // nobody answered in time; the defaults were used
```

Project- and repo-layer jobs stay one row per project (each carries its owning
`project` and a single-entry `targets`); a global-layer job collapses to **one**
aggregated row whose `project` is absent and whose `targets` are every project it
covers, with `runningCount` / `targetCount` folded across them.

**JobHistoryEntry**:
```
at: unix seconds
result: string
count: number?
copy: string?
output: string?
durationSecs: number?
costUsd: number?
question: string?
session: string?
resumed: string?
follows: unix seconds?
compacted: bool?
verified: bool?             // the job's `verify` command's verdict for this run.
                            // Absent = the job declares no check, or there was no
                            // live run to check (a run salvaged after the app
                            // closed) — unverified, which is not a pass
verifyOutput: string?       // what that command said, capped
asks: [JobAsk]?             // what the run asked the user, with how each ended
answerTo: string?           // the JobAsk id this entry's `question` answered —
                            // the asking entry already shows the answer, so it
                            // isn't repeated as a message
unread: true?               // the run landed after the automation was last read.
                            // Only set on entries that left something to read —
                            // quiet checks, skips and stopped runs never carry it
ranOn: string?              // the computer that made this run, when it wasn't this
                            // Mac: another of the automation's computers ran it
                            // while this one was off
```

**AgentUsageStats** (the `stats` reply) — all token counts are numbers that can reach
the billions:
```
generatedAt: unix millis
days: N                     // the requested period (0 = all time)
sessions: N                 // total agent sessions in the period
totals: TokenUsage          // grand totals
providers: [UsageBreakdown] // key = "claude" | "codex"
projects:  [UsageBreakdown] // key/label = project name
models:    [UsageBreakdown] // key = model id (drives the cost estimate); fast-mode and long-context usage are separate rows
daily:     [ { date: "YYYY-MM-DD", claudeTokens: N, codexTokens: N, totalTokens: N,
               models: [ { provider, model, tokens: TokenUsage, fast: true?, longContext: true? } ] } ]   // per-day cost estimate
recentSessions: [ { provider, project, model, startedAt: unix millis, lastAt: unix millis, tokens: TokenUsage,
                    machine: "local" | slug? } ]   // machine: only when several computers are added together
sources:   [ { provider, files: N } ]   // history files scanned per provider
```
**WeeklyRecap** (the `weeklyRecap` reply's `recap`):
```
week: "YYYY-MM-DD"          // the Monday it starts, or the month's 1st
period: "week" | "month"    // missing from an older Mac: a week
days: [ { date: "YYYY-MM-DD", agentMs: N, prompts: N, tokens: N } ]   // every day in order: seven from Monday, or the whole month; tokens as Stats' totalTokens (0 from an older Mac)
previousAgentMs: N          // agent time the week or month before (not on the card)
sessions: N                 // agent sessions
projects: [ { name, agentMs } ]   // busiest first
agents:   [ { name, agentMs } ]   // "claude" | "codex" | other agent ids, busiest first
workedRepos: [string]       // the repositories of the projects agents worked in this week
linesAdded: N, linesRemoved: N    // the user's own commits; lockfiles and 5,000+ line file changes left out
missing: [string]?          // paired computers that couldn't add their week: offline, or no answer
```
The card (desktop `weeklyRecapModel.ts` and `WeeklyRecapCard.tsx`, mirrored on both phones, light
theme by default): title "My agents' week" and the week's range ("Oct 19 – 25"), or for a month
"My agents' month" and the month's name and year ("October 2026"); the tokens as
`formatTokenCount` (`2.1B`) at 64 over "tokens read and written by my agents", then the hours as
`formatAgentTime` (`54h 1m`, `3h`, `45m`) at 52 over "of agents working for me" — a week with no
tokens shows the hours at 64 beside their label instead; tiles for prompts, agent sessions and
lines (`+664k` / `−179k`: exact below 10,000, then thousands, then millions to one decimal); one
line naming the agent mix ("Claude 64%, Codex 36%", or "All Claude"); the lpm mark and lpm.cx.
No project is named. Empty (no agent time) shows no card.

**UsageMachine** (the `stats` reply's `machines`: the computers the Stats screen can pick, this Mac first): `{ id: "local" | slug, name, platform: "macos"|"linux"|"windows"|"", headless: bool?, local: bool, connected: bool, totalTokens: N?, error: string? }`. `name` is the computer's own name (show `local` as "This Mac"); `totalTokens` is its total for the requested period once the Mac has read it; `error` says why it is out of an `"all"` total. Show the picker only when there are two or more.
**TokenUsage**: `{ inputTokens, cachedInputTokens, cacheCreationInputTokens, cacheCreation1hInputTokens, cacheReadInputTokens, outputTokens, reasoningTokens, totalTokens }`. Invariants: `inputTokens` **already includes** the cached input (`cacheCreation + cacheRead`); `cacheCreation1hInputTokens ⊆ cacheCreationInputTokens` (the 1-hour cache writes, priced at 2× input instead of 1.25×; absent from older Macs, read as 0); `reasoningTokens ⊆ outputTokens`; `totalTokens = inputTokens + outputTokens`. So cache share = `cachedInputTokens / max(1, inputTokens)`.
**UsageBreakdown**: `{ key, label, sessions, tokens: TokenUsage, provider?, fast?, longContext? }`. `provider` is set on `models` rows only; `fast: true` marks a model row that ran in fast mode (priced at the model's fast multiplier) and `longContext: true` one billed at the model's long-context rates (Claude Haiku 5.5 requests whose prompt, cache reads and writes included, passes 100K tokens: every bucket at 5×); each is omitted otherwise, so one model can appear more than once.
Cost is **estimated on the phone** from `models` using per-model list prices with cache reads, 5-minute and 1-hour cache writes priced separately, matching the desktop. Each day is priced the same way from `daily[].models`, which the phone reads for its Token activity widget: while a list with usage rows is on screen and the widget is on the Home Screen, it asks for `{ days: 30, machine: "all" }` at most every 15 minutes per Mac. No cost field is sent.

**AgentLimits** (the `limits` reply) — a map keyed `"codex"` or `"claude:<accountId>"`:
```
provider:  "claude" | "codex"
accountId: string?          // Claude only (its config-dir account, often "default"); OMITTED for Codex
label:     string?          // Codex plan ("pro"), Claude model display name — OMITTED when unknown
fiveHour:  { usedPercent: 0..100, resetsAt: unix SECONDS } ?   // OMITTED, never null
weekly:    { usedPercent: 0..100, resetsAt: unix SECONDS } ?   // OMITTED, never null
updatedAt: unix MILLIS      // NOT seconds — the units differ inside one object
```
Invariants: `usedPercent` is not clamped, so values above 100 occur — clamp only a
progress bar, never the number or the verdict. `resetsAt: 0` means unknown. A window
already past its reset describes a window that no longer exists and is rendered as
absent rather than as a full bar. The 5-hour and weekly window lengths are fixed
constants on the client and never travel on the wire, so a client derives how far
into a window it is from `resetsAt` alone.

`now` rides **beside** `limits` on the reply and the `limits-changed` push (not inside
a map entry) and is the Mac's clock, unix MILLIS, at the moment it built the frame.
The two stamps above sit on different clocks: `resetsAt` is copied verbatim from what
the tool's own servers reported, while `updatedAt` is stamped by the Mac when it read
that report. `now` therefore anchors `updatedAt` and nothing else — a client takes
`offset = now − its own clock at receipt` and ages "last reported" against
`own clock + offset`, but compares `resetsAt` against its own clock raw, which is both
the timeline the provider stamped against and the one the client prints the reset time
in. Applying the offset to `resetsAt` breaks it in both directions: a Mac running slow
keeps a window that has already turned over reading "resets in 10m", a Mac running fast
hides a window with 10 real minutes left. (One exception the client cannot see: an
older Codex build reports a relative `resets_in_seconds`, which the Mac converts with
its own clock.) A Mac older than this field sends no `now` at all, so the field is
**optional**: fall back to a zero offset rather than treating its absence as an error.
Sanity-check what does arrive — a value outside a believable wall-clock range (a `0`,
or seconds sent where millis were meant) would age "last reported" by decades, so it is
safer to ignore it and keep the offset at zero.

**MemorySession** — one work-session log:
```
name: string          // slug, no ".md"; ^[a-z0-9][a-z0-9-]{0,63}$
title: string         // first markdown heading, else the slug
path: string          // absolute path on the Mac that owns it
updatedAt: unix SECONDS   // note: notes timestamps below are MILLIS
size: N               // true byte length, even when content is a placeholder
content: string       // preview (first 1200 chars) on `memory`; full text on `memorySession`
```
**Invariant:** `dir` on the `memory` reply is the folder the project *resolves to*, which for a duplicate is its original's. The owner is `dir`'s last path segment; a duplicate showing shared memory is `owner != project`.

**NoteChat**: `{ id, title, createdAt: unix millis, updatedAt: unix millis }`.

**NoteMessage** — note the short keys:
```
id: string
chatId: string
ts: unix millis            // NOT "timestamp"
text: string
editedAt: unix millis?     // absent when never edited
attachments: [NoteAttachment]?   // absent when none
```
**NoteAttachment**: `{ hash, name, size, mimeType }` — `hash` is the sha256 of the plaintext (also the dedup key) and is what `notesAttachment` takes. `size` is the real byte length, so the phone can refuse a fetch above the 8MiB link cap without asking.

**NoteAttachmentInput** (phone → Mac, inside `notesAddMessage`): `{ name, mimeType, data }` where `data` is standard padded base64 of the raw bytes.

**NoteSearchHit** — note `id` is the *message* id:
```
id: string          // message id
chatId: string
chatTitle: string
ts: unix millis
snippet: string     // byte-window around the match
```

**AgentOption** — one agent a new tab can start:
```
id: string            // "claude" | "codex" | "gemini" | "opencode" — what newTerminal's `agent` takes
label: string         // "Claude Code"
models: [ { value: string, label: string, efforts: [ { value: string, label: string } ] } ]
                      // [] when the agent has no model or level control. value "" is the
                      // agent's own default ("Default"); a model whose efforts hold only
                      // Default takes no level
```

**AgentSession** — one past conversation (`agentSessions`):
```
key: string           // "<provider>:<sessionId>", unique in the list
provider: "claude" | "codex"
sessionId: string
title: string
preview: string       // the opening prompt; "" when it would only restate the title
updatedAt: unix MILLIS   // last activity; 0 when unknown
gitBranch?: string    // the branch it ran on
account?: string      // the Claude account it resumes on, by name; absent for the main login
openIn?: string       // the live tab already holding it (a Terminal id)
```

**DirEntry** — one row of `listDir`:
```
name: string
dir: bool
ignored: bool         // matched by .gitignore and untracked (shown dimmed)
status?: string       // a file's working-tree change, the same word as `git`'s files[].status
changed?: N           // a folder's count of changed files anywhere below it
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
emoji: string    // the tab's emoji icon (empty if unset) — mirrors the desktop tab icon; agent glyphs as on ActionInfo
canFork: bool    // the desktop's tab menu offers Fork session (an agent tab with a conversation to fork)
canForkCopy: bool // … and Fork into copy (not for a project that runs over SSH)
canTitle: bool   // … and Use conversation title (a renamed agent tab with a conversation)
```
The three `can*` flags come from a desktop with `"tabMenu"` in `features`; older ones omit
them, which means false.
The `label` and `pinned` state come from the desktop's tab tree, which the
frontend registers with the server (`remote_set_terminal_labels`). terminals.json
persists labels but not the ephemeral pty id, so the running frontend is the only
source of the id→label mapping; an unopened project's terminals fall back to
showing the id.

**ControlOwner** — which surface renders a terminal live and drives its size:
```
kind: "window" | "mobile"   // a desktop window, or a phone
id: string                  // "main" / "detached:<project>" for windows; the deviceId for a phone
label: string               // human name for the placeholder, e.g. "Main window" / "My iPhone"
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
turnStart?: int  // unix millis the turn began; absent when never seen starting
endedAt?: int    // unix millis the turn ended; absent while it runs
seenAt?: int     // unix millis it was last opened; only on `seenEntries`
```

## Input hex framing

Most keystrokes are UTF-8 and sent verbatim in `d`. For raw non-UTF-8 bytes
(some control sequences, pastes), frame them exactly as the desktop does: prefix
`d` with the null byte + `HEX:` and hex-encode the remainder. Server contract
(`pty::remote_write`):
```
d = "\0HEX:" + hex(bytes)   // decoded to raw bytes
d = "<utf-8 text>"              // sent as-is
```

## Notes / invariants

- **One PTY, one geometry — single-owner control.** A terminal is rendered live
  and controllable in exactly one surface at a time (a desktop window or a phone),
  tracked server-side in `control.rs`. A phone's `sub` *claims* a terminal (the
  screen just opened is where it's live); desktop windows present it and take over
  on focus, and anyone can `claim` ("Take control"). The **owner** renders live and
  drives the shared PTY size; any other surface shows a "take control" placeholder
  and does **not** `resize`. The server enforces this: a `resize` from a non-owner
  phone is dropped. Ownership transfers to a remaining presenter when the owner
  `unsub`s or disconnects, and every change is pushed as a `control` frame (and the
  `owner` field of `seed`). A `resize` sent while the link is down is dropped, not
  replayed, and the desktop resizes the PTY while the phone is away — so the owning
  phone re-sends its size after any `seed` whose `cols`/`rows` differ from its own.
- **Flow control is owner-only.** The phone never acknowledges output; the
  desktop owns backpressure. A phone that falls behind simply re-`sub`s and gets
  a fresh `seed`.
- **Reconnect = re-seed.** iOS suspends the app seconds after backgrounding and
  the socket dies. On foreground, reconnect, `auth`, and `sub` again — the
  `seed` frame restores the current screen from the server-side ring buffer.
- **v1 scope.** The phone views/types into terminals the desktop already
  created, starts/stops projects and services, **creates projects** (new/import/
  clone/SSH), and **edits project config** — services, profiles, actions, and the
  raw YAML of the project/repo/global layers. Changing the desktop pane layout
  from the phone (moving/splitting panes) is still deferred — that needs the
  owner-window action relay so the desktop store stays authoritative. Config
  writes go directly through the Mac's config layer (no window needed);
  structured edits reflow comments (like `saveJob`), while the raw-YAML editor
  preserves them.

## Dev/prod coexistence (shared ~/.lpm)

A developer can run a debug build (`npm run tauri dev`) and the installed release
app at the same time on one Mac. Both read and write the same
`~/.lpm/remote.json`, so each build takes a distinct identity to avoid colliding
— each build simply looks like a separate Mac to the phone:

- **Port.** The dev build listens on the prod effective port **+ 2**
  (`8765 → 8767`; `+2` because `8766` is the Mac-to-Mac peer host). A user-set
  port shifts the same way (`9000 → 9002`), so the two builds never bind the same
  port through the shared config. The pairing QR / `state` already advertise the
  build's own port, so the phone connects to the right one automatically.
- **serverId.** The dev build mints and persists its own id in `dev_server_id`
  (prod keeps using `server_id`). Every wire `serverId` (in `paired` / `ready`
  and every push payload) is the build's own id, so the phone stores dev and prod
  as two separate saved-Mac records (it dedupes by `serverId`) and switches
  between them.
- **serverName.** The dev build appends `" (dev)"` to the computer name in
  `paired` / `ready`, so the phone's Mac switcher shows two distinguishable
  entries.
- **Push scoping.** Paired devices live in the shared `devices` list, so both
  builds can see a phone's APNs token even if it paired with only one. Each device
  record carries `paired_server_id` (the flavor-aware `serverId` of the build
  that completed the pairing); a build sends pushes only to devices whose
  `paired_server_id` matches its own id. A missing/legacy `paired_server_id`
  (paired before this field existed) is treated as **prod**, so existing users
  keep their pushes and the dev build never sends them phantom notifications.
- **The shared `devices` list.** Because the list is shared but each build holds
  the config in memory, a whole-file overwrite by one build used to erase devices
  the other had paired — the phone's next `auth` then failed with `unauthorized`
  through no fault of its own. Every write to `remote.json` is now a
  **read-modify-write under an advisory lock** on `remote.json.lock`: the writer
  re-reads the file, keeps the `devices` list and `pairing_code` it finds there,
  re-applies only the settings its own process owns (enabled/port/tailscale/push
  relay/server ids), applies its change, and writes atomically. Combined with the
  per-`auth` device-list refresh described in [Handshake](#handshake-first-frame-required-within-20s),
  two co-running builds no longer clobber each other's pairings, and a device
  paired with one build keeps working while the other runs.
