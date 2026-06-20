import {
  MessageHistoryAdd,
  MessageHistoryClear,
  MessageHistoryCreateFolder,
  MessageHistoryDeleteFolder,
  MessageHistoryFolders,
  MessageHistoryQuery,
  MessageHistorySetFolder,
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
  text: string; // serialized with "[Image #N]" tokens, as in the composer
  projectName: string;
  terminalId: string;
  terminalLabel: string;
  at: number; // epoch ms
  favorite: boolean;
  folderId: string | null;
  images: Record<string, string>; // "[Image #N]" token index -> resolved file path
}

export interface Folder {
  id: string;
  name: string;
  count: number;
}

export type HistoryScope = "terminal" | "all";

// A collection filter: "all" = no filter, "favorites", or a folder id.
export const COLLECTION_ALL = "all";
export const COLLECTION_FAVORITES = "favorites";

export interface HistoryFilter {
  scope: HistoryScope;
  terminalId: string;
  projectName: string;
  terminalLabel: string;
  collection: string;
  search: string;
}

export interface HistoryCursor {
  at: number;
  seq: number;
}

export const HISTORY_PAGE_SIZE = 60;
export const MESSAGE_HISTORY_KEY = "messageHistory";
export const FOLDERS_KEY = "messageHistoryFolders";

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

export async function listFolders(): Promise<Folder[]> {
  const folders = await MessageHistoryFolders();
  return Array.isArray(folders) ? (folders as Folder[]) : [];
}

// Messages and folder membership both affect folder counts and list contents, so
// folder membership/counts.
function invalidateHistory(): void {
  void queryClient.invalidateQueries({ queryKey: [MESSAGE_HISTORY_KEY] });
}

function invalidateFolders(): void {
  void queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY] });
}

export function recordMessage(
  entry: Pick<
    HistoryMessage,
    "text" | "projectName" | "terminalId" | "terminalLabel" | "images"
  >,
): void {
  const text = entry.text.trimEnd();
  if (!text.trim()) return;
  // The backend assigns id + timestamp (single source of truth for ordering).
  void MessageHistoryAdd({
    text,
    projectName: entry.projectName,
    terminalId: entry.terminalId,
    terminalLabel: entry.terminalLabel,
    images: entry.images,
  })
    .then(invalidateHistory)
    .catch(() => {});
}

export function toggleFavorite(id: string): void {
  void MessageHistoryToggleFavorite(id).then(invalidateHistory).catch(() => {});
}

export function clearHistory(filter: HistoryFilter): void {
  void MessageHistoryClear(
    filter.scope,
    filter.terminalId,
    filter.projectName,
    filter.terminalLabel,
  )
    .then(invalidateHistory)
    .catch(() => {});
}

export function setMessageFolder(messageId: string, folderId: string | null): void {
  void MessageHistorySetFolder(messageId, folderId)
    .then(() => {
      invalidateHistory();
      invalidateFolders();
    })
    .catch(() => {});
}

export async function createFolder(name: string): Promise<Folder | null> {
  try {
    const folder = (await MessageHistoryCreateFolder(name)) as Folder;
    invalidateFolders();
    return folder;
  } catch {
    return null;
  }
}

export function deleteFolder(id: string): void {
  void MessageHistoryDeleteFolder(id)
    .then(() => {
      invalidateHistory();
      invalidateFolders();
    })
    .catch(() => {});
}
