import { describe, expect, it } from "vitest";

// WebKit reports isComposing === false for the Enter that commits an IME
// candidate, so key handlers ask isImeComposing() instead. These reads are on
// input events, where isComposing is right.
const INPUT_EVENT_READS: Record<string, number> = {
  "./imeComposing.ts": 1,
  "./components/InputComposer.tsx": 1,
  "./components/TerminalComposer.tsx": 1,
  "./hooks/useComposerUndo.ts": 1,
  "./terminalImeShiftFix.ts": 1,
};

const SOURCES = import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("IME-aware key handlers", () => {
  it("reads the source tree", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(500);
  });

  it("only input events read isComposing directly", () => {
    const direct = Object.entries(SOURCES)
      .map(([file, text]) => [file, (text.match(/\.isComposing\b/g) ?? []).length] as const)
      .filter(([file, n]) => n > 0 && n !== INPUT_EVENT_READS[file])
      .map(([file, n]) => `${file}: ${n}`);
    expect(direct, "use isImeComposing(e) in key handlers").toEqual([]);
  });
});
