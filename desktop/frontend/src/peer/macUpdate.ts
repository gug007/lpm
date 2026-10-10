import { isHostBehind } from "./hostVersion";

// Updating lpm on a paired Mac from this one: what the update is doing, and the
// line a Mac's header and row say about it.

export type MacUpdatePhase = "checking" | "downloading" | "installing" | "reconnecting" | "done";

export interface MacUpdate {
  /** The Mac's name, for what is said about it once the update ends. */
  name: string;
  phase: MacUpdatePhase;
  /** Whole percent while downloading; -1 until the size is known. */
  progress: number;
  /** What the Mac ran when the update started. A reconnect reporting anything
   *  else is the update having landed. */
  from: string;
  /** The release it is being brought up to, as far as this Mac knows. */
  target: string;
  /** It got as far as replacing the app, so the connection dropping is lpm
   *  restarting there rather than the network. */
  installed: boolean;
  cancelling: boolean;
}

export interface MacUpdatePeer {
  connected?: boolean;
  supportsSelfUpdate?: boolean;
  version?: string;
}

export interface MacUpdateLine {
  /** `available` offers the update, `busy` reports one, `done` says it landed. */
  kind: "available" | "busy" | "done";
  text: string;
  action?: { kind: "update" | "cancel"; label: string };
}

/** The release a paired Mac should be on: the newest this Mac knows of — its
 *  own, or one it has been told is out. */
export function updateTarget(appVersion: string, latestVersion: string): string {
  return isHostBehind(appVersion, latestVersion) ? latestVersion : appVersion;
}

export function macUpdateLine(
  update: MacUpdate | undefined,
  peer: MacUpdatePeer,
  target: string,
): MacUpdateLine | null {
  if (update) return progressLine(update, peer.version);
  if (!peer.connected || !peer.supportsSelfUpdate || !peer.version) return null;
  if (!isHostBehind(peer.version, target)) return null;
  return {
    kind: "available",
    text: `lpm ${peer.version} ·`,
    action: { kind: "update", label: `Update to ${target}` },
  };
}

function progressLine(update: MacUpdate, version = ""): MacUpdateLine {
  switch (update.phase) {
    case "checking":
      return cancellable(`Updating to ${update.target}`, update);
    case "downloading":
      return cancellable(
        update.progress >= 0
          ? `Downloading ${update.target} · ${update.progress}%`
          : `Downloading ${update.target}`,
        update,
      );
    case "installing":
      return { kind: "busy", text: `Installing ${update.target}…` };
    case "reconnecting":
      return { kind: "busy", text: update.installed ? "Restarting lpm there…" : "Reconnecting…" };
    case "done":
      return { kind: "done", text: `Updated to ${version || update.target}` };
  }
}

function cancellable(text: string, update: MacUpdate): MacUpdateLine {
  if (update.cancelling) return { kind: "busy", text: "Cancelling…" };
  return { kind: "busy", text: `${text} ·`, action: { kind: "cancel", label: "Cancel" } };
}

/** A step the Mac reported, applied. Nothing it says moves an update that has
 *  already lost its connection or landed. */
export function withProgress(
  update: MacUpdate,
  step: { phase?: unknown; progress?: unknown },
): MacUpdate {
  if (update.phase === "reconnecting" || update.phase === "done") return update;
  let next = update;
  if (step.phase === "checking" || step.phase === "downloading" || step.phase === "installing") {
    next = { ...next, phase: step.phase, installed: next.installed || step.phase === "installing" };
  }
  if (typeof step.progress === "number") {
    next = { ...next, phase: "downloading", progress: step.progress };
  }
  return next;
}

/** What a Mac being updated is, now that its connection reports in again:
 *  `landed` once it runs something other than what it started on, `lost` when
 *  it is back on the same lpm (the update never happened, or this Mac lost
 *  track of it), and `waiting` while it is still away. */
export function reconnectOutcome(
  update: MacUpdate,
  peer: MacUpdatePeer,
): "landed" | "lost" | "waiting" {
  if (update.phase !== "reconnecting" || !peer.connected) return "waiting";
  return peer.version && peer.version !== update.from ? "landed" : "lost";
}
