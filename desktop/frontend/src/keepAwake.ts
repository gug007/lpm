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

/** What the footer's keep-awake button says it is doing: "2 agents working",
 *  "42 min left", "until you turn it off". */
export function keepAwakeCupLabel(state: KeepAwakeState, left: number | null): string {
  if (state.mode === "agents" && state.agents > 0) return `${agents(state.agents)} working`;
  if (left !== null) return `${span(Math.max(1, Math.ceil(left / 60_000)))} left`;
  return "until you turn it off";
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

/** Hours and minutes from the custom fields, or null when they make no time. */
export function customMinutes(hours: string, minutes: string): number | null {
  const h = hours.trim() === "" ? 0 : Number(hours);
  const m = minutes.trim() === "" ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return total >= 1 && total <= MAX_MINUTES ? total : null;
}
