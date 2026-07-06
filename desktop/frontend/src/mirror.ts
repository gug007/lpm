import { EventsEmit, EventsOn } from "../bridge/runtime";
import type { PaneNode } from "./paneTree";

// A project's terminals are owned by the main window; a detached window is a
// live, co-interactive MIRROR that adopts the main window's PTYs rather than
// spawning its own. Mirror-ness is a property of the webview realm, not of any
// single terminal: the detached window (identified by the `?detached=` param it
// was opened with) mirrors every terminal it shows, and the main window owns
// every terminal it shows. So a single per-realm flag drives all of the
// role-specific behavior (adopt vs. reify, render vs. ack, follow vs. drive the
// PTY size) without threading a prop through the pane tree.
const detachedParam = new URLSearchParams(window.location.search).get("detached");
export const IS_MIRROR_WINDOW = detachedParam !== null;
export const MIRROR_PROJECT = detachedParam;

// Cross-window transport is Tauri's global event bus (EventsEmit/EventsOn): an
// emit from either window is delivered to listeners in every window, the same
// mechanism `pty-output-<id>` already rides. The protocol is self-healing: the
// owner answers requests and re-broadcasts on change, the mirror re-requests
// until it hears back, so mount ordering doesn't matter.
//
// Project-keyed channels carry the project in the PAYLOAD and filter on receipt
// (project names contain spaces/dots that Tauri event NAMES disallow). Terminal-
// keyed channels are safe to put in the name because PTY ids are already
// sanitized (`event_safe(project)-<counter>`, alnum/-/_ only).
const TREE = "mirror-tree";
const TREE_REQ = "mirror-tree-request";
const sizeEvt = (id: string) => `mirror-size-${id}`;
const desiredEvt = (id: string) => `mirror-desired-${id}`;
const snapReqEvt = (id: string) => `mirror-snap-request-${id}`;
const snapEvt = (id: string) => `mirror-snap-${id}`;

export interface MirrorTreePayload {
  tree: PaneNode | null;
  focusedPaneId: string | null;
}

export interface MirrorSize {
  cols: number;
  rows: number;
}

export interface MirrorSnapshot {
  data: string;
  cols: number;
  rows: number;
}

// --- live pane tree (owner -> mirror) ---
export function broadcastMirrorTree(project: string, payload: MirrorTreePayload): void {
  EventsEmit(TREE, { project, ...payload });
}
export function onMirrorTree(project: string, cb: (p: MirrorTreePayload) => void): () => void {
  return EventsOn(TREE, (m: MirrorTreePayload & { project?: string }) => {
    if (m && m.project === project) cb(m);
  });
}

// --- tree request (mirror -> owner) ---
export function requestMirrorTree(project: string): void {
  EventsEmit(TREE_REQ, { project });
}
export function onMirrorTreeRequest(project: string, cb: () => void): () => void {
  return EventsOn(TREE_REQ, (m: { project?: string }) => {
    if (m && m.project === project) cb();
  });
}

// --- authoritative per-terminal geometry (owner -> mirror). One PTY has one
//     size, so the owner is the sole caller of ResizeTerminal and publishes the
//     result; the mirror renders at these cols/rows. ---
export function broadcastMirrorSize(id: string, size: MirrorSize): void {
  EventsEmit(sizeEvt(id), size);
}
export function onMirrorSize(id: string, cb: (s: MirrorSize) => void): () => void {
  return EventsOn(sizeEvt(id), cb);
}

// --- the mirror's DESIRED geometry (mirror -> owner). The owner honors this
//     only while its own pane is hidden (mounted-but-not-selected), so a mirror
//     that's the sole visible view isn't stuck at a stale/default 80x24. ---
export function broadcastMirrorDesired(id: string, size: MirrorSize): void {
  EventsEmit(desiredEvt(id), size);
}
export function onMirrorDesired(id: string, cb: (s: MirrorSize) => void): () => void {
  return EventsOn(desiredEvt(id), cb);
}

// --- forwarded terminal actions (mirror -> owner). A mirror can't spawn/stop
//     PTYs or restructure the pane tree itself — its tree is a copy the owner
//     overwrites on every broadcast. So the mirror forwards the action by name,
//     the owner executes it against the authoritative tree (spawn, labeling,
//     command injection, persistence all stay in one place), and the result
//     comes back through the tree broadcast. ---
const ACTION = "mirror-terminal-action";
export function requestMirrorAction(project: string, kind: string, args: unknown[]): void {
  // Trailing omitted optionals would JSON-serialize to null and stop reading
  // as "not provided" on the owner side (e.g. renameTerminal's emoji, where
  // undefined means "keep" but null-ish means "clear").
  const trimmed = [...args];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === undefined) trimmed.pop();
  EventsEmit(ACTION, { project, kind, args: trimmed });
}
export function onMirrorAction(
  project: string,
  cb: (kind: string, args: unknown[]) => void,
): () => void {
  return EventsOn(ACTION, (m: { project?: string; kind?: string; args?: unknown[] }) => {
    if (m && m.project === project && m.kind) cb(m.kind, m.args ?? []);
  });
}

// --- flow-control ack authority (mirror -> owner). Only ONE window may ack a
//     PTY's output; two would desync the single shared unacked counter. The
//     owner acks by default, but when the owner window is hidden its ack loop
//     (driven by xterm's write-completion callback) is OS-throttled and starves
//     flow control for a visible mirror. So a focused, visible mirror announces
//     that it is the acker and the owner defers (and drops+reseeds its own now-
//     unbackpressured output) while that holds. macOS focuses one window at a
//     time, so at most one window ever claims acking. This is a window-level
//     property, so it rides one global channel rather than a per-terminal one. ---
export function broadcastMirrorAcking(acking: boolean): void {
  EventsEmit("mirror-acking", { acking });
}
export function onMirrorAcking(cb: (acking: boolean) => void): () => void {
  return EventsOn("mirror-acking", (m: { acking?: boolean }) => cb(!!m?.acking));
}

// --- run-in-duplicates (mirror -> owner). Creating project copies + queuing
//     their seeded tasks must happen in the main window's store, where the
//     copies actually mount and auto-run; a mirror only forwards the request. ---
export interface MirrorRunDuplicates {
  project: string;
  count: number;
  opts: Record<string, unknown>;
}
export function requestRunInDuplicates(p: MirrorRunDuplicates): void {
  EventsEmit("mirror-run-duplicates", p);
}
export function onRunInDuplicates(cb: (p: MirrorRunDuplicates) => void): () => void {
  return EventsOn("mirror-run-duplicates", cb);
}

// --- scrollback snapshot (mirror requests on adopt/re-show; owner replies with
//     its xterm's serialized buffer + current size). ---
export function requestMirrorSnapshot(id: string): void {
  EventsEmit(snapReqEvt(id), null);
}
export function onMirrorSnapshotRequest(id: string, cb: () => void): () => void {
  return EventsOn(snapReqEvt(id), cb);
}
export function replyMirrorSnapshot(id: string, snap: MirrorSnapshot): void {
  EventsEmit(snapEvt(id), snap);
}
export function onMirrorSnapshot(id: string, cb: (snap: MirrorSnapshot) => void): () => void {
  return EventsOn(snapEvt(id), cb);
}
