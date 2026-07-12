import { createContext, useContext } from "react";
import {
  clearHistory,
  createFolder,
  deleteFolder,
  deleteMessage,
  listFolders,
  queryHistory,
  setMessageFolder,
  toggleFavorite,
  type Folder,
  type HistoryCursor,
  type HistoryFilter,
  type HistoryMessage,
} from "./messageHistory";

// The data layer the message-history popover reads through. The local source
// (below) hits the SQLite-backed bridge; a remote source (remoteHistorySource.ts)
// routes the same operations to a peer Mac over the WebSocket protocol. Provided
// through context so the popover and its portaled children (folder menu, new-folder
// input) all resolve the same source without prop-drilling, while defaulting to
// local everywhere it isn't overridden.
export interface HistorySource {
  // Namespaces the React Query cache so a peer's history never aliases the local
  // one (or another peer's). "local" for the desktop's own history.
  key: string;
  // Whether "Clear history" is offered — the peer protocol has no clear op, so
  // remote sources set this false and the button is hidden.
  supportsClear: boolean;
  queryHistory(filter: HistoryFilter, cursor: HistoryCursor | null): Promise<HistoryMessage[]>;
  listFolders(): Promise<Folder[]>;
  toggleFavorite(id: string): void;
  deleteMessage(id: string): void;
  clearHistory(filter: HistoryFilter): void;
  setMessageFolder(id: string, folderId: string | null): void;
  createFolder(name: string): Promise<Folder | null>;
  deleteFolder(id: string): void;
}

export const localHistorySource: HistorySource = {
  key: "local",
  supportsClear: true,
  queryHistory,
  listFolders,
  toggleFavorite,
  deleteMessage,
  clearHistory,
  setMessageFolder,
  createFolder,
  deleteFolder,
};

export const HistorySourceContext = createContext<HistorySource>(localHistorySource);

export function useHistorySource(): HistorySource {
  return useContext(HistorySourceContext);
}
