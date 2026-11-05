import { useEffect } from "react";
import { create } from "zustand";
import { LoadSkillFolds, SetSkillFold } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { NO_FOLDS, withFold, type CommandScope, type SkillFolds } from "../lpmCommands";

// Which folders each project's Skills tree holds closed. One store rather than state
// per tree, since two tabs on one project show the same folders. They arrive with the
// project's lists, so a folder and its fold land together however it moved. A click
// shows at once and saves behind it, and a tree in view reads again when a click in
// another window or on another computer announces itself.

interface SkillFoldsState {
  byProject: Record<string, SkillFolds>;
}

const useSkillFoldsStore = create<SkillFoldsState>(() => ({ byProject: {} }));

// Each project's clicks so far: an answer from before the latest one is out of date.
const clicks = new Map<string, number>();

function put(project: string, folds: SkillFolds) {
  const held = useSkillFoldsStore.getState().byProject[project];
  if (held && JSON.stringify(held) === JSON.stringify(folds)) return;
  useSkillFoldsStore.setState((s) => ({ byProject: { ...s.byProject, [project]: folds } }));
}

// Call as a read starts; give it the folds the read answered with. A computer on an
// older lpm answers with none, and what's held stands.
export function foldsReader(project: string) {
  const at = clicks.get(project);
  return (folds: SkillFolds | undefined) => {
    if (folds && clicks.get(project) === at) put(project, folds);
  };
}

function loadSkillFolds(project: string) {
  void (LoadSkillFolds(project) as Promise<SkillFolds>).then(foldsReader(project)).catch(() => {
    /* an older computer keeps none */
  });
}

// With no folder, the list's Other skills group.
export function setSkillFold(project: string, scope: CommandScope, folder: string | null, open: boolean) {
  const click = (clicks.get(project) ?? 0) + 1;
  clicks.set(project, click);
  const held = useSkillFoldsStore.getState().byProject[project] ?? NO_FOLDS;
  put(project, { ...held, [scope]: withFold(held[scope], folder, open) });
  void (SetSkillFold(project, scope, folder, open) as Promise<SkillFolds>)
    .then((saved) => {
      if (clicks.get(project) === click) put(project, saved);
    })
    .catch(() => {
      /* a convenience only: the click holds until the tree is read again */
    });
}

export function useSkillFolds(project: string, active: boolean): SkillFolds {
  const folds = useSkillFoldsStore((s) => s.byProject[project] ?? NO_FOLDS);
  useEffect(() => {
    if (!active) return;
    loadSkillFolds(project);
    return EventsOn("skill-folds-changed", () => loadSkillFolds(project));
  }, [project, active]);
  return folds;
}
