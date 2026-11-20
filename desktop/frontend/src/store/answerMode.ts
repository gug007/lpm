import { create } from "zustand";
import type { AnswerKind } from "../answerKind";

// What each terminal's next prompt asks the agent to answer with: a video, an
// image or audio, one at a time. It lives outside the composer because the
// composer is keyed by terminal and remounts on every switch, which would
// otherwise drop the mode from under a half-typed prompt. Session-scoped: the
// mode covers one prompt, so there is nothing to restore.
interface AnswerModeStore {
  modes: Record<string, AnswerKind>;
  // Null goes back to a text answer.
  setMode: (terminalId: string, kind: AnswerKind | null) => void;
}

export const useAnswerMode = create<AnswerModeStore>((set) => ({
  modes: {},
  setMode: (terminalId, kind) =>
    set((s) => {
      if ((s.modes[terminalId] ?? null) === kind) return s;
      const next = { ...s.modes };
      if (kind) next[terminalId] = kind;
      else delete next[terminalId];
      return { modes: next };
    }),
}));
