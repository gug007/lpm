import { providerMeta } from "./agentStatus";
import { formatTokenCount } from "./agentUsageFormat";
import {
  FIVE_HOUR_MS,
  STALE_MS,
  USAGE_FILL,
  WEEKLY_MS,
  computePace,
  fmtPct,
  resetDurationShort,
} from "./components/stats/limitsFormat";
import type { AgentLimitsMap, LimitWindow, ProviderLimits } from "./hooks/useAgentLimits";
import type { AgentUsageStats } from "./types";

export type UsageWindowChoice = "fiveHour" | "weekly" | "higher";

export const USAGE_TOOLS = ["claude", "codex"];
// The weekly window is the one that actually runs out on people — the 5-hour
// window refills on its own before most sessions end.
export const DEFAULT_USAGE_WINDOW: UsageWindowChoice = "weekly";

/** The ambient ~/.claude login: what a project reports under when it is not
 *  pinned to one of the accounts in ~/.lpm/accounts.json. */
const DEFAULT_ACCOUNT = "default";

/** A Claude account as the user named it, so a per-account row reads as "Work"
 *  rather than as the id its config dir is named after. */
export interface UsageAccount {
  id: string;
  label: string;
  email?: string;
}

/** One window as a lane of a row's track. */
export interface UsageLane {
  fraction: number;
  fill: string;
}

export interface UsageRow {
  /** Row identity — the account for a Claude row, the tool otherwise. Rows are
   *  keyed and hovered by this, so it is unique within a render. */
  id: string;
  provider: string;
  label: string;
  /** Extra line on the hover card: the account's signed-in email. */
  subtitle?: string;
  /** Dot colour — the tool's own, so a row is identifiable before it is read. */
  color: string;
  /** Bar colour: the calm limit tint when a window is known, the tool's own
   *  colour when the row is only reporting what it spent. */
  fill: string;
  fraction: number;
  /** How far through its window the clock is (0–1), where the bar draws its
   *  pace tick; null with no window. */
  pace: number | null;
  /** Trailing line: when the window resets, the day's spend when no window has
   *  been reported for that tool yet, or a dash for an account that is idle. */
  detail: string;
  /** How much of the window is gone, empty for a row with no window. */
  percentText: string;
  windowLabel: string;
  /** "5h" beside the reset when the numbers are about the 5-hour window;
   *  empty for the weekly one, which needs no label. */
  windowShort: string;
  /** The other window, drawn as the thin lane under the row's own; null for a
   *  row that only reports the day's spend, or whose plan has no 5-hour window,
   *  and draws a single bar. */
  lane: UsageLane | null;
  /** The other window's name and use, read out in place of its lane. */
  laneText: string;
  percent: number | null;
  tokens: number;
  sessions: number;
  fiveHour?: LimitWindow;
  weekly?: LimitWindow;
  /** The snapshot behind the row, for views that render the full card. */
  data?: ProviderLimits;
  updatedAt: number;
  stale: boolean;
}

/** One thing a row can be about: a tool, or one Claude account of it. */
interface Identity {
  id: string;
  name: string;
  subtitle?: string;
  data?: ProviderLimits;
}

function entriesFor(map: AgentLimitsMap, provider: string): ProviderLimits[] {
  return Object.values(map ?? {}).filter((entry) => entry?.provider === provider);
}

function latest(entries: ProviderLimits[]): ProviderLimits | undefined {
  let best: ProviderLimits | undefined;
  for (const entry of entries) {
    if (!best || entry.updatedAt > best.updatedAt) best = entry;
  }
  return best;
}

/** Claude reports one snapshot per account (stored as `claude:<account>`), so
 *  anything landing on the same account is the same row — newest reading wins. */
function byAccount(entries: ProviderLimits[]): Map<string, ProviderLimits> {
  const out = new Map<string, ProviderLimits>();
  for (const entry of entries) {
    const id = entry.accountId || DEFAULT_ACCOUNT;
    const prev = out.get(id);
    if (!prev || entry.updatedAt > prev.updatedAt) out.set(id, entry);
  }
  return out;
}

/** One identity per Claude account the user has: every account that reported,
 *  plus the ones they added that have not run yet. Two accounts mean two rows —
 *  they burn down separately, and a single row would just show whichever
 *  reported last. */
function claudeIdentities(map: AgentLimitsMap, accounts: UsageAccount[]): Identity[] {
  const registered = new Map(accounts.map((account) => [account.id, account]));
  // An account that is no longer registered can never report again (its pinned
  // projects fall back to the main login), so its last reading would linger as
  // a row named by a raw id until the window resets.
  const reported = new Map(
    [...byAccount(entriesFor(map, "claude"))].filter(
      ([id]) => id === DEFAULT_ACCOUNT || registered.has(id),
    ),
  );
  // With nothing reported there are no windows to split between accounts, so the
  // tool keeps the single row that falls back to the day's spend.
  if (reported.size === 0) return [{ id: "claude", name: providerMeta("claude").short }];

  // Registered accounts in the order the user added them, then the main login.
  const ids = [
    ...accounts.map((account) => account.id),
    ...(reported.has(DEFAULT_ACCOUNT) ? [DEFAULT_ACCOUNT] : []),
  ];

  return ids.map((id) => {
    const account = registered.get(id);
    return {
      id: `claude:${id}`,
      name: id === DEFAULT_ACCOUNT ? providerMeta("claude").short : account?.label || id,
      subtitle: account?.email,
      data: reported.get(id),
    };
  });
}

function identitiesFor(map: AgentLimitsMap, provider: string, accounts: UsageAccount[]): Identity[] {
  if (provider === "claude") return claudeIdentities(map, accounts);
  return [
    { id: provider, name: providerMeta(provider).short, data: latest(entriesFor(map, provider)) },
  ];
}

/** Past its reset a reading describes a window that no longer exists; the full
 *  card renders those as absent, and a sidebar row must not read as live. */
function live(win: LimitWindow | undefined, now: number): LimitWindow | undefined {
  if (!win) return undefined;
  return win.resetsAt > 0 && win.resetsAt * 1000 <= now ? undefined : win;
}

/** Where the bar draws its pace tick (0–1), or null without a window clock. */
function paceTick(win: LimitWindow | undefined, windowMs: number, now: number): number | null {
  const pace = computePace(win, windowMs, now);
  return pace ? pace.elapsedPercent / 100 : null;
}

interface PickedWindow {
  win?: LimitWindow;
  windowLabel: string;
  windowShort: string;
  windowMs: number;
}

/** The window the row's numbers are about, and the other one for its lower lane;
 *  no other one for a plan without a 5-hour window. */
function pickWindow(
  data: ProviderLimits | undefined,
  choice: UsageWindowChoice,
  now: number,
): PickedWindow & { other: PickedWindow | null } {
  const five: PickedWindow = {
    win: live(data?.fiveHour, now),
    windowLabel: "5-hour",
    windowShort: "5h",
    windowMs: FIVE_HOUR_MS,
  };
  const week: PickedWindow = {
    win: live(data?.weekly, now),
    windowLabel: "weekly",
    windowShort: "",
    windowMs: WEEKLY_MS,
  };
  const lead = (main: PickedWindow, other: PickedWindow | null) => ({ ...main, other });
  if (data?.noFiveHour) return lead(week, null);
  if (choice === "weekly") return week.win ? lead(week, five) : lead(five, week);
  if (choice === "higher" && five.win && week.win) {
    return week.win.usedPercent > five.win.usedPercent ? lead(week, five) : lead(five, week);
  }
  return five.win ? lead(five, week) : lead(week, five);
}

function laneFor(win: LimitWindow | undefined): UsageLane {
  return win ? { fraction: usedFraction(win), fill: USAGE_FILL } : { fraction: 0, fill: "" };
}

function usedFraction(win: LimitWindow): number {
  return Math.max(0, Math.min(100, win.usedPercent)) / 100;
}

function spend(stats: AgentUsageStats | null | undefined, provider: string) {
  const entry = (stats?.providers ?? []).find((row) => row.key === provider);
  return { tokens: entry?.tokens.totalTokens ?? 0, sessions: entry?.sessions ?? 0 };
}

export interface UsageRowOptions {
  tools?: string[];
  window?: UsageWindowChoice;
  /** The user's Claude accounts, for naming per-account rows. */
  accounts?: UsageAccount[];
}

/** One row per agent CLI — or per Claude account, once more than one is in play
 *  — in a fixed order so rows never swap places under the pointer. A tool
 *  appears once it has a usage window or has spent something today; tools that
 *  have done neither stay out of the sidebar entirely. */
export function usageRows(
  limits: AgentLimitsMap,
  stats: AgentUsageStats | null | undefined,
  now: number,
  options: UsageRowOptions = {},
): UsageRow[] {
  const tools = options.tools ?? USAGE_TOOLS;
  const choice = options.window ?? DEFAULT_USAGE_WINDOW;
  const accounts = options.accounts ?? [];

  const candidates = USAGE_TOOLS.filter((provider) => tools.includes(provider))
    .flatMap((provider) => {
      const identities = identitiesFor(limits, provider, accounts);
      const split = identities.length > 1;
      // The day's spend is counted per tool, not per account, so it can only
      // stand in for a tool that shows a single row.
      const spent = split ? { tokens: 0, sessions: 0 } : spend(stats, provider);
      return identities.map((identity) => ({
        provider,
        split,
        id: identity.id,
        // A tool's only row is named after the tool; account rows carry the name
        // the user gave the account, which is the only thing telling them apart.
        label: split ? identity.name : providerMeta(provider).short,
        subtitle: split ? identity.subtitle : undefined,
        data: identity.data,
        ...pickWindow(identity.data, choice, now),
        ...spent,
      }));
    })
    // An account row stays even with nothing to show — a row that vanished when
    // an account went idle would read as the account being gone.
    .filter((row) => row.win || row.tokens > 0 || row.split);

  // Rows without a window are measured against each other, since no plan
  // publishes a token budget to measure them against.
  const peak = Math.max(0, ...candidates.filter((row) => !row.win).map((row) => row.tokens));

  return candidates.map((row) => {
    const meta = providerMeta(row.provider);
    const win = row.win;
    const other = row.other?.win;
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      subtitle: row.subtitle,
      color: meta.color,
      fill: win ? USAGE_FILL : meta.color,
      fraction: win ? usedFraction(win) : peak > 0 ? row.tokens / peak : 0,
      pace: paceTick(win, row.windowMs, now),
      // Just the duration — "resets in" costs half the row and the hover card
      // spells it out anyway. The day's spend keeps its unit, which is the word
      // that makes it a token count rather than a countdown.
      detail: win
        ? resetDurationShort(win.resetsAt, now)
        : row.tokens > 0
          ? `${formatTokenCount(row.tokens)} today`
          : "—",
      percentText: win ? fmtPct(win.usedPercent) : "",
      windowLabel: win ? row.windowLabel : "",
      windowShort: win ? row.windowShort : "",
      lane: row.other && (win || row.tokens === 0) ? laneFor(other) : null,
      laneText: row.other && other ? `${row.other.windowLabel} ${fmtPct(other.usedPercent)} used` : "",
      percent: win ? win.usedPercent : null,
      tokens: row.tokens,
      sessions: row.sessions,
      fiveHour: row.data?.fiveHour,
      weekly: row.data?.weekly,
      data: row.data,
      updatedAt: row.data?.updatedAt ?? 0,
      stale: !!row.data && now - row.data.updatedAt > STALE_MS,
    };
  });
}

/** One window of one Claude account, drawn like a sidebar row's bar. */
export interface UsageMeter {
  label: string;
  fraction: number;
  fill: string;
  pace: number | null;
  percent: number;
  percentText: string;
  detail: string;
}

/** The live 5-hour and weekly windows of one Claude account (`default` is the
 *  main login), in that order; empty until the account has reported. */
export function accountMeters(limits: AgentLimitsMap, accountId: string, now: number): UsageMeter[] {
  const data = byAccount(entriesFor(limits, "claude")).get(accountId);
  const windows: [string, LimitWindow | undefined, number][] = [
    ["5h", live(data?.fiveHour, now), FIVE_HOUR_MS],
    ["7d", live(data?.weekly, now), WEEKLY_MS],
  ];
  return windows.flatMap(([label, win, windowMs]) =>
    win
      ? [
          {
            label,
            fraction: usedFraction(win),
            fill: USAGE_FILL,
            pace: paceTick(win, windowMs, now),
            percent: win.usedPercent,
            percentText: fmtPct(win.usedPercent),
            detail: resetDurationShort(win.resetsAt, now),
          },
        ]
      : [],
  );
}

export function tokensToday(stats: AgentUsageStats | null | undefined): number {
  return USAGE_TOOLS.reduce((sum, provider) => sum + spend(stats, provider).tokens, 0);
}
