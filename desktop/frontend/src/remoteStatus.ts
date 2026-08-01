/** The Mobile settings pane answers one question: can a paired phone reach this
 *  Mac right now. The server binds in the background, so "enabled but not
 *  running" is ambiguous — it is either still coming up or it failed. The Mac
 *  reports the failure, and this is where that decision is made so a failure
 *  never reads as an endless "Starting…". */
export type RemoteTone = "live" | "starting" | "problem" | "off";

export interface RemoteStatusInput {
  enabled: boolean;
  running: boolean;
  bindError?: string | null;
  host?: string | null;
  port: number;
}

export interface RemoteStatus {
  tone: RemoteTone;
  label: string;
  /** Where the phone connects, shown beside the label while live. */
  address: string | null;
  /** Why it isn't running, in the Mac's own words. */
  problem: string | null;
}

export interface RemoteToneStyle {
  dot: string;
  text: string;
  border: string;
  surface: string;
}

function toneStyle(accent: string, text: string): RemoteToneStyle {
  return {
    dot: accent,
    text,
    border: `color-mix(in srgb, ${accent} 45%, transparent)`,
    surface: `color-mix(in srgb, ${accent} 8%, transparent)`,
  };
}

export const REMOTE_TONE_STYLE: Record<RemoteTone, RemoteToneStyle> = {
  live: toneStyle("var(--accent-green)", "var(--text-secondary)"),
  starting: toneStyle("var(--accent-amber)", "var(--text-muted)"),
  problem: toneStyle("var(--accent-red)", "var(--accent-red-text)"),
  off: toneStyle("var(--text-muted)", "var(--text-muted)"),
};

/** The two fields that say whether the phone can get through right now. */
export interface RemoteLiveness {
  running: boolean;
  bindError: string | null;
}

/** A command answers with the settings it just wrote, but the server finishes
 *  coming up afterwards and reports that separately — so an answer can arrive
 *  describing a Mac that is already live and drag the pane back to "Starting…"
 *  with nothing left to correct it. Take everything from the answer except the
 *  liveness, which only the Mac's own report may move. */
export function mergeCommandState<T extends RemoteLiveness>(current: T, answer: T): T {
  return { ...answer, running: current.running, bindError: current.bindError };
}

/** A re-read of the settings is a full picture, so it also corrects a report the
 *  pane never received. But the read takes a moment, and the Mac can report the
 *  server coming up while it is in flight — then the read's older "not running"
 *  would land last and leave the pane waiting for a report that already came.
 *  So the Mac's report wins whenever one arrived during the read, and the read
 *  wins when none did. */
export function mergeRefreshedState<T extends RemoteLiveness>(
  current: T,
  fresh: T,
  reportedDuringRead: boolean,
): T {
  return reportedDuringRead ? mergeCommandState(current, fresh) : fresh;
}

/** Where a failed action's explanation belongs: beside the control that failed. */
export type RemoteFailureSlot = "server" | "network" | "devices";

export interface RemoteFailure {
  slot: RemoteFailureSlot;
  message: string;
}

export type RemoteAction = "server" | "tailscale" | "pair" | "revoke";

const ACTION_FAILURE: Record<RemoteAction, RemoteFailure> = {
  server: { slot: "server", message: "That change wasn't saved." },
  tailscale: { slot: "network", message: "That change wasn't saved." },
  pair: { slot: "devices", message: "Couldn't start pairing." },
  revoke: { slot: "devices", message: "That device wasn't revoked." },
};

/** The Mac rejects with a plain sentence, not an error object, so `instanceof
 *  Error` would throw every one of them away. Anything that isn't a sentence
 *  (an object, nothing at all) is dropped instead of shown as itself. */
function detail(err: unknown): string {
  const text = String(err ?? "")
    .replace(/^Error:\s*/i, "")
    .trim();
  if (!text || /^(\[object .*\]|undefined|null)$/i.test(text)) return "";
  const ended = /[.!?]$/.test(text) ? text : `${text}.`;
  return ended.charAt(0).toUpperCase() + ended.slice(1);
}

/** What the pane says when an action didn't go through: what didn't happen,
 *  plus the Mac's reason — unless the settings file itself is unreadable, which
 *  the pane is already explaining at the top and would only repeat here. */
export function commandFailure(
  action: RemoteAction,
  err: unknown,
  configError: string | null,
): RemoteFailure {
  const { slot, message } = ACTION_FAILURE[action];
  const reason = configError ? "" : detail(err);
  return { slot, message: reason ? `${message} ${reason}` : message };
}

export function remoteStatus(input: RemoteStatusInput): RemoteStatus {
  if (!input.enabled) {
    return {
      tone: "off",
      label: "Off — turn on to let a paired phone connect",
      address: null,
      problem: null,
    };
  }
  if (input.running) {
    return {
      tone: "live",
      label: "Live",
      address: input.host ? `${input.host}:${input.port}` : `port ${input.port}`,
      problem: null,
    };
  }
  const problem = input.bindError?.trim();
  if (problem) {
    return { tone: "problem", label: "Can't start", address: null, problem };
  }
  return { tone: "starting", label: "Starting…", address: null, problem: null };
}
