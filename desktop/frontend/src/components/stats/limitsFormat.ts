// Shared formatting for the usage-limit meters — used by both the compact
// sidebar rows (SidebarLimitRow) and the full Usage page (UsageProviderCard).

import type { LimitWindow } from "../../hooks/useAgentLimits";
import { providerMeta as statsProviderMeta } from "./statsDerive";

export const STALE_MS = 15 * 60 * 1000;

// The backend slots strictly by window duration (agent_limits.rs), so these are
// fixed and don't need to travel over the wire.
export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
export const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

function limitMeta(provider: string): { label: string; dot: string } {
  const meta = statsProviderMeta(provider);
  return { label: meta.short, dot: meta.color };
}

export const PROVIDER_META: Record<string, { label: string; dot: string }> = {
  claude: limitMeta("claude"),
  codex: limitMeta("codex"),
};

export function providerMeta(provider: string): { label: string; dot: string } {
  return PROVIDER_META[provider] ?? limitMeta(provider);
}

export type PaceVerdict = "unknown" | "early" | "under" | "on" | "over" | "exhausted";

export interface Pace {
  expired: boolean;
  elapsedPercent: number;
  ratio: number;
  verdict: PaceVerdict;
  exhaustsInMs: number | null;
}

const OVER_RATIO = 1.15;
const UNDER_RATIO = 0.85;
const MIN_ELAPSED_PERCENT = 5;

// A raw "60% used" says nothing without knowing how much of the window has
// burned down, so every percentage is judged against elapsed wall-clock time.
export function computePace(
  win: LimitWindow | undefined,
  windowMs: number,
  now: number,
): Pace | null {
  if (!win || !win.resetsAt || !(windowMs > 0)) return null;

  const resetsAtMs = win.resetsAt * 1000;
  const expired = resetsAtMs <= now;
  const elapsedMs = Math.max(0, Math.min(windowMs, windowMs - (resetsAtMs - now)));
  const elapsedPercent = (elapsedMs / windowMs) * 100;
  const usedPercent = Number.isFinite(win.usedPercent) ? win.usedPercent : NaN;

  if (Number.isNaN(usedPercent)) {
    return { expired, elapsedPercent, ratio: 0, verdict: "unknown", exhaustsInMs: null };
  }

  const ratio = elapsedPercent > 0 ? usedPercent / elapsedPercent : 0;

  let verdict: PaceVerdict;
  if (usedPercent >= 100) verdict = "exhausted";
  else if (elapsedPercent < MIN_ELAPSED_PERCENT) verdict = "early";
  else if (ratio > OVER_RATIO) verdict = "over";
  else if (ratio < UNDER_RATIO) verdict = "under";
  else verdict = "on";

  const rate = elapsedMs > 0 ? usedPercent / elapsedMs : 0;
  let exhaustsInMs: number | null = null;
  if (rate > 0 && usedPercent < 100) {
    const msToFull = (100 - usedPercent) / rate;
    if (Number.isFinite(msToFull) && now + msToFull < resetsAtMs) exhaustsInMs = msToFull;
  }

  return { expired, elapsedPercent, ratio, verdict, exhaustsInMs };
}

export function paceLabel(pace: Pace | null): string {
  switch (pace?.verdict) {
    case "over":
      return "ahead of pace";
    case "under":
      return "under pace";
    case "on":
      return "on pace";
    case "exhausted":
      return "limit reached";
    default:
      return "";
  }
}

export function barColor(pct: number): string {
  if (pct >= 95) return "var(--accent-red)";
  if (pct >= 80) return "var(--accent-amber)";
  return "var(--accent-cyan)";
}

export function fmtPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

export function resetText(resetsAt: number, now: number): string {
  if (!resetsAt) return "";
  const delta = resetsAt * 1000 - now;
  if (delta <= 0) return "resets now";
  const mins = Math.round(delta / 60000);
  if (mins < 60) return `resets in ${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `resets in ${hours}h ${rem}m` : `resets in ${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `resets in ${days}d ${remH}h` : `resets in ${days}d`;
}

export function resetAbsolute(resetsAt: number): string {
  if (!resetsAt) return "";
  return new Date(resetsAt * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function resetDurationShort(resetsAt: number, now: number): string {
  if (!resetsAt) return "";
  const delta = resetsAt * 1000 - now;
  if (delta <= 0) return "now";
  const mins = Math.round(delta / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

export function resetClock(resetsAt: number): string {
  if (!resetsAt) return "";
  const d = new Date(resetsAt * 1000);
  const mon = d.toLocaleString(undefined, { month: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${mon} ${hh}:${mm}`;
}

export function durationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

export function updatedText(updatedAt: number, now: number): string {
  const mins = Math.round((now - updatedAt) / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}

export function asOfText(updatedAt: number, now: number): string {
  const mins = Math.round((now - updatedAt) / 60000);
  if (mins < 1) return "as of just now";
  if (mins < 60) return `as of ${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `as of ${hours}h ago`;
}
