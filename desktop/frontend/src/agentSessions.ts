import { ListAgentSessions } from "../bridge/commands";
import type { AgentSessionProvider } from "./agentSession";
import { agentSessionRefOf } from "./agentSession";
import { providerMeta } from "./agentStatus";
import type { SessionTitleSource } from "./paneTree";
import { cleanPrompt } from "./sessionText";
import type { PersistedHistoryEntry } from "./terminals";

// One past conversation as the agent's own store knows it.
export interface AgentSessionSummary {
  provider: AgentSessionProvider;
  sessionId: string;
  title?: string | null;
  preview?: string | null;
  updatedAt: number;
  gitBranch?: string | null;
}

export interface AgentSessionPage {
  sessions: AgentSessionSummary[];
  hasMore: boolean;
}

// Where a row's title came from, so the row can present it honestly: a real
// name reads as one, an opening prompt reads as quoted words.
export type TitleOrigin = "named" | "prompt" | "tab";

// A row in the picker: a conversation plus everything needed to relaunch it.
export interface SessionRow {
  key: string;
  provider: AgentSessionProvider | null;
  sessionId: string | null;
  title: string;
  titleOrigin: TitleOrigin;
  preview: string;
  updatedAt: number;
  gitBranch: string | null;
  resumeCmd: string;
  actionName?: string;
  label: string;
  // Whether the agent's own on-disk store backs this row. A row without one is
  // just a closed tab: no transcript to read a title or last activity from.
  storeBacked: boolean;
  // Carried from a closed tab so a name the user gave it survives the resume.
  sessionTitleId?: string;
  sessionTitleSource?: SessionTitleSource;
  // The tab this conversation is already open in, if any — resuming it a
  // second time would put two agents on one transcript.
  openInTerminalId?: string;
  // Whether lpm holds a history entry for it, so it can be forgotten.
  remembered: boolean;
}

export const SESSION_PAGE_SIZE = 40;

export async function listAgentSessions(
  projectName: string,
  limit: number,
  search: string,
): Promise<AgentSessionPage> {
  const page = (await ListAgentSessions(projectName, limit, search)) as unknown as AgentSessionPage;
  return { sessions: page?.sessions ?? [], hasMore: page?.hasMore ?? false };
}

// The command that continues a conversation the agent stores but lpm never
// launched. Options the original run carried are lost either way — resume
// replaces them — so the bare form is what a manual resume would type.
export function resumeCmdFor(session: AgentSessionSummary): string {
  return session.provider === "codex"
    ? `codex resume ${session.sessionId}`
    : `claude --resume ${session.sessionId}`;
}

function historyLabel(entry: PersistedHistoryEntry): string {
  return entry.sessionTitle || entry.label;
}

// The one-line summary a row leads with. A name the user typed outranks
// everything; otherwise the agent's title beats the opening prompt, which beats
// whatever the tab was called.
function rowTitle(
  session: AgentSessionSummary,
  entry: PersistedHistoryEntry | undefined,
): { title: string; origin: TitleOrigin } {
  if (entry?.sessionTitleSource === "manual" && entry.sessionTitle) {
    return { title: entry.sessionTitle, origin: "named" };
  }
  const named = cleanPrompt(session.title);
  if (named) return { title: named, origin: "named" };
  const prompt = cleanPrompt(session.preview);
  if (prompt) return { title: prompt, origin: "prompt" };
  return { title: entry ? historyLabel(entry) : "Untitled session", origin: "tab" };
}

interface MergeInput {
  history: PersistedHistoryEntry[];
  sessions: AgentSessionSummary[];
  // Session id → the terminal id it's live in.
  open: Map<string, string>;
  search: string;
  // Row keys the user chose to hide.
  hidden?: ReadonlySet<string>;
}

/**
 * Every resumable conversation, newest first: what the agents store on disk,
 * plus tabs lpm closed. The two overlap heavily — a tab closed here leaves a
 * transcript behind — so they're keyed by session id, with the history entry
 * supplying how to relaunch (its action, its env) and the store supplying what
 * it's about (title, prompt, last activity).
 *
 * A history entry whose command carries no session id (an agent lpm can't parse
 * a resume out of) still gets its own row: it's resumable, just not matchable.
 */
export function mergeSessionRows({
  history,
  sessions,
  open,
  search,
  hidden,
}: MergeInput): SessionRow[] {
  const byId = new Map<string, PersistedHistoryEntry>();
  const rows: SessionRow[] = [];

  for (const entry of history) {
    const ref = agentSessionRefOf(entry.resumeCmd);
    if (ref && !byId.has(ref.sessionId)) byId.set(ref.sessionId, entry);
  }

  for (const session of sessions) {
    const entry = byId.get(session.sessionId);
    const { title, origin } = rowTitle(session, entry);
    rows.push({
      key: `${session.provider}:${session.sessionId}`,
      provider: session.provider,
      sessionId: session.sessionId,
      title,
      titleOrigin: origin,
      preview: cleanPrompt(session.preview),
      // Codex can report no timestamp at all, and a 0 would sort the row under
      // a "January 1970" day header — the close time is the next best truth.
      updatedAt: session.updatedAt > 0 ? session.updatedAt : (entry?.closedAt ?? 0),
      gitBranch: session.gitBranch?.trim() || null,
      resumeCmd: entry?.resumeCmd ?? resumeCmdFor(session),
      actionName: entry?.actionName,
      label: entry?.label ?? providerMeta(session.provider).short,
      storeBacked: true,
      sessionTitleId: entry?.sessionTitleId,
      sessionTitleSource: entry?.sessionTitleSource,
      openInTerminalId: open.get(session.sessionId),
      remembered: entry !== undefined,
    });
  }

  const seen = new Set(rows.map((row) => row.sessionId));
  for (const entry of history) {
    const ref = agentSessionRefOf(entry.resumeCmd);
    if (ref && seen.has(ref.sessionId)) continue;
    rows.push({
      key: `history:${entry.resumeCmd}`,
      provider: ref?.provider ?? null,
      sessionId: ref?.sessionId ?? null,
      title: historyLabel(entry),
      titleOrigin: "tab",
      // With no transcript there is nothing this was about, and the command
      // that launched it is plumbing — say what it ran, or say nothing.
      preview: entry.actionName ? `Ran ${entry.actionName}` : "",
      updatedAt: entry.closedAt,
      gitBranch: null,
      resumeCmd: entry.resumeCmd,
      actionName: entry.actionName,
      label: entry.label,
      storeBacked: false,
      sessionTitleId: entry.sessionTitleId,
      sessionTitleSource: entry.sessionTitleSource,
      openInTerminalId: ref ? open.get(ref.sessionId) : undefined,
      remembered: true,
    });
    if (ref) seen.add(ref.sessionId);
  }

  const needle = search.trim().toLowerCase();
  // Only what the row shows, so a hit is always something the user can see —
  // `label` for a stored session is the agent's name, never rendered as text.
  const matches = (row: SessionRow) =>
    !needle ||
    [row.title, row.preview, row.gitBranch].some((field) => field?.toLowerCase().includes(needle));
  return rows
    .filter((row) => !hidden?.has(row.key))
    .filter(matches)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export type SessionFilter = "all" | AgentSessionProvider;

export function filterByProvider(rows: SessionRow[], filter: SessionFilter): SessionRow[] {
  return filter === "all" ? rows : rows.filter((row) => row.provider === filter);
}

const DAY_MS = 86_400_000;

// Rows bucketed by day so a long list stays scannable. Buckets keep the list's
// order, and the labels are relative because that's how the recent past is
// remembered — anything older falls back to its date.
export function groupByDay(rows: SessionRow[], now = Date.now()): { label: string; rows: SessionRow[] }[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: { label: string; rows: SessionRow[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(row.updatedAt, startOfToday);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

function dayLabel(at: number, startOfToday: number): string {
  if (at <= 0) return "Older";
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - DAY_MS) return "Yesterday";
  if (at >= startOfToday - 6 * DAY_MS) return "Earlier this week";
  if (at >= startOfToday - 29 * DAY_MS) return "Earlier this month";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(at));
}
