import { create } from "zustand";

// Every terminal tab this window has mounted, and how to put a prompt into one.
//
// A composer submits to the terminal it sits under through the pane tree it
// belongs to. Sending a prompt to ANOTHER tab — in this project or a different
// one — has no such path: the target lives in a sibling view with its own handle
// map. Each mounted project publishes its tabs and its submit here instead, so a
// send crosses projects without either side reaching into the other.
//
// A project stays mounted once visited (App keeps it alive off-screen), so every
// tab it holds is listed whether or not it is the one on screen. A project this
// window never opened publishes nothing — which is exactly the set a picker must
// not offer: its terminals have no live pty ids yet.

export interface TerminalTargetInfo {
  id: string;
  label: string;
  emoji: string;
  // Stable per-terminal id a moved draft is parked under, so it survives a
  // restart that hands the tab a new pty id.
  historyKey: string;
}

interface TerminalTargetsState {
  byProject: Record<string, TerminalTargetInfo[]>;
  setProjectTargets: (project: string, targets: TerminalTargetInfo[]) => void;
  clearProject: (project: string) => void;
}

export const useTerminalTargets = create<TerminalTargetsState>((set) => ({
  byProject: {},

  setProjectTargets: (project, targets) =>
    set((s) => {
      const prev = s.byProject[project];
      if (prev && sameTargets(prev, targets)) return s;
      return { byProject: { ...s.byProject, [project]: targets } };
    }),

  clearProject: (project) =>
    set((s) => {
      if (!(project in s.byProject)) return s;
      const { [project]: _gone, ...byProject } = s.byProject;
      return { byProject };
    }),
}));

function sameTargets(a: TerminalTargetInfo[], b: TerminalTargetInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (t, i) =>
        t.id === b[i].id &&
        t.label === b[i].label &&
        t.emoji === b[i].emoji &&
        t.historyKey === b[i].historyKey,
    )
  );
}

// Kept out of the store: a submit isn't render state, and it must stay reachable
// from a plain call site (the picker's confirm) without a hook.
type SubmitToTerminal = (terminalId: string, input: string | string[]) => boolean;
const submitters = new Map<string, SubmitToTerminal>();

export function registerProjectSubmit(project: string, submit: SubmitToTerminal | null): void {
  if (submit) submitters.set(project, submit);
  else submitters.delete(project);
}

// True once the prompt is on its way. False means nothing was written — the tab
// closed, its session died, or a prior send is still delivering — and the caller
// must keep the prompt rather than clear it.
export function sendToTerminal(
  project: string,
  terminalId: string,
  input: string | string[],
): boolean {
  return submitters.get(project)?.(terminalId, input) ?? false;
}
