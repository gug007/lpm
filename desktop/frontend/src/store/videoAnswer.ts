import { create } from "zustand";

// Which terminals' next prompt comes back as a video. It lives outside the
// composer because the composer is keyed by terminal and remounts on every
// switch, which would otherwise drop the mode from under a half-typed prompt.
// Session-scoped: the mode covers one prompt, so there is nothing to restore.
interface VideoAnswerStore {
  on: Record<string, true>;
  setOn: (terminalId: string, on: boolean) => void;
}

export const useVideoAnswer = create<VideoAnswerStore>((set) => ({
  on: {},
  setOn: (terminalId, on) =>
    set((s) => {
      if (on === (terminalId in s.on)) return s;
      const next = { ...s.on };
      if (on) next[terminalId] = true;
      else delete next[terminalId];
      return { on: next };
    }),
}));
