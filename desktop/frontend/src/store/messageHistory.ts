import {
  MessageHistoryAdd,
  MessageHistoryClear,
  MessageHistoryQuery,
  MessageHistoryToggleFavorite,
} from "../../bridge/commands";
import { queryClient } from "../queryClient";

// Terminal composer message history is stored in SQLite (~/.lpm/message-history.db)
// via the backend commands. This module is a thin typed client: the popover pages
// results with keyset pagination through React Query, and every mutation
// invalidates that cache so open lists refetch. There's no in-memory mirror — the
// database is the single source of truth, which keeps it correct across windows.

export interface HistoryMessage {
  seq: number; // monotonic row id; stable sort key and React key
  id: string;
  text: string; // resolved text (real image paths inlined), as it was sent
  projectName: string;
  terminalId: string;
  terminalLabel: string;
  at: number; // epoch ms
  favorite: boolean;
}

export type HistoryScope = "terminal" | "all";

export interface HistoryFilter {
  scope: HistoryScope;
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  favoritesOnly: boolean;
  search: string;
}

export interface HistoryCursor {
  at: number;
  seq: number;
}

export const HISTORY_PAGE_SIZE = 60;
export const MESSAGE_HISTORY_KEY = "messageHistory";

// Fetch one page newest-first; pass the last row's {at, seq} as the cursor to get
// the next page.
export async function queryHistory(
  filter: HistoryFilter,
  cursor: HistoryCursor | null,
): Promise<HistoryMessage[]> {
  const rows = await MessageHistoryQuery({
    ...filter,
    cursorAt: cursor?.at ?? null,
    cursorSeq: cursor?.seq ?? null,
    limit: HISTORY_PAGE_SIZE,
  });
  return Array.isArray(rows) ? (rows as HistoryMessage[]) : [];
}

function invalidate(): void {
  void queryClient.invalidateQueries({ queryKey: [MESSAGE_HISTORY_KEY] });
}

export function recordMessage(
  entry: Pick<HistoryMessage, "text" | "projectName" | "terminalId" | "terminalLabel">,
): void {
  const text = entry.text.trimEnd();
  if (!text.trim()) return;
  // The backend assigns id + timestamp (single source of truth for ordering).
  void MessageHistoryAdd({
    text,
    projectName: entry.projectName,
    terminalId: entry.terminalId,
    terminalLabel: entry.terminalLabel,
  })
    .then(invalidate)
    .catch(() => {});
}

export function toggleFavorite(id: string): void {
  void MessageHistoryToggleFavorite(id)
    .then(invalidate)
    .catch(() => {});
}

export function clearHistory(filter: HistoryFilter): void {
  void MessageHistoryClear(
    filter.scope,
    filter.terminalId,
    filter.projectName,
    filter.terminalLabel,
  )
    .then(invalidate)
    .catch(() => {});
}
