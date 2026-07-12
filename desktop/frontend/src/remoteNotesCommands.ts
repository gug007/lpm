import { NotesReadFileAsInput } from "../bridge/commands";
import { nextReqId, peerRequest } from "./store/peerRequest";
import type { PeerFrame } from "./store/peers";
import type { NotesCommands, NotesAttachmentPayload } from "./notesCommands";

const NOTES_TIMEOUT = 15000;
const ATTACHMENT_TIMEOUT = 60000; // blob read/write (up to ~100MB) + save dialog

// A peer-backed NotesCommands: each op proxies to the other Mac's notes store
// (notes_cmds), which is per-project + encrypted there. Every request carries a
// `reqId` echoed verbatim so concurrent same-`t` requests (e.g. several
// attachment previews, or paged message loads) correlate by id rather than FIFO.
// readFileAsInput stays LOCAL — the dropped/pasted file lives on this machine,
// and its bytes ride the addMessage frame to the peer.
export function makeRemoteNotesCommands(peerId: string): NotesCommands {
  const call = async (frame: Record<string, unknown>, t: string, timeout = NOTES_TIMEOUT): Promise<PeerFrame> => {
    const reqId = nextReqId();
    const r = (await peerRequest(
      peerId,
      { ...frame, t, reqId },
      (f) => f.t === t && (f as PeerFrame).reqId === reqId,
      timeout,
    )) as PeerFrame;
    if (r.ok === false) throw new Error((r.error as string) || "That didn't work on the other Mac.");
    return r;
  };

  return {
    async listChats(project) {
      return ((await call({ project }, "notesChats")).chats as any[]) ?? [];
    },
    async createChat(project, title) {
      return (await call({ project, title }, "notesCreateChat")).chat;
    },
    async renameChat(project, id, title) {
      await call({ project, id, title }, "notesRenameChat");
    },
    async deleteChat(project, id) {
      await call({ project, id }, "notesDeleteChat");
    },
    async listMessages(project, chatId, limit, beforeId) {
      return (
        ((await call({ project, chatId, limit, beforeId }, "notesMessages")).messages as any[]) ?? []
      );
    },
    async addMessage(project, chatId, text, attachments: NotesAttachmentPayload[]) {
      return (await call({ project, chatId, text, attachments }, "notesAddMessage", ATTACHMENT_TIMEOUT))
        .message;
    },
    async editMessage(project, id, text) {
      await call({ project, id, text }, "notesEditMessage");
    },
    async deleteMessage(project, id) {
      await call({ project, id }, "notesDeleteMessage");
    },
    async search(project, query, limit) {
      return ((await call({ project, query, limit }, "notesSearch")).hits as any[]) ?? [];
    },
    async readAttachment(project, hash) {
      return ((await call({ project, hash }, "notesReadAttachment", ATTACHMENT_TIMEOUT)).data as string) ?? "";
    },
    async saveAttachment(project, hash, name) {
      return ((await call({ project, hash, name }, "notesSaveAttachment", ATTACHMENT_TIMEOUT)).path as string) ?? "";
    },
    readFileAsInput(path) {
      return NotesReadFileAsInput(path);
    },
  };
}
