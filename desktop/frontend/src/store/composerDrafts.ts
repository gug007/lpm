// Per-terminal composer drafts. The composer is remounted per terminal (keyed
// by id), so its in-progress text, pasted images and history are snapshotted
// here on every change and restored when that terminal is shown again. This is
// deliberately a plain module Map (not a reactive store): drafts change on every
// keystroke and must not trigger React re-renders.

export interface ComposerDraft {
  text: string; // serialized with [Image #N] tokens
  imagePaths: Map<number, string>; // token index -> local file path
  imgCounter: number;
  history: string[];
  histIdx: number;
}

const drafts = new Map<string, ComposerDraft>();

export function loadComposerDraft(terminalId: string): ComposerDraft | undefined {
  return drafts.get(terminalId);
}

export function saveComposerDraft(terminalId: string, draft: ComposerDraft): void {
  drafts.set(terminalId, {
    text: draft.text,
    imagePaths: new Map(draft.imagePaths),
    imgCounter: draft.imgCounter,
    history: draft.history.slice(),
    histIdx: draft.histIdx,
  });
}

export function forgetComposerDraft(terminalId: string): void {
  drafts.delete(terminalId);
}
