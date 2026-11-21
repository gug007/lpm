import { count } from "./count";
import { shortWhenLabel } from "./sendLater/time";

// Keep awake (keepawake_session.rs): keep a machine awake while agents work and
// for a while after, for a set time, or until turned off. What the backend
// reports, and how the sidebar, the menu and Settings put it into words.

export const KEEP_AWAKE_CHANGED = "keep-awake-changed";
// Five minutes before it lets go by itself (keepawake_headsup.rs): this
// machine's, and a connected one's.
export const KEEP_AWAKE_HEADS_UP = "keep-awake-heads-up";
export const PEER_KEEP_AWAKE_HEADS_UP = "peer-keep-awake-heads-up";

export type KeepAwakeMode = "off" | "agents" | "timed" | "always";
/** A mode, or "extend": more minutes on the end that is coming. */
export type KeepAwakeChoice = KeepAwakeMode | "extend";
/** What +1 h adds. */
export const EXTRA_MINUTES = 60;
export type KeepAwakePower = "unsupported" | "idle" | "failed" | "awake" | "battery" | "low";

export interface KeepAwakeState {
  supported: boolean;
  screenSupported: boolean;
  mode: KeepAwakeMode;
  active: boolean;
  agents: number;
  /** Milliseconds until a set time or the after-agents countdown ends. */
  endsIn: number | null;
  tailMinutes: number;
  screen: boolean;
  battery: boolean;
  floor: number;
  power: KeepAwakePower;
}

export interface KeepAwakePrefs {
  tailMinutes?: number;
  screen?: boolean;
  battery?: boolean;
  floor?: number;
}

export const TIME_PRESETS = [30, 60, 120, 240, 480];
/** What the chips add to a set time that is running. */
export const EXTEND_CHOICES = [30, 60, 120];
const TAIL_CHOICES = [0, 5, 15, 30];
export const FLOOR_CHOICES = [10, 20, 30, 50];
const MAX_MINUTES = 99 * 60 + 59;

const MODES: KeepAwakeMode[] = ["off", "agents", "timed", "always"];
const POWERS: KeepAwakePower[] = ["unsupported", "idle", "failed", "awake", "battery", "low"];

/** The backend's state, or null for an answer that isn't one (an older lpm). */
export function readKeepAwake(raw: unknown): KeepAwakeState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.mode !== "string" || !MODES.includes(r.mode as KeepAwakeMode)) return null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    supported: r.supported !== false,
    screenSupported: r.screenSupported === true,
    mode: r.mode as KeepAwakeMode,
    active: r.active === true,
    agents: num(r.agents, 0),
    endsIn: typeof r.endsIn === "number" ? r.endsIn : null,
    tailMinutes: num(r.tailMinutes, 5),
    screen: r.screen === true,
    battery: r.battery !== false,
    floor: num(r.floor, 20),
    power: POWERS.includes(r.power as KeepAwakePower) ? (r.power as KeepAwakePower) : "idle",
  };
}

/** "4:32" or "1:29:58", rounded up so it reads 0:01 until the very end. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "45 min", "2 h", "1 h 30 min". */
export function span(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function tailLabel(minutes: number): string {
  return minutes === 0 ? "no extra time" : span(minutes);
}

/** An after-agents chip: "None", "15m". */
export function tailChip(minutes: number): string {
  return minutes === 0 ? "None" : `${minutes}m`;
}

/** What resting on an after-agents chip says it does. */
export function tailHint(minutes: number): string {
  return minutes === 0
    ? "Can sleep as soon as the last agent finishes"
    : `Stays awake ${span(minutes)} after the last agent finishes`;
}

/** The extra times to offer, with `current` among them when it was set elsewhere. */
export function tailChoices(current: number): number[] {
  return TAIL_CHOICES.includes(current) ? TAIL_CHOICES : [...TAIL_CHOICES, current].sort((a, b) => a - b);
}

const agents = (n: number) => count(n, "agent", "agents");

/** What is left, in ms, at `now` for a state received with `endsAt`. */
export function leftAt(endsAt: number | null, now: number): number | null {
  return endsAt === null ? null : Math.max(0, endsAt - now);
}

/** A countdown as first seen: where it ends, and how long it had to run then. */
export interface CountdownSpan {
  endsAt: number;
  ms: number;
}

// Each event re-derives the end from the backend's `endsIn`, so it wobbles by
// the time the event spent in flight; only a real move — a new time, +1 h —
// starts a new span.
const SPAN_WOBBLE_MS = 2000;

/** The span `endsAt` belongs to: `prev` while it's the same countdown, else a
 *  new one measured from `now`. The backend doesn't say when a countdown began,
 *  so one already running when the app opened is measured from then. */
export function countdownSpan(prev: CountdownSpan | null, endsAt: number | null, now: number): CountdownSpan | null {
  if (endsAt === null) return null;
  if (prev && Math.abs(endsAt - prev.endsAt) <= SPAN_WOBBLE_MS) return prev;
  return { endsAt, ms: Math.max(1, endsAt - now) };
}

/** A mode is on, but the machine isn't held: on battery, at the battery limit,
 *  or the system refused. */
export function keepAwakeStopped(state: KeepAwakeState): boolean {
  return state.mode !== "off" && (state.power === "battery" || state.power === "low" || state.power === "failed");
}

/** What the footer's keep-awake button says it is doing: "2 agents working",
 *  "42 min left", "until you turn it off", "ready for the next agent". */
export function keepAwakeCupLabel(state: KeepAwakeState, left: number | null): string {
  if (keepAwakeStopped(state)) {
    if (state.power === "battery") return "on battery, so not held";
    if (state.power === "low") return `battery at ${state.floor}% or less, so not held`;
    return "couldn't keep it awake";
  }
  if (state.mode === "agents" && state.agents > 0) return `${agents(state.agents)} working`;
  if (left !== null) return `${span(Math.max(1, Math.ceil(left / 60_000)))} left`;
  if (state.mode === "agents") return "ready for the next agent";
  return "until you turn it off";
}

export interface KeepAwakeCupLook {
  /** Held: amber. Ready: on, waiting for an agent. Stopped: on, but not held. */
  tone: "held" | "ready" | "stopped";
  /** Beside the cup: how many agents hold it, or the time left after them. */
  text: string | null;
  /** A ring that drains with a set time. */
  ring: boolean;
}

/** How the footer's cup looks for this machine's state, or with this one off,
 *  for `othersOn` connected ones that are on; null when there's nothing to show. */
export function keepAwakeCup(state: KeepAwakeState | null, left: number | null, othersOn: number): KeepAwakeCupLook | null {
  if (!state || state.mode === "off") return othersOn > 0 ? { tone: "held", text: null, ring: false } : null;
  if (keepAwakeStopped(state)) return { tone: "stopped", text: "!", ring: false };
  if (!state.active) return { tone: "ready", text: null, ring: false };
  if (state.mode === "agents") {
    if (state.agents > 0) return { tone: "held", text: state.agents > 9 ? "9+" : String(state.agents), ring: false };
    return { tone: "held", text: left !== null ? clock(left) : null, ring: false };
  }
  return { tone: "held", text: null, ring: state.mode === "timed" && left !== null };
}

/** The short text beside the sidebar row: "2 agents", "4:32", "On". */
export function keepAwakeBadge(state: KeepAwakeState | null, left: number | null): string | null {
  if (!state || state.mode === "off") return null;
  switch (state.mode) {
    case "agents":
      if (state.agents > 0) return agents(state.agents);
      return left !== null ? clock(left) : "Agents";
    case "timed":
      return clock(left ?? 0);
    default:
      return "On";
  }
}

/** The sentence under the menu's title, saying what holds and until when. */
export function keepAwakeLine(state: KeepAwakeState, left: number | null, now = Date.now()): string {
  switch (state.mode) {
    case "off":
      return "Sleeps on its usual schedule.";
    case "agents": {
      if (state.agents > 0) {
        const working = `${agents(state.agents)} working.`;
        return state.tailMinutes > 0
          ? `${working} Stays awake ${span(state.tailMinutes)} after the last one finishes.`
          : `${working} Can sleep as soon as the last one finishes.`;
      }
      if (left !== null) return `Agents finished. Can sleep in ${clock(left)} unless another one starts.`;
      return "No agent is working. Stays awake when the next one starts.";
    }
    case "timed": {
      const ms = left ?? 0;
      return `Awake until ${shortWhenLabel(now + ms, now)} · ${span(Math.ceil(ms / 60_000))} left.`;
    }
    default:
      return "Awake until you turn it off.";
  }
}

export type KeepAwakeStatus = "off" | "waiting" | "awake" | "paused";

/** The pill beside the menu's title: Off, Waiting (for an agent), Awake (held
 *  now) or Paused (on, but battery or the system lets it sleep). */
export function keepAwakeStatus(state: KeepAwakeState): KeepAwakeStatus {
  if (state.mode === "off") return "off";
  if (keepAwakeStopped(state)) return "paused";
  return state.active ? "awake" : "waiting";
}

/** A short line in runs, the `strong` ones set bold. */
export type KeepAwakeWords = Array<string | { strong: string }>;

/** The line under the menu's title: what holds it, and until when. */
export function keepAwakeSummary(
  state: KeepAwakeState,
  left: number | null,
  machine: string,
  now = Date.now(),
): KeepAwakeWords {
  const stopped = keepAwakePowerNote(state, machine);
  if (stopped) return [stopped];
  switch (state.mode) {
    case "off":
      return ["Sleeps on its usual schedule"];
    case "agents":
      if (state.agents > 0) {
        return [
          { strong: agents(state.agents) },
          state.tailMinutes > 0 ? ` working · then ${span(state.tailMinutes)} more` : " working · can sleep when they finish",
        ];
      }
      if (left !== null) return ["Agents finished · can sleep in ", { strong: clock(left) }];
      return ["Turns on when an agent starts"];
    case "timed": {
      const ms = left ?? 0;
      return ["Until ", { strong: shortWhenLabel(now + ms, now) }, ` · ${span(Math.max(1, Math.ceil(ms / 60_000)))} left`];
    }
    default:
      return ["Until you turn it off or quit lpm"];
  }
}

/** Why it isn't held right now although a mode is on, if that's the case. */
export function keepAwakePowerNote(state: KeepAwakeState, thisMachine: string): string | null {
  if (state.mode === "off") return null;
  switch (state.power) {
    case "battery":
      return `On battery, so ${thisMachine} can sleep. Turn on “On battery too” to keep it awake.`;
    case "low":
      return `Battery at ${state.floor}% or less, so ${thisMachine} can sleep.`;
    case "failed":
      return `Couldn't keep ${thisMachine} awake. Turn it off and on to try again.`;
    default:
      return null;
  }
}

/** What the heads-up says, for `machine` ("This Mac", or a connected one's name). */
export function keepAwakeHeadsUp(
  machine: string,
  reason: string | undefined,
  endsIn: number,
): { title: string; description: string } {
  return {
    title: `${machine} can sleep in ${Math.max(1, Math.ceil(endsIn / 60_000))} min`,
    description:
      reason === "timed"
        ? "The time you set is running out."
        : "Agents finished, and the time after them is running out.",
  };
}

/** When the clock next reads `hours`:`minutes` after `now` (today while that's
 *  still ahead, else tomorrow), or null when the fields make no clock time. */
export function untilAt(hours: string, minutes: string, now: Date): number | null {
  const h = hours.trim() === "" ? Number.NaN : Number(hours);
  const m = minutes.trim() === "" ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** The minutes a set time needs to end at `at`, rounded up. */
export function minutesUntil(at: number, now: Date): number {
  return Math.min(MAX_MINUTES, Math.max(1, Math.ceil((at - now.getTime()) / 60_000)));
}

/** Hours and minutes from the custom fields, or null when they make no time. */
export function customMinutes(hours: string, minutes: string): number | null {
  const h = hours.trim() === "" ? 0 : Number(hours);
  const m = minutes.trim() === "" ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return total >= 1 && total <= MAX_MINUTES ? total : null;
}
