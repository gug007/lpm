// Per-terminal composer drafts. The composer is remounted per terminal (keyed
// by id), so its in-progress text, pasted images and history are snapshotted
// here on every change and restored when that terminal is shown again. This is
// deliberately a plain module Map (not a reactive store): drafts change on every
// keystroke and must not trigger React re-renders.

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
  return { id: crypto.randomUUID(), text: "", imagePaths: new Map(), imgCounter: 0, histIdx: -1 };
}

// loadComposerDraft hands back a deep clone so each composer owns an isolated
// working copy. saveComposerDraft parks that same copy by reference — the owning
// composer is its only writer and the next load clones again — so typing, which
// saves on every keystroke, never re-clones every tab's image map and the whole
// history ring.
export function loadComposerDraft(terminalId: string): ComposerDraft | undefined {
  const draft = drafts.get(terminalId);
  return draft ? cloneDraft(draft) : undefined;
}

export function saveComposerDraft(terminalId: string, draft: ComposerDraft): void {
  drafts.set(terminalId, draft);
}

export function forgetComposerDraft(terminalId: string): void {
  drafts.delete(terminalId);
}
