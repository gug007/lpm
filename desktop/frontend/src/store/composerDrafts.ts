// Per-terminal composer drafts. The composer is remounted per terminal (keyed
// by id), so its in-progress text, pasted images and history are snapshotted
// here on every change and restored when that terminal is shown again. This is
// deliberately a plain module Map (not a reactive store): drafts change on every
// keystroke and must not trigger React re-renders.

import {
  deletePersistedDraft,
  loadPersistedDraft,
  schedulePersistDraft,
} from "./composerDraftPersist";

// One recalled (already-sent) message: the tokenized text plus the token→path
// map, so Arrow-Up recall rebuilds image chips exactly like the history popover.
export interface ComposerHistoryEntry {
  text: string; // serialized with [Image #N] tokens
  images: Record<string, string>; // token index -> local file path
}

// One prepared prompt ("input tab"). A composer can hold several at once so a
// user drafts multiple prompts and sends them one at a time; each carries its
// own text, pasted images and recall cursor.
export interface ComposerInputTab {
  id: string;
  text: string; // serialized with [Image #N] tokens
  imagePaths: Map<number, string>; // token index -> local file path
  imgCounter: number;
  histIdx: number; // -1 == live draft; 0..n-1 indexes the shared history ring
  // The unsent draft Arrow-Up recall stepped off, restored when the cursor comes
  // back down past the newest message (the field is its only other copy).
  stash: ComposerHistoryEntry | null;
}

export interface ComposerDraft {
  tabs: ComposerInputTab[];
  activeTabId: string;
  // Sent-message recall ring, shared by every input tab of this terminal.
  history: ComposerHistoryEntry[];
}

const drafts = new Map<string, ComposerDraft>();

function cloneTab(tab: ComposerInputTab): ComposerInputTab {
  return {
    id: tab.id,
    text: tab.text,
    imagePaths: new Map(tab.imagePaths),
    imgCounter: tab.imgCounter,
    histIdx: tab.histIdx,
    stash: tab.stash ? { text: tab.stash.text, images: { ...tab.stash.images } } : null,
  };
}

function cloneDraft(draft: ComposerDraft): ComposerDraft {
  return {
    tabs: draft.tabs.map(cloneTab),
    activeTabId: draft.activeTabId,
    history: draft.history.map((h) => ({ text: h.text, images: { ...h.images } })),
  };
}

export function createInputTab(): ComposerInputTab {
  return { id: crypto.randomUUID(), text: "", imagePaths: new Map(), imgCounter: 0, histIdx: -1, stash: null };
}

// loadComposerDraft hands back a deep clone so each composer owns an isolated
// working copy. saveComposerDraft parks that same copy by reference — the owning
// composer is its only writer and the next load clones again — so typing, which
// saves on every keystroke, never re-clones every tab's image map and the whole
// history ring.
//
// `historyKey` opts the draft into the on-disk layer, which is what carries it
// across an app restart (this Map only lives as long as the process). Callers
// that are disposing a session rather than closing a tab omit it, so the typed
// text is still there when the terminal comes back.
export function loadComposerDraft(terminalId: string, historyKey?: string): ComposerDraft | undefined {
  const draft = drafts.get(terminalId);
  if (draft) return cloneDraft(draft);
  return historyKey ? loadPersistedDraft(historyKey) : undefined;
}

export function saveComposerDraft(terminalId: string, draft: ComposerDraft, historyKey?: string): void {
  drafts.set(terminalId, draft);
  if (historyKey) schedulePersistDraft(historyKey, draft);
}

export function forgetComposerDraft(terminalId: string, historyKey?: string): void {
  drafts.delete(terminalId);
  if (historyKey) deletePersistedDraft(historyKey);
}

// A mounted composer registers here so an inbound remote draft (typed on the
// phone) reaches its live editor. At most one composer is mounted per terminal.
type RemoteDraftCallback = (text: string) => void;
const remoteDraftSubs = new Map<string, RemoteDraftCallback>();

export function subscribeRemoteDraft(terminalId: string, cb: RemoteDraftCallback): () => void {
  remoteDraftSubs.set(terminalId, cb);
  return () => {
    if (remoteDraftSubs.get(terminalId) === cb) remoteDraftSubs.delete(terminalId);
  };
}

// Apply a remote draft (phone-typed) to a terminal's active input. When its
// composer is mounted the callback owns the change (it writes the live editor and
// re-parks the draft, and may drop the apply if the user is actively typing);
// otherwise the parked draft is updated in place so the text is there when the
// composer next mounts.
export function applyRemoteDraft(terminalId: string, text: string): void {
  const cb = remoteDraftSubs.get(terminalId);
  if (cb) {
    cb(text);
    return;
  }
  const existing = drafts.get(terminalId);
  if (existing) {
    const active =
      existing.tabs.find((t) => t.id === existing.activeTabId) ?? existing.tabs[0];
    if (active) active.text = text;
  } else {
    const tab = createInputTab();
    tab.text = text;
    drafts.set(terminalId, { tabs: [tab], activeTabId: tab.id, history: [] });
  }
}

// A prompt handed to this terminal from another composer ("move to another
// tab"). Unlike a remote draft it never overwrites what is already typed there:
// it arrives as its own prepared prompt, so the target keeps whatever it had.
type InboundPromptCallback = (text: string, images: Record<string, string>) => void;
const inboundPromptSubs = new Map<string, InboundPromptCallback>();

export function subscribeInboundPrompt(terminalId: string, cb: InboundPromptCallback): () => void {
  inboundPromptSubs.set(terminalId, cb);
  return () => {
    if (inboundPromptSubs.get(terminalId) === cb) inboundPromptSubs.delete(terminalId);
  };
}

export function tabFromPrompt(text: string, images: Record<string, string>): ComposerInputTab {
  const tab = createInputTab();
  tab.text = text;
  for (const [token, path] of Object.entries(images)) {
    const n = Number(token);
    if (!Number.isFinite(n) || !path) continue;
    tab.imagePaths.set(n, path);
    // A later paste in the target must not hand out a token this prompt already
    // brought with it, which would point two chips at one path.
    tab.imgCounter = Math.max(tab.imgCounter, n);
  }
  return tab;
}

// Park a prompt in another terminal's composer as a new prepared prompt. A
// mounted composer takes it live (and switches to it); an unmounted one gets it
// in its parked draft, persisted under `historyKey` so a move still arrives when
// the app is quit before that terminal is ever looked at.
//
// Parking is window-local: a detached window holds its own copy of these drafts,
// so a move aimed at a tab whose composer is live in the OTHER window lands in
// this one's parked copy and is overwritten when that window next saves. A tab
// mounted here — the ordinary case — goes through the callback instead and is
// never affected.
export function deliverPromptDraft(
  terminalId: string,
  historyKey: string,
  text: string,
  images: Record<string, string>,
): void {
  const cb = inboundPromptSubs.get(terminalId);
  if (cb) {
    cb(text, images);
    return;
  }
  const tab = tabFromPrompt(text, images);
  // A tab old enough to predate history keys falls back to its pty id, which Rust
  // re-mints every launch — durable storage under that key would resurface this
  // prompt in whatever tab inherits the id next, so it stays in memory only.
  const durable = historyKey === terminalId ? undefined : historyKey;
  const draft = loadComposerDraft(terminalId, durable);
  if (draft && draft.tabs.length > 0) {
    // A lone blank prompt is the empty state, not something the user prepared;
    // the moved prompt takes its place rather than leaving an empty tab behind.
    const only = draft.tabs.length === 1 ? draft.tabs[0] : null;
    const tabs = only && only.text.trim() === "" ? [tab] : [...draft.tabs, tab];
    saveComposerDraft(terminalId, { ...draft, tabs, activeTabId: tab.id }, durable);
    return;
  }
  saveComposerDraft(terminalId, { tabs: [tab], activeTabId: tab.id, history: [] }, durable);
}
