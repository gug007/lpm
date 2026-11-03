import { windowName } from "./claudePoolText";
import { fmtPct, resetDurationShort, resetText } from "./components/stats/limitsFormat";

// The account a stopped Claude tab can carry its conversation on: the one lpm
// would start new sessions on, with that account's usage.
export interface LimitStopOffer {
  account: string;
  label: string;
  fiveHour?: number;
  weekly?: number;
  // Every account with room is close to a limit; this one has the most.
  near: boolean;
}

// With no account to move to: the one that resets first.
export interface LimitStopFirstFree {
  account: string;
  label: string;
  resetsAt: number;
}

// The limit a Claude tab stopped at (claude_limit_stops.rs).
export interface LimitStop {
  kind: "limit" | "hold" | "model";
  account: string;
  accountLabel: string;
  window?: "fiveHour" | "weekly";
  model?: string;
  // Unix seconds; 0 when Claude Code gave none.
  resetsAt: number;
  offer?: LimitStopOffer;
  firstFree?: LimitStopFirstFree;
}

export function limitStopHeadline(stop: LimitStop): string {
  const who = stop.accountLabel;
  if (stop.kind === "hold") return `${who} was put on hold`;
  if (stop.kind === "model") return `${who} hit its weekly ${stop.model ?? "model"} limit`;
  return `${who} hit its ${windowName(stop.window ?? null)}`;
}

// "resets in 2d 14h", or "" for a hold or an unknown reset.
export function limitStopReset(stop: LimitStop, now: number): string {
  return resetText(stop.resetsAt, now);
}

function usage(offer: LimitStopOffer): string {
  const parts: string[] = [];
  if (offer.fiveHour !== undefined) parts.push(`5-hour ${fmtPct(offer.fiveHour)}`);
  if (offer.weekly !== undefined) parts.push(`weekly ${fmtPct(offer.weekly)}`);
  return parts.join(" · ");
}

// The bar's second line: where the conversation can go, or why it can't.
export function limitStopDetail(stop: LimitStop, now: number): string {
  if (stop.kind === "hold") {
    return "Account switching is paused. Conversations stay on their account until you turn switching back on.";
  }
  if (stop.kind === "model") return "This account still works with other models. Type /model to switch.";
  if (stop.offer) {
    const room = stop.offer.near ? "has the most room" : "has room";
    const used = usage(stop.offer);
    return used ? `${stop.offer.label} ${room} · ${used}` : `${stop.offer.label} ${room}`;
  }
  if (stop.firstFree) {
    const span = resetDurationShort(stop.firstFree.resetsAt, now);
    const when = span === "now" ? "now" : `in ${span}`;
    return span
      ? `Every account is at a limit. ${stop.firstFree.label} resets first, ${when}.`
      : "Every account is at a limit.";
  }
  return "No other account in your list has room.";
}

// A limit or model stop is over once its window resets; a hold, which has no
// reset, lasts until the Mac says otherwise.
export function limitStopHolds(stop: LimitStop, now: number): boolean {
  return !stop.resetsAt || stop.resetsAt * 1000 > now;
}
