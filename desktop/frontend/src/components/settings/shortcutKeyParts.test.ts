import { describe, expect, it } from "vitest";
import { chordKeys, shortcutKeyParts } from "./shortcutKeyParts";

describe("chordKeys", () => {
  it("splits macOS modifiers into their own keys", () => {
    expect(chordKeys("⌘⇧N")).toEqual(["⌘", "⇧", "N"]);
    expect(chordKeys("⌘+")).toEqual(["⌘", "+"]);
    expect(chordKeys("⌃⌥↓")).toEqual(["⌃", "⌥", "↓"]);
    expect(chordKeys("Esc")).toEqual(["Esc"]);
    expect(chordKeys("↑")).toEqual(["↑"]);
  });

  it("splits Ctrl+ chords, keeping a plus key", () => {
    expect(chordKeys("Ctrl+Shift+B")).toEqual(["Ctrl", "Shift", "B"]);
    expect(chordKeys("Ctrl++")).toEqual(["Ctrl", "+"]);
    expect(chordKeys("Ctrl+-")).toEqual(["Ctrl", "-"]);
  });
});

describe("shortcutKeyParts", () => {
  it("reads ranges and alternatives", () => {
    expect(shortcutKeyParts("⌘1 – ⌘9")).toEqual([{ kind: "keys", keys: ["⌘", "1–9"] }]);
    expect(shortcutKeyParts("Ctrl+1 – Ctrl+9")).toEqual([{ kind: "keys", keys: ["Ctrl", "1–9"] }]);
    expect(shortcutKeyParts("⌘1 – ⌥9")).toEqual([
      { kind: "keys", keys: ["⌘", "1"] },
      { kind: "sep", text: "–" },
      { kind: "keys", keys: ["⌥", "9"] },
    ]);
    expect(shortcutKeyParts("⌘+  ⌘−")).toEqual([
      { kind: "keys", keys: ["⌘", "+"] },
      { kind: "sep", text: "/" },
      { kind: "keys", keys: ["⌘", "−"] },
    ]);
  });
});
