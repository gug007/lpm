import { create } from "zustand";
import { EventsOn } from "../../bridge/runtime";
import { REALM } from "../mirror";

// Which surface currently *owns* (renders live + drives the size of) each
// terminal. Rust is the source of truth across every window and paired phone;
// it pushes `terminal-control-changed` whenever ownership moves. A surface that
// isn't the owner shows a "take control" placeholder instead of a mis-sized
// terminal. See `src-tauri/src/control.rs`.
export interface ControlOwner {
  kind: string;
  id: string;
  label: string;
}

interface TerminalControlState {
  // undefined = not heard yet; null = Rust says nobody owns it (no conflict).
  ownerById: Record<string, ControlOwner | null>;
  setOwner: (id: string, owner: ControlOwner | null) => void;
}

const useTerminalControl = create<TerminalControlState>((set) => ({
  ownerById: {},
  setOwner: (id, owner) =>
    set((s) => ({ ownerById: { ...s.ownerById, [id]: owner } })),
}));

// Imperative listeners (InteractivePane's non-React size code) that must react
// when a terminal's owner changes — e.g. re-fit + re-drive the PTY when this
// window becomes the owner.
const controlListeners = new Set<(id: string) => void>();
export function onControlChange(cb: (id: string) => void): () => void {
  controlListeners.add(cb);
  return () => {
    controlListeners.delete(cb);
  };
}

function ownersEqual(
  a: ControlOwner | null | undefined,
  b: ControlOwner | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.kind === b.kind && a.id === b.id;
}

// Record a terminal's owner and wake the imperative listeners — from either the
// Rust broadcast or a control command's return value (a deferring present isn't
// broadcast, so the caller learns the owner from the return). Skips the store
// copy + listener fan-out when the owner is unchanged.
export function applyControlOwner(id: string, owner: ControlOwner | null): void {
  if (ownersEqual(useTerminalControl.getState().ownerById[id], owner)) return;
  useTerminalControl.getState().setOwner(id, owner);
  for (const cb of controlListeners) cb(id);
}

EventsOn(
  "terminal-control-changed",
  (m: { id?: string; owner?: ControlOwner | null }) => {
    if (!m || typeof m.id !== "string") return;
    applyControlOwner(m.id, m.owner ?? null);
  },
);

function ownerIsThisRealm(owner: ControlOwner | null | undefined): boolean {
  return !!owner && owner.kind === REALM.kind && owner.id === REALM.id;
}

// Should this window render the terminal LIVE (vs. the placeholder)? Yes when it
// owns the terminal, or while ownership is still unknown / unclaimed — so a
// single-surface terminal (the common case) never flashes a placeholder, and one
// only appears once Rust confirms another surface owns it.
function isControlledHere(owner: ControlOwner | null | undefined): boolean {
  return owner == null || ownerIsThisRealm(owner);
}

export function useIsControlled(id: string): boolean {
  return isControlledHere(useTerminalControl((s) => s.ownerById[id]));
}

export function useControlOwner(id: string): ControlOwner | null | undefined {
  return useTerminalControl((s) => s.ownerById[id]);
}

// Is this terminal currently owned by a detached (mirror) window? The owner
// (main) window scopes its flow-control ack deferral to exactly the terminals a
// mirror renders live, instead of deferring for every terminal it hosts — which
// would starve unrelated projects' and background terminals' PTYs while a mirror
// is focused. Detached surfaces register as `window`/`detached:<project>`.
export function isOwnedByDetachedWindow(id: string): boolean {
  const owner = useTerminalControl.getState().ownerById[id];
  return !!owner && owner.kind === "window" && owner.id.startsWith("detached:");
}

// May this window drive the shared PTY size? Stricter than `isControlledHere`:
// only when ownership is CONFIRMED to be this window (or explicitly unowned),
// never while it's still unknown — so two windows racing to mount can't both
// resize the one PTY before Rust has arbitrated a single owner.
export function amControlOwner(id: string): boolean {
  const owner = useTerminalControl.getState().ownerById[id];
  if (owner === undefined) return false;
  return isControlledHere(owner);
}
