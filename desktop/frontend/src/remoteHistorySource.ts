import { peerRequest } from "./store/peerRequest";
import { queryClient } from "./queryClient";
import {
  COLLECTION_ALL,
  COLLECTION_DRAFTS,
  COLLECTION_FAVORITES,
  FOLDERS_KEY,
  MESSAGE_HISTORY_KEY,
  type Folder,
  type HistoryCursor,
  type HistoryFilter,
  type HistoryMessage,
} from "./store/messageHistory";
import type { HistorySource } from "./store/historySource";
import type { PeerFrame } from "./store/peers";

const TIMEOUT = 12000;

interface RemoteHistoryItem {
  id: string;
  seq: number;
  text?: string;
  images?: Record<string, string>;
  at?: number;
  timestamp?: number;
  favorite?: boolean;
  folder?: string | null;
  kind?: string;
  project?: string;
}

// A HistorySource backed by a peer Mac's message history over the remote
// protocol (historyQuery + the mutation messages). Mirrors the local source's
// shape so the popover reuses its whole UI; the cache key is namespaced per peer
// + project so it never aliases the desktop's own history.
export function makeRemoteHistorySource(peerId: string, project: string): HistorySource {
  const key = `peer:${peerId}:${project}`;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [MESSAGE_HISTORY_KEY, key] });
    void queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY, key] });
  };

  return {
    key,
    // The wire protocol has no clear-history op, so the popover hides the button.
    supportsClear: false,

    async queryHistory(filter: HistoryFilter, cursor: HistoryCursor | null): Promise<HistoryMessage[]> {
      const frame: Record<string, unknown> = { t: "historyQuery" };
      // Empty project = every project on the peer; scope "project" pins this one.
      if (filter.scope === "project") frame.project = project;
      if (filter.collection === COLLECTION_FAVORITES) frame.favoritesOnly = true;
      else if (
        filter.collection &&
        filter.collection !== COLLECTION_ALL &&
        filter.collection !== COLLECTION_DRAFTS
      )
        frame.folder = filter.collection;
      if (filter.search) frame.search = filter.search;
      if (cursor) frame.before = { at: cursor.at, seq: cursor.seq };

      const r = await peerRequest(peerId, frame, (f) => f.t === "historyQuery", TIMEOUT).catch(() => null);
      const items = ((r as PeerFrame | null)?.items as RemoteHistoryItem[]) ?? [];
      let rows: HistoryMessage[] = items.map((it) => ({
        seq: it.seq,
        id: it.id,
        text: it.text ?? "",
        projectName: it.project ?? "",
        // The wire rows carry no per-terminal id/label (history is project-scoped
        // on the peer); the popover only uses these for its footer caption.
        terminalId: "",
        terminalLabel: "",
        at: it.at ?? it.timestamp ?? 0,
        favorite: !!it.favorite,
        folderId: it.folder ?? null,
        isDraft: it.kind === "draft",
        images: it.images ?? {},
      }));
      // "Drafts" isn't a wire filter — narrow the page client-side.
      if (filter.collection === COLLECTION_DRAFTS) rows = rows.filter((m) => m.isDraft);
      return rows;
    },

    async listFolders(): Promise<Folder[]> {
      const r = await peerRequest(peerId, { t: "historyFolders" }, (f) => f.t === "historyFolders", TIMEOUT).catch(
        () => null,
      );
      return ((r as PeerFrame | null)?.folders as Folder[]) ?? [];
    },

    toggleFavorite(id: string) {
      void peerRequest(
        peerId,
        { t: "historyToggleFavorite", id },
        (f) => f.t === "historyToggleFavorite" && f.id === id,
        TIMEOUT,
      )
        .then(invalidate)
        .catch(() => {});
    },

    deleteMessage(id: string) {
      void peerRequest(peerId, { t: "historyDelete", id }, (f) => f.t === "historyDelete", TIMEOUT)
        .then(invalidate)
        .catch(() => {});
    },

    clearHistory() {
      // Unsupported over the wire; supportsClear is false so this is never called.
    },

    setMessageFolder(id: string, folderId: string | null) {
      const frame: Record<string, unknown> = { t: "historySetFolder", id };
      if (folderId) frame.folder = folderId;
      void peerRequest(peerId, frame, (f) => f.t === "historySetFolder", TIMEOUT)
        .then(invalidate)
        .catch(() => {});
    },

    async createFolder(name: string): Promise<Folder | null> {
      const r = await peerRequest(
        peerId,
        { t: "historyCreateFolder", name },
        (f) => f.t === "historyCreateFolder",
        TIMEOUT,
      ).catch(() => null);
      const frame = r as PeerFrame | null;
      if (!frame || frame.ok === false) return null;
      invalidate();
      return (frame.folder as Folder) ?? null;
    },

    deleteFolder(id: string) {
      void peerRequest(peerId, { t: "historyDeleteFolder", id }, (f) => f.t === "historyDeleteFolder", TIMEOUT)
        .then(invalidate)
        .catch(() => {});
    },
  };
}
