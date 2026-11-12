import { create } from "zustand";

// How a quick action's last run ended, shown on its button after the result
// card has closed: a pass for a while, a failure until the action runs again.
export interface ActionRunMark {
  ok: boolean;
  at: number;
  // Brings a failed run's closed card back, while its output is still kept.
  reopen?: () => void;
}

const PASSED_MARK_MS = 60_000;

interface ActionRunMarksState {
  marks: Record<string, ActionRunMark>;
}

export const useActionRunMarks = create<ActionRunMarksState>(() => ({ marks: {} }));

// Also the button's data-action-run value, which the result card opens under.
export function actionRunKey(scope: string, name: string): string {
  return `${scope}/${name}`;
}

export function markActionRun(key: string, ok: boolean, at = Date.now()) {
  useActionRunMarks.setState((s) => ({ marks: { ...s.marks, [key]: { ok, at } } }));
  if (!ok) return;
  setTimeout(() => {
    if (useActionRunMarks.getState().marks[key]?.at === at) clearActionRun(key);
  }, PASSED_MARK_MS);
}

export function setActionRunReopen(key: string, reopen: (() => void) | undefined) {
  const mark = useActionRunMarks.getState().marks[key];
  if (!mark || mark.ok || mark.reopen === reopen) return;
  useActionRunMarks.setState((s) => ({ marks: { ...s.marks, [key]: { ...mark, reopen } } }));
}

export function clearActionRun(key: string) {
  if (!useActionRunMarks.getState().marks[key]) return;
  useActionRunMarks.setState((s) => {
    const marks = { ...s.marks };
    delete marks[key];
    return { marks };
  });
}
