import { chordLabel } from "./keys";

// ⌥⌘K, Ctrl+Alt+K off macOS: the tab on screen into a mini view and out again.
// ⌥⌘M would be closer to the name, but macOS gives it to Minimize All.
export const MINI_VIEW_CHORD = { key: "k", meta: true, alt: true } as const;

export const miniViewChordLabel = (): string => chordLabel(MINI_VIEW_CHORD);
