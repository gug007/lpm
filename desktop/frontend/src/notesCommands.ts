import {
  NotesAddMessage,
  NotesCreateChat,
  NotesDeleteChat,
  NotesDeleteMessage,
  NotesEditMessage,
  NotesListChats,
  NotesListMessages,
  NotesReadAttachment,
  NotesReadFileAsInput,
  NotesRenameChat,
  NotesSaveAttachment,
  NotesSearch,
} from "../bridge/commands";
import { main } from "../bridge/models";

// A base64-encoded attachment to send with a new message.
export interface NotesAttachmentPayload {
  name: string;
  mimeType: string;
  data: string;
}

// The notes data layer NotesView talks to. Defaults to the local bridge
// commands; the remote view injects a peer-backed implementation so the same
// NotesView edits the other Mac's (encrypted, per-project) notes over the wire.
// Models are the loose `any`-typed bridge shapes (chat/message/hit/attachment).
export interface NotesCommands {
  // Model-returning methods use the loose `any` bridge shapes (Chat / Message /
  // SearchHit), matching bridge/models so NotesView's field access is unchanged.
  listChats(project: string): Promise<any[]>;
  createChat(project: string, title: string): Promise<any>;
  renameChat(project: string, id: string, title: string): Promise<void>;
  deleteChat(project: string, id: string): Promise<void>;
  listMessages(project: string, chatId: string, limit: number, beforeId: string): Promise<any[]>;
  addMessage(project: string, chatId: string, text: string, attachments: NotesAttachmentPayload[]): Promise<any>;
  editMessage(project: string, id: string, text: string): Promise<void>;
  deleteMessage(project: string, id: string): Promise<void>;
  search(project: string, query: string, limit: number): Promise<any[]>;
  // Base64 of the attachment's bytes (for image previews).
  readAttachment(project: string, hash: string): Promise<string>;
  // Saves the attachment to disk, returning the path ("" if cancelled).
  saveAttachment(project: string, hash: string, name: string): Promise<string>;
  // Reads a file from THIS machine's disk into an attachment payload (the drop
  // target is always local, so this stays local even for a peer).
  readFileAsInput(path: string): Promise<any>;
}

export const bridgeNotesCommands: NotesCommands = {
  listChats: (project) => NotesListChats(project),
  createChat: (project, title) => NotesCreateChat(project, title),
  renameChat: (project, id, title) => NotesRenameChat(project, id, title),
  deleteChat: (project, id) => NotesDeleteChat(project, id),
  listMessages: (project, chatId, limit, beforeId) =>
    NotesListMessages(project, chatId, limit, beforeId),
  addMessage: (project, chatId, text, attachments) =>
    NotesAddMessage(
      project,
      chatId,
      text,
      attachments.map((a) => main.NotesAttachmentInput.createFrom(a)),
    ),
  editMessage: (project, id, text) => NotesEditMessage(project, id, text),
  deleteMessage: (project, id) => NotesDeleteMessage(project, id),
  search: (project, query, limit) => NotesSearch(project, query, limit),
  readAttachment: (project, hash) => NotesReadAttachment(project, hash),
  saveAttachment: (project, hash, name) => NotesSaveAttachment(project, hash, name),
  readFileAsInput: (path) => NotesReadFileAsInput(path),
};
