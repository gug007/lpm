import type { PromptTone } from "./status";

export const TONE_TEXT: Record<PromptTone, string> = {
  scheduled: "text-[var(--accent-blue-text)]",
  waiting: "text-[var(--accent-amber-text)]",
  missed: "text-[var(--text-muted)]",
};
