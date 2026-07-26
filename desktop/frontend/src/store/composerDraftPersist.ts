// Durable layer under the in-memory composer draft store: typed-but-unsent input
// survives quitting the app. Entries are keyed by the tab's `historyKey`, never by
// the PTY `terminalId` — session restore re-launches terminals with fresh ids, so
// a terminalId-keyed entry could never be found again. The recall ring is left
// out on purpose: sent messages are already durable in message-history.db, and
// the ring is session-local.

import type { ComposerDraft, ComposerInputTab } from "./composerDrafts";

const PREFIX = "lpm:composer-draft:v1:";
const DEBOUNCE_MS = 500;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface PersistedTab {
  id: string;
  text: string;
  images: Record<string, string>;
  imgCounter: number;
}

interface PersistedDraft {
  at: number;
  activeTabId: string;
  tabs: PersistedTab[];
}

function storageKey(historyKey: string): string {
  return PREFIX + historyKey;
}

// localStorage is absent under the node test environment and can throw outright
// when storage is disabled, so every access goes through here.
function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    prune(localStorage);
    return localStorage;
  } catch {
    return null;
  }
}

let pruned = false;

// Drafts belong to tabs that may never come back; sweep the long-abandoned ones
// once per app run, on whichever access happens first.
function prune(store: Storage): void {
  if (pruned) return;
  pruned = true;
  const cutoff = Date.now() - MAX_AGE_MS;
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const at = parseEntry(store.getItem(key))?.at;
    if (typeof at !== "number" || at < cutoff) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

function parseEntry(raw: string | null): PersistedDraft | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedDraft;
    return parsed && Array.isArray(parsed.tabs) ? parsed : null;
  } catch {
    return null;
  }
}

// A tab whose recall cursor has stepped off the live draft (histIdx >= 0) is
// displaying an already-sent message; what the user actually typed is parked in
// `stash`, and that — not the recalled message — is what must come back.
function collapseTab(tab: ComposerInputTab): PersistedTab {
  if (tab.histIdx >= 0) {
    return {
      id: tab.id,
      text: tab.stash?.text ?? "",
      images: { ...(tab.stash?.images ?? {}) },
      imgCounter: tab.imgCounter,
    };
  }
  return {
    id: tab.id,
    text: tab.text,
    images: Object.fromEntries(tab.imagePaths),
    imgCounter: tab.imgCounter,
  };
}

function isEmpty(tabs: PersistedTab[]): boolean {
  return tabs.every((t) => t.text.trim() === "" && Object.keys(t.images).length === 0);
}

interface Pending {
  draft: ComposerDraft;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

function write(historyKey: string, draft: ComposerDraft): void {
  const store = storage();
  if (!store) return;
  const key = storageKey(historyKey);
  const tabs = draft.tabs.map(collapseTab);
  try {
    if (tabs.length === 0 || isEmpty(tabs)) {
      store.removeItem(key);
      return;
    }
    const payload: PersistedDraft = { at: Date.now(), activeTabId: draft.activeTabId, tabs };
    store.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

function flushPending(): void {
  for (const [historyKey, entry] of pending) {
    clearTimeout(entry.timer);
    write(historyKey, entry.draft);
  }
  pending.clear();
}

let unloadHooked = false;

function hookUnload(): void {
  if (unloadHooked || typeof window === "undefined") return;
  unloadHooked = true;
  window.addEventListener("beforeunload", flushPending);
  window.addEventListener("pagehide", flushPending);
}

// The draft is held by reference and serialized only at fire time: the composer
// keeps mutating that same object as the user types, so one timer per key covers
// every keystroke in the window without re-cloning image maps on each one.
export function schedulePersistDraft(historyKey: string, draft: ComposerDraft): void {
  hookUnload();
  const entry = pending.get(historyKey);
  if (entry) {
    entry.draft = draft;
    return;
  }
  const timer = setTimeout(() => {
    const current = pending.get(historyKey);
    pending.delete(historyKey);
    if (current) write(historyKey, current.draft);
  }, DEBOUNCE_MS);
  pending.set(historyKey, { draft, timer });
}

export function loadPersistedDraft(historyKey: string): ComposerDraft | undefined {
  const store = storage();
  if (!store) return undefined;
  const key = storageKey(historyKey);
  const raw = store.getItem(key);
  if (raw === null) return undefined;
  const parsed = parseEntry(raw);
  if (!parsed || parsed.tabs.length === 0) {
    store.removeItem(key);
    return undefined;
  }
  const tabs: ComposerInputTab[] = parsed.tabs.map((t) => ({
    id: t.id,
    text: t.text ?? "",
    imagePaths: new Map(Object.entries(t.images ?? {}).map(([n, path]) => [Number(n), path])),
    imgCounter: t.imgCounter ?? 0,
    histIdx: -1,
    stash: null,
  }));
  const activeTabId = tabs.some((t) => t.id === parsed.activeTabId)
    ? parsed.activeTabId
    : tabs[0].id;
  return { tabs, activeTabId, history: [] };
}

export function deletePersistedDraft(historyKey: string): void {
  const entry = pending.get(historyKey);
  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(historyKey);
  }
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey(historyKey));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
