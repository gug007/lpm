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
{ "t": "pair", "code": "AB12-CD34", "name": "My iPhone" }
```
→ on success the server replies and the code is consumed (single use):
```json
{ "t": "paired", "deviceId": "<uuid>", "token": "<base64 bearer token>",
  "serverId": "<uuid>", "serverName": "My MacBook Pro" }
```
The phone stores `deviceId` + `token` in the Keychain. `serverId` is this Mac's
stable identity (minted once, persisted in `remote.json`); `serverName` is its
user-visible computer name (from `scutil --get ComputerName`, falling back to the
hostname). Together they let a phone paired with **several Macs** tell them apart
and label each one. On rejection:
```json
{ "t": "error", "error": "pairing rejected" }
```

**Auth** (every subsequent connect):
```json
{ "t": "auth", "deviceId": "<uuid>", "token": "<base64 bearer token>" }
```
→ `{ "t": "ready", "serverId": "<uuid>", "serverName": "My MacBook Pro" }`
on success, or `{ "t": "error", "error": "unauthorized" }`. `serverId` and
`serverName` are the same stable identity + computer name returned by `paired`,
re-sent on every resume so a phone paired with multiple Macs keeps them labeled
and can route each connection to the right Mac.

The server stores only `sha256(token)`; the raw token never leaves the phone
after pairing. Revoking a device in desktop Settings deletes its hash and drops
any live connection.

## Requests (phone → desktop) and their replies

| Request | Reply |
|---|---|
| `{ "t": "projects" }` | `{ "t": "projects", "projects": [ProjectInfo…] }` |
| `{ "t": "stats", "days": N }` | `{ "t": "stats", "ok": true, "stats": AgentUsageStats }` / `{ "ok": false, "error": "…" }` — local agent token-usage stats for the last `N` days (`0` = all time), i.e. the desktop Stats page. The Mac scans Claude Code / Codex session-history files (usage metadata only — no prompts or responses), so it runs off this connection's read loop and the reply arrives **asynchronously** (later than a fast request sent after it). SSH projects are excluded |
| `{ "t": "jobs" }` | `{ "t": "jobs", "ok": true, "jobs": [JobInfo…] }` / `{ "ok": false, "error": "…" }` — every automation across local projects |
| `{ "t": "jobHistory", "project": "<name>", "jobId": "<id>" }` | `{ "t": "jobHistory", "project": "<name>", "jobId": "<id>", "ok": true, "entries": [JobHistoryEntry…] }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "jobLiveOutput", "project": "<name>", "jobId": "<id>" }` | `{ "t": "jobLiveOutput", "project": "<name>", "jobId": "<id>", "ok": true, "live": { "startedAt": N, "text": "…" }\|null }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "runJob", "project": "<name>", "jobId": "<id>" }` | `{ "t": "runJob", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "stopJob", "project": "<name>", "jobId": "<id>" }` | `{ "t": "stopJob", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "setJobEnabled", "project": "<name>", "jobId": "<id>", "enabled": bool }` | `{ "t": "setJobEnabled", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` |
| `{ "t": "sendJobFollowup", "project": "<name>", "jobId": "<id>", "at": N, "message": "…", "agent": "…", "model": "…", "effort": "…" }` | `{ "t": "sendJobFollowup", "project": "<name>", "jobId": "<id>", "ok": true }` / `{ "ok": false, "error": "…" }` — continues the conversation containing history entry `at`; empty agent/model/effort use the automation's settings |
| `{ "t": "terminals", "project": "<name>" }` | `{ "t": "terminals", "project": "<name>", "terminals": [Terminal…] }` |
| `{ "t": "slash", "id": "<termId>", "project": "<name>" }` | `{ "t": "slash", "id": "<termId>", "commands": [SlashCommand…] }` — slash-command autocomplete; empty unless the terminal runs a known AI CLI (the frontend registers each terminal's CLI, detected from its launch command) |
| `{ "t": "upload", "id": "<termId>", "data": "<base64 blob>", "mime": "image/jpeg", "name": "<original filename>"?, "reqId": <any>? }` | `{ "t": "upload", "id": "<termId>", "ok": true, "path": "<on-Mac path>", "reqId": <any>? }` / `{ "ok": false, "error": "…", "reqId": <any>? }` — saves the blob to a temp file on the Mac (scp'd first for a remote pane); the phone drops the path into the composer, which pastes it so an agent loads it. With `name` the file is saved under its **original basename** (uniquified in a fresh temp subdir) and **any** `mime` is accepted — arbitrary files, not just images. Without `name` (image-only callers, unchanged) the file is keyed by `mime` (default `image/png`) like before. Runs on a worker thread (base64 decode + fs write + possible scp), so a large upload never stalls this connection's keystrokes/resizes — replies may therefore arrive **out of order**. Pass `reqId` (string or number) and it is echoed verbatim so the phone correlates each reply to its request by id rather than FIFO (FIFO desyncs permanently if a reply is lost on a socket drop). Omit `reqId` (older phones) → the reply omits it too, unchanged |
| `{ "t": "mentions", "project": "<name>" }` | `{ "t": "mentions", "project": "<name>", "entries": [{ path, dir, changed }…] }` — @-mention targets: the project's files/dirs (relative paths), with git working-tree changes flagged. Fetched once, filtered client-side |
| `{ "t": "history", "project": "<name>", "q": "<search>" }` | `{ "t": "history", "project": "<name>", "rows": [HistoryRow…] }` — recent sent prompts for the project (newest first), for recall |
| `{ "t": "historyAdd", "project": "<name>", "id": "<termId>", "label": "<tab>", "text": "…" }` | — records a prompt the phone sent into the shared message history |
| `{ "t": "status", "project": "<name>" }` | `{ "t": "status", "project": "<name>", "status": [StatusEntry…] }` |
| `{ "t": "sub", "id": "<termId>" }` | `{ "t": "seed", "id": "<termId>", "cols": N, "rows": N, "data": "<recent scrollback>", "owner": ControlOwner\|null }`, then a live stream of `o` frames. Subscribing also *presents* the terminal (see control ownership below); `owner` tells the phone whether it may render live or must show a "take control" placeholder |
| `{ "t": "unsub", "id": "<termId>" }` | — (also stops presenting the terminal) |
| `{ "t": "claim", "id": "<termId>" }` | — (the "Take control" action) takes ownership of the terminal; the previous owner is pushed a `control` frame and flips to its own placeholder |
| `{ "t": "in", "id": "<termId>", "d": "ls\r" }` | — (keystrokes; see hex framing) |
| `{ "t": "resize", "id": "<termId>", "cols": N, "rows": N }` | — (see note) |
| `{ "t": "runAction", "project": "<name>", "action": "<actionName>", "inputValues": { "<key>": "<val>"… }, "confirmed": bool }` | `{ "t": "runAction", "ok": true }` — relay for **terminal/command** actions: forwarded to the desktop's owner window, which runs the action in its normal terminal flow (needs the main window open). The phone now owns the inputs + confirm gauntlet, so it sends the collected `inputValues` and `confirmed: true` and the Mac runs the action **directly without re-prompting** (an omitted/`false` `confirmed` falls back to the Mac's own inputs/confirm dialogs). The new terminal appears on a subsequent `terminals` re-request |
| `{ "t": "runActionBackground", "project": "<name>", "action": "<actionName>", "inputValues": { "<key>": "<val>"… }, "runId": "<uuid>" }` | `{ "t": "runActionBackground", "ok": true }` / `{ "ok": false, "runId": "<uuid>", "error": "…" }` — runs a **non-terminal** action (type `background` or the default headless type) entirely in Rust on a worker thread, so it works **even with the Mac's main window closed**. The caller-minted `runId` keys the run for polling/cancel; output + status stream into the background registry (poll with `actionBgOutput`). Also emits the desktop's `action-bg-output` event so a live Mac window shows its toast |
| `{ "t": "actionBgOutput", "project": "<name>", "runId": "<uuid>" }` | `{ "t": "actionBgOutput", "ok": true, "found": bool, "runId": "<uuid>", "project": "<name>", "label": "<action>", "startedAt": <unix>, "text": "<accumulated output>", "running": bool, "success": bool, "error": "…" }` — one poll of a background run's live output + terminal status (the phone polls every ~2s while `running`, mirroring `jobLiveOutput`). `found:false` once the run has been reaped (finished runs are retained ~5 min) or never existed |
| `{ "t": "cancelActionBackground", "runId": "<uuid>" }` | `{ "t": "cancelActionBackground", "ok": true, "runId": "<uuid>" }` — reaps the run's process tree; a no-op if it already finished or is unknown |
| `{ "t": "backgroundRuns", "project": "<name>" }` | `{ "t": "backgroundRuns", "ok": true, "project": "<name>", "runs": [{ "runId", "label", "startedAt", "running", "success", "error" }…] }` — running plus recently-finished background runs for the project (newest first), so a reconnecting phone can re-attach to a run it started before relaunch |
| `{ "t": "newTerminal", "project": "<name>" }` | `{ "t": "newTerminal", "ok": true }` — same relay; opens a plain terminal in the project |
| `{ "t": "closeTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "closeTerminal", "ok": true }` — owner-window relay; kills the terminal and removes its tab. Re-request `terminals` to refresh |
| `{ "t": "renameTerminal", "project": "<name>", "id": "<termId>", "label": "<new>" }` | `{ "t": "renameTerminal", "ok": true }` — relay; renames the desktop tab (a `terminals.json` write, no PTY op) |
| `{ "t": "pinTerminal", "project": "<name>", "id": "<termId>" }` | `{ "t": "pinTerminal", "ok": true }` — relay; toggles the tab's pinned flag |
| `{ "t": "duplicate", "name": "<name>", "count": N, "labels": ["<per-copy>"…], "groupName": "<folder>", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool, "runMode": "none"\|"action"\|"command", "action": "<actionName>", "command": "<cmd>", "prompt": "<text>" }` | Streams `{ "t": "duplicateProgress", "done": i, "total": N, "name": "<copy>" }` per copy as they're created, then a final `{ "t": "duplicate", "ok": true, "name": "<first>", "names": [...], "warning": "…"? }` / `{ "ok": false, "error": "…" }` — clones the project, mirroring the desktop modal. Rust creates each copy directly (works with no main window) with `labels[i]` as copy i's display label (blank → auto-named); `groupName` groups them under a sidebar folder (replicating the desktop's applySidebarLayout — writes groups.json + settings.json). The three git toggles default false (phone seeds `pullLatest` true from settings). **runMode** `action`/`command`: after creation, each copy's task is relayed to the main window (`remote-run-task`) which runs it in the copy's terminal (types the command, seeds the AI `prompt`) — **that step needs the desktop main window open**; if it's closed, copies are still made and the reply carries a `warning`. Copies also reach the phone via `projects-changed`. `name` = first copy; `names` = all created |
| `{ "t": "duplicateDefaults" }` | `{ "t": "duplicateDefaults", "excludeUncommitted": bool, "reinstallDeps": bool, "pullLatest": bool }` — the desktop's persisted duplicate-modal toggle defaults (from `settings.json`), so the phone's duplicate modal opens with the same initial state. Fallbacks mirror the desktop: `excludeUncommitted`/`reinstallDeps` default false, `pullLatest` defaults true |
| `{ "t": "remove", "name": "<name>" }` | `{ "t": "remove", "ok": true }` / `{ "ok": false, "error": "…" }` — tears down the project and, for a duplicate, deletes its folder from disk. Refuses an original that still has duplicates referencing it. The phone only offers this for duplicates |
| `{ "t": "renameProject", "project": "<name>", "name": "<new label>" }` | `{ "t": "renameProject", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — sets the project's display label, reusing the desktop's `set_project_label` (writes the project's own YAML; an empty `name` clears the label so it falls back to the project id). Emits the desktop's `projects-changed`, so the Mac's own window and every paired phone refresh the list |
| `{ "t": "sidebarCreateFolder", "name": "<folder>" }` | `{ "t": "sidebarCreateFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — creates an empty sidebar folder and appends it to the top-level order. The reply carries the **updated** sidebar (same shape as `sidebar`) so the requesting phone re-renders; the desktop learns of the change via the emitted `projects-changed` (as the duplicate flow's group write does). See the sidebar folder ops note below |
| `{ "t": "sidebarRenameFolder", "name": "<folder>", "newName": "<new>" }` | `{ "t": "sidebarRenameFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — renames the folder matched by `name` (exact, then case-insensitive) |
| `{ "t": "sidebarDeleteFolder", "name": "<folder>" }` | `{ "t": "sidebarDeleteFolder", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — deletes the folder; its member projects spill back into the top-level order at the folder's former slot (they are **not** removed) |
| `{ "t": "sidebarMoveProject", "project": "<name>", "folder": "<folder>"\|null }` | `{ "t": "sidebarMoveProject", "ok": true, "order": […], "groups": [ProjectFolder…] }` / `{ "ok": false, "error": "…" }` — moves a project into the folder named `folder` (matched by name, **created** if it doesn't exist — the "New folder…" affordance), detaching it from wherever it currently sits; a `null`/absent `folder` moves it back out to the top level (ungrouped) |
| `{ "t": "readFile", "project": "<name>", "path": "<relative path>" }` | `{ "t": "file", "project": "<name>", "path": "<path>", "ok": true, "content": "<utf-8 text>", "truncated": bool }` / `{ "ok": false, "error": "…" }` — reads a project file for the phone's file viewer. The path is resolved through symlinks and **confined to the project root** (a `..` or symlink escaping the root is rejected), the read is capped at ~1 MB (`truncated: true` when the file is longer), and **non-UTF-8 (binary) content is refused** with an error. fs work runs on a worker thread, so the reply arrives **asynchronously** via the out-queue |
| `{ "t": "start", "name": "<name>", "profile": "" }` | `{ "t": "start", "ok": true }` / `{ "ok": false, "error": "…" }`. The optional `profile` starts exactly that profile's services (empty = the project's active/default set); the phone offers a "Start with profile" variant when `ProjectInfo.profiles` is non-empty |
| `{ "t": "stop", "name": "<name>" }` | `{ "t": "stop", "ok": … }` |
| `{ "t": "toggleService", "name": "<name>", "service": "<svc>" }` | `{ "t": "toggleService", "ok": … }` |
| `{ "t": "ping" }` | `{ "t": "pong" }` |

### Git review & ship

Review a project's working-tree changes and ship them (pull, push, fetch, switch
branch, commit, open a PR, discard) from the phone — mirroring the desktop's
project Git submenu. Every reply echoes the `project` it was addressed to, so a
reply can be matched to its request even with several in flight. The **local**
ops (`gitDiff`, `gitCommit`, `gitBranches`, `gitCheckout`, `gitDiscardAll`) reply
inline; the **worker** ops — the `git` snapshot and `gitDiffs` batch (a status
scan / many-file diff can be slow on a big repo), the **network / AI** ops
(`gitPull`, `gitPush`, `gitFetch`, `gitCreatePr`, and the AI generators) — run on
a worker thread on the desktop, so their reply arrives asynchronously (the
project is still resolved inline first, so a bad project fails fast). There is no
separate ack, the phone just waits for the typed reply below.

Pull, push, and fetch take no flags from the phone: the desktop applies the
user's persisted git options (`gitPull` `{strategy, autostash, noVerify}`,
`gitPush` `{mode, noVerify, tags}`, `gitFetch` `{all, prune, pruneTags, tags}`),
identical to the desktop submenu, so behavior stays consistent across surfaces.

| Request | Reply |
|---|---|
| `{ "t": "git", "project": "<name>" }` | `{ "t": "git", "project": "<name>", "ok": true, "isRepo": bool, "branch": "…", "detached": bool, "hasUpstream": bool, "ahead": N, "behind": N, "defaultBranch": "…", "ghCli": bool, "files": [{ path, status, staged, stamp }…] }` — the project's git status + changed files in one shot. `status` ∈ `added`\|`deleted`\|`renamed`\|`modified`\|`untracked`. `stamp` is an **opaque change token** for the file's working-tree content: if a file's `stamp` is unchanged between two snapshots, its diff is unchanged and needn't be refetched (skip the `gitDiff` round-trip); treat an unknown or absent `stamp` as changed (older servers omit it, so always refetch then). `ghCli` reports whether the `gh` CLI is available (gates the "Open PR" affordance). When the project isn't a git repo: `ok:true, isRepo:false` with empty/zero fields. On a bad project: `{ "ok": false, "error": "…" }`. Async (worker) |
| `{ "t": "gitDiff", "project": "<name>", "path": "<file>" }` | `{ "t": "gitDiff", "project": "<name>", "path": "<file>", "ok": true, "diff": "<unified diff>", "binary": bool, "truncated": bool }` — the unified diff (HEAD vs working tree) for one file, including untracked files. A binary file returns `binary:true, diff:""`. The diff is capped at ~400 KB, truncated at a line boundary with `truncated:true` when it exceeds that. Errors → `{ "ok": false, "error": "…" }`. Inline |
| `{ "t": "gitDiffs", "project": "<name>", "paths": ["<file>"…] }` | `{ "t": "gitDiffs", "project": "<name>", "ok": true, "files": [{ "path": "<file>", "diff": "<unified diff>", "binary": bool, "truncated": bool }…] }` — **batch** form of `gitDiff`: one `files` entry per requested path (same order), each with the same `binary`/`truncated`/~400 KB-cap semantics as `gitDiff`. Fetched from a single `git diff HEAD -- <paths>` split per file (plus a per-file diff for untracked paths), so N files cost one round trip instead of N. A path whose diff couldn't be produced degrades to an entry `{ "path": "<file>", "error": "…" }` (no `diff`) rather than sinking the batch — the phone routes such an entry through its per-file error state. On a bad project the whole reply is `{ "ok": false, "error": "…" }`. Async (worker) |
| `{ "t": "gitCommit", "project": "<name>", "message": "…", "files": ["<path>"…] }` | `{ "t": "gitCommit", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — stages exactly the given files (resetting the index first) and commits them with `message` |
| `{ "t": "gitPush", "project": "<name>" }` | `{ "t": "gitPush", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — `git push -u origin HEAD`, applying the persisted `gitPush` flags (`--force-with-lease` when `mode=="force-with-lease"`, `--no-verify`, `--tags`). Async (network) |
| `{ "t": "gitPull", "project": "<name>" }` | `{ "t": "gitPull", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — pulls with the persisted `gitPull` strategy (`ff` default \| `ff-only` \| `rebase`) and flags (`--autostash`, `--no-verify`). Async (network) |
| `{ "t": "gitFetch", "project": "<name>" }` | `{ "t": "gitFetch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — fetches with the persisted `gitFetch` flags (`--all`, `--prune` default on; `--prune-tags`, `--tags` default off). Async (network) |
| `{ "t": "gitBranches", "project": "<name>" }` | `{ "t": "gitBranches", "project": "<name>", "ok": true, "current": "<branch>", "branches": [{ name, committerDate, remote? }…] }` / `{ "ok": false, "error": "…" }` — the branch list for the "Switch branch" picker (local + remote, newest first). `remote` is **omitted** for a local branch (present only for a remote-tracking one). `current` is the checked-out branch. Inline |
| `{ "t": "gitCheckout", "project": "<name>", "branch": "<name>", "remote": "<remote>" }` | `{ "t": "gitCheckout", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — checks out `branch`; pass the `remote` from a `gitBranches` entry to create a local tracking branch (empty `remote` for a plain local checkout). Inline |
| `{ "t": "gitCreateBranch", "project": "<name>", "name": "<branch>" }` | `{ "t": "gitCreateBranch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — creates a new branch off HEAD and checks it out (reuses the desktop's `create_branch`: `git branch` + checkout, falling back to `git switch -c`). Rejects an empty or already-existing name. Inline; on success the phone re-requests `gitBranches` + `git` so the new current branch shows |
| `{ "t": "gitDiscardAll", "project": "<name>" }` | `{ "t": "gitDiscardAll", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — discards all working-tree changes (reset + clean). Inline |
| `{ "t": "gitWatch", "project": "<name>" }` | `{ "t": "gitWatch", "project": "<name>", "ok": true }` / `{ "ok": false, "error": "…" }` — starts watching the project's working tree **for this connection**; while watched, the desktop sends a debounced `git-changed` push (below) on each burst of file changes so the review screen self-refreshes. Watching an already-watched project is a no-op (still `ok:true`). The watch is scoped to the connection and is dropped on `gitUnwatch`, disconnect, and device revocation. Inline |
| `{ "t": "gitUnwatch", "project": "<name>" }` | `{ "t": "gitUnwatch", "project": "<name>", "ok": true }` — stops watching the project for this connection (no-op if it wasn't watched). Inline |
| `{ "t": "gitGenMessage", "project": "<name>", "files": ["<path>"…] }` | `{ "t": "gitGenMessage", "project": "<name>", "ok": true, "message": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a commit message from the diff of the given files. Async (AI). Uses the desktop's persisted AI settings (`aiCli` default `claude`, `aiModel`, `aiEffort`, `aiFast`) |
| `{ "t": "gitGenPr", "project": "<name>" }` | `{ "t": "gitGenPr", "project": "<name>", "ok": true, "title": "…", "body": "…" }` / `{ "ok": false, "error": "…" }` — AI-drafts a PR title and description for the current branch vs the default branch. Async (AI); same AI settings as above |
| `{ "t": "gitCreatePr", "project": "<name>", "title": "…", "body": "…" }` | `{ "t": "gitCreatePr", "project": "<name>", "ok": true, "url": "<pr url>" }` / `{ "ok": false, "error": "…" }` — pushes the current branch and opens a PR via the `gh` CLI against the default branch, returning its URL. Async (network) |

### Composer parity (AI actions, transform, service logs, history)

Bring the mobile composer to parity with the desktop composer: the user's AI
rewrite actions, running those rewrites headlessly (with variants), service log
capture, and the full message-history surface (paging, favorites, folders,
drafts). The AI/subprocess ops (`transform`, `services`, `serviceLogs`) run on a
worker thread and reply asynchronously through the client out-queue, like the git
AI generators; the history ops are local SQLite and reply inline.

| Request | Reply |
|---|---|
| `{ "t": "composerActions" }` | `{ "t": "composerActions", "actions": [{ id, icon, label, instruction }…] }` — the user's **enabled** composer AI actions from `~/.lpm/composer-actions.json`. When that file is absent, the two seeded defaults (`improve`, `concise`) are returned, matching what the desktop shows on a fresh install. `id` is only a stable client-side key (dedup/selection) — it is **not** sent on the wire. To run an action, the phone sends its `instruction` **text** as `transform`'s `instruction` field, exactly like the free-form "Ask AI to rewrite…" path; the server has no action registry and never resolves an id |
| `{ "t": "transform", "reqId": <any>, "project": "<name>", "instruction": "…", "text": "…", "variants": N }` | Streams `{ "t": "transform", "reqId": <any>, "idx": i, "ok": true, "text": "<rewrite>" }` / `{ "ok": false, "error": "…" }` per variant as it settles, then a final `{ "t": "transformDone", "reqId": <any>, "ok": bool }`. `reqId` is echoed verbatim (string or number) so the phone matches replies to the request. `variants` is clamped to 1..=5 and runs that many rewrites in parallel; for `variants > 1` each run gets a diversity suffix so the picker isn't near-identical outputs. A failed variant replies `ok:false` but doesn't fail the batch — `transformDone.ok` is true if **any** variant succeeded. AI params (cli/model/effort/fast) come from the desktop's persisted settings (`aiCli` default `claude`, `aiModel`, `aiEffort`, `aiFast`), the same source the git AI generators use. A bad `project` replies one `transform` `ok:false` then `transformDone ok:false` |
| `{ "t": "services", "project": "<name>" }` | `{ "t": "services", "project": "<name>", "ok": true, "running": bool, "services": [{ name, paneIndex, running, cmd, port }…] }` / `{ "ok": false, "error": "…" }` — service discovery for the logs viewer. When the project is running, each running service carries its `paneIndex` (the index to pass to `serviceLogs`) and `running:true`, in pane order; when stopped, every declared service is listed with `paneIndex: null` and `running:false`. `cmd`/`port` are the service's command and label port |
| `{ "t": "serviceLogs", "project": "<name>", "paneIndex": N, "lines": N }` | `{ "t": "serviceLogs", "project": "<name>", "paneIndex": N, "ok": true, "text": "<recent pane output>" }` / `{ "ok": false, "error": "…" }` — captures a running service pane's recent output (tmux capture). `lines` is capped at 200. `project`/`paneIndex` are echoed for matching. Discover valid `paneIndex` values via `services` |
| `{ "t": "historyQuery", "project": "<name>"?, "search": "…"?, "favoritesOnly": bool?, "folder": "<folderId>"?, "before": { "at": N, "seq": N }? }` | `{ "t": "historyQuery", "items": [{ id, text, images, timestamp, favorite, folder, kind, project, at, seq }…], "hasMore": bool }` — keyset-paginated history (page size 60). `project` scopes to that project (omit/empty = all projects). `favoritesOnly` or `folder` selects a collection (favorites wins if both set). `before` is the previous page's **last item's** `{ at, seq }` — pass it to fetch the next page; omit for the first page. `kind` is `"sent"` or `"draft"`; `folder` is the folder id or null; `timestamp`/`at` are unix millis (`at` + `seq` form the cursor). `hasMore` is true when more rows exist beyond this page |
| `{ "t": "historySaveDraft", "message": "<text>", "project": "<name>"?, "id": "<termId>"?, "label": "<tab>"?, "images": { "<token>": "<path>" }? }` | `{ "t": "historySaveDraft", "ok": true }` — saves the composer text as an unsent draft in shared history (badged as a draft, spared by "clear history"). `message` is the draft text (an object with a `text` field is also accepted); the rest is optional context |
| `{ "t": "historyToggleFavorite", "id": "<msgId>" }` | `{ "t": "historyToggleFavorite", "id": "<msgId>", "ok": true, "favorite": bool }` / `{ "ok": false, "error": "…" }` — flips a message's favorite flag and returns the new state |
| `{ "t": "historySetFolder", "id": "<msgId>", "folder": "<folderId>"? }` | `{ "t": "historySetFolder", "ok": true }` / `{ "ok": false, "error": "…" }` — moves a message into a folder; omit `folder` to remove it from its folder |
| `{ "t": "historyDelete", "id": "<msgId>" }` | `{ "t": "historyDelete", "ok": true }` / `{ "ok": false, "error": "…" }` — deletes a message from history |
| `{ "t": "historyFolders" }` | `{ "t": "historyFolders", "folders": [{ id, name, count }…] }` — the message folders (name-sorted) with per-folder message counts |
| `{ "t": "historyCreateFolder", "name": "<name>" }` | `{ "t": "historyCreateFolder", "ok": true, "folder": { id, name, count } }` / `{ "ok": false, "error": "…" }` — creates a folder and returns it |
| `{ "t": "historyDeleteFolder", "id": "<folderId>", "name": "<name>"? }` | `{ "t": "historyDeleteFolder", "ok": true }` / `{ "ok": false, "error": "…" }` — deletes a folder (its messages are un-filed, not deleted). Pass the folder `id`, or a `name` which is resolved to the matching folder's id |

The pre-existing `{ "t": "history", "project", "q" }` / `{ "t": "historyAdd", … }`
messages are unchanged — `historyQuery` is the richer superset for the paged
history screen, while `history` remains the simple project-scoped recall list.

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

### Push notifications (APNs)

While the app is backgrounded its socket dies, so agent status changes reach the
phone as APNs pushes instead. The desktop sends them via a relay (the lpm
website) that holds the APNs signing key; notification content is end-to-end
encrypted, so the relay sees only opaque blobs and device tokens.

| Request | Reply |
|---|---|
| `{ "t": "apnsToken", "token": "<hex APNs device token>", "env": "production"\|"sandbox", "key": "<base64 32-byte push key>", "notify": { "waiting": bool, "done": bool, "error": bool, "automationStarted": bool, "automationDone": bool, "automationError": bool } }` | `{ "t": "apnsToken", "ok": true }` — registers (or refreshes) this device's push identity; sent after every successful `auth`, since the token can rotate, and re-sent immediately when the user changes notification preferences. `env` is the APNs environment the build's token belongs to (debug builds → `sandbox`, TestFlight/App Store → `production`). `key` is the phone-generated AES-256 push key; the phone keeps **one** push key (Keychain, shared with the notification extension) and registers the same key with every paired Mac, so the extension never has to guess which key decrypts. `notify` selects which agent and automation outcomes this device wants pushed; the desktop filters **before** sealing/sending, so a disabled kind never leaves the Mac. Missing agent fields default to enabled for older phones; missing automation fields default to disabled. All-false keeps the device registered with notifications off. Everything persists on the device record in `remote.json` |

**When the desktop pushes.** On an agent status transition to `Waiting`, `Done`,
or `Error` (the same `status-changed` signal that drives the socket push), for
every registered device that does **not** currently hold a live authed
connection (a live socket means the app is foregrounded and already sees the
change), filtered by that device's `notify` preferences. Transitions are deduped
per (project, status key) so a re-reported identical status never re-notifies.
Automation results use the same delivery path and connection exclusion. The
`automationStarted`, `automationDone`, and `automationError` preferences cover
found-work/pending-window, completed, and error/timed-out results respectively.

**Payload encryption.** The notification plaintext is JSON:
```
{ "serverId": "<uuid>", "project": "<name>", "target": "terminal"|"automation", "terminal": "<tab label or automation id>", "terminalId": "<terminal id>", "automationId": "<automation id>", "status": "<agent status or automation outcome>", "ts": <unix millis>, "key": "<status entry key>" }
```
(`terminalId` is present for terminal notifications and `automationId` is present
for automation notifications, allowing a tap to open the exact destination.
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
| `{ "t": "jobs-changed" }` | An automation started, stopped, or completed. Re-request `jobs` and any open history/live output. |
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
schedule: { mode: "interval", everySecs: N } | { mode: "calendar", atMinutes: N, days: ["mon"…] }
lastRunAt: unix seconds | null
lastResult: string | null
nextFireAt: unix seconds | null
running: bool
runningSince: unix seconds | null
agent: string?
model: string?
effort: string?
```

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
models:    [UsageBreakdown] // key = model id (drives the cost estimate)
daily:     [ { date: "YYYY-MM-DD", claudeTokens: N, codexTokens: N, totalTokens: N } ]
recentSessions: [ { provider, project, model, startedAt: unix millis, lastAt: unix millis, tokens: TokenUsage } ]
sources:   [ { provider, files: N } ]   // history files scanned per provider
```
**TokenUsage**: `{ inputTokens, cachedInputTokens, cacheCreationInputTokens, cacheReadInputTokens, outputTokens, reasoningTokens, totalTokens }`. Invariants: `inputTokens` **already includes** the cached input (`cacheCreation + cacheRead`); `reasoningTokens ⊆ outputTokens`; `totalTokens = inputTokens + outputTokens`. So cache share = `cachedInputTokens / max(1, inputTokens)`.
**UsageBreakdown**: `{ key, label, sessions, tokens: TokenUsage }`.
Cost is **estimated on the phone** from `models` (per-model list prices; cache reads/writes priced separately), matching the desktop — no cost field is sent.

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

## Dev/prod coexistence (shared ~/.lpm)

A developer can run a debug build (`npm run tauri dev`) and the installed release
app at the same time on one Mac. Both read the same `~/.lpm/remote.json`, so each
build takes a distinct identity to avoid colliding — no phone-side changes are
needed, each build simply looks like a separate Mac:

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
