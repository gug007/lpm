import type { CommandMap } from "../backend";
import { seedData } from "./state";

interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface Message {
  id: string;
  chatId: string;
  ts: number;
  text: string;
  editedAt?: number;
}

const MINUTE = 60_000;

let nextId = 1;
const id = (prefix: string) => `${prefix}-${nextId++}`;
const chats = new Map<string, Chat[]>();
const messages = new Map<string, Message[]>();

// A project with seeded notes starts with them in "General"; any other starts
// with no chats, so the page creates "General" as lpm does on first open.
function chatsOf(project: string): Chat[] {
  let list = chats.get(project);
  if (!list) {
    list = [];
    chats.set(project, list);
    const seeded = seedData().notes?.[project];
    if (seeded?.length) {
      const now = Date.now();
      const chat: Chat = { id: id("chat"), title: "General", createdAt: now - 3 * 60 * MINUTE, updatedAt: now - 12 * MINUTE };
      list.push(chat);
      messages.set(
        chat.id,
        seeded.map((text, i) => ({ id: id("note"), chatId: chat.id, ts: now - (seeded.length - i) * 47 * MINUTE, text })),
      );
    }
  }
  return list;
}

function messagesOf(chatId: string): Message[] {
  let list = messages.get(chatId);
  if (!list) {
    list = [];
    messages.set(chatId, list);
  }
  return list;
}

function findMessage(project: string, messageId: unknown): Message | undefined {
  for (const chat of chatsOf(project)) {
    const hit = messagesOf(chat.id).find((m) => m.id === messageId);
    if (hit) return hit;
  }
  return undefined;
}

export const notesCommands: CommandMap = {
  notes_list_chats: ({ project }) => [...chatsOf(String(project))].sort((a, b) => b.updatedAt - a.updatedAt),
  notes_create_chat: ({ project, title }) => {
    const now = Date.now();
    const chat: Chat = { id: id("chat"), title: String(title || "Untitled"), createdAt: now, updatedAt: now };
    chatsOf(String(project)).push(chat);
    return chat;
  },
  notes_rename_chat: ({ project, chatId, title }) => {
    const chat = chatsOf(String(project)).find((c) => c.id === chatId);
    if (chat) chat.title = String(title);
    return null;
  },
  notes_delete_chat: ({ project, chatId }) => {
    chats.set(
      String(project),
      chatsOf(String(project)).filter((c) => c.id !== chatId),
    );
    messages.delete(String(chatId));
    return null;
  },
  notes_list_messages: ({ chatId, limit, beforeId }) => {
    const list = messagesOf(String(chatId));
    const end = beforeId ? list.findIndex((m) => m.id === beforeId) : list.length;
    const stop = end < 0 ? list.length : end;
    return list.slice(Math.max(0, stop - Number(limit || list.length)), stop).reverse();
  },
  notes_add_message: ({ project, chatId, text }) => {
    const now = Date.now();
    const message: Message = { id: id("note"), chatId: String(chatId), ts: now, text: String(text) };
    messagesOf(String(chatId)).push(message);
    const chat = chatsOf(String(project)).find((c) => c.id === chatId);
    if (chat) chat.updatedAt = now;
    return message;
  },
  notes_edit_message: ({ project, id: messageId, text }) => {
    const message = findMessage(String(project), messageId);
    if (message) {
      message.text = String(text);
      message.editedAt = Date.now();
    }
    return null;
  },
  notes_delete_message: ({ project, id: messageId }) => {
    const message = findMessage(String(project), messageId);
    if (message) messages.set(message.chatId, messagesOf(message.chatId).filter((m) => m !== message));
    return null;
  },
  notes_search: ({ project, query, limit }) => {
    const needle = String(query).toLowerCase();
    return chatsOf(String(project))
      .flatMap((chat) =>
        messagesOf(chat.id)
          .filter((m) => m.text.toLowerCase().includes(needle))
          .map((m) => ({ id: m.id, chatId: chat.id, chatTitle: chat.title, ts: m.ts, snippet: m.text })),
      )
      .slice(0, Number(limit || 50));
  },
};
