import { describe, expect, it } from "vitest";
import { chordLabel } from "./keys";
import { enterHint, primaryHint } from "./shortcutHints";
import { APP_TIPS } from "./components/appTips";
import { splitKeys } from "./components/KeyCombo";

describe("enterHint", () => {
  it("keeps the macOS return glyphs the UI has always drawn", () => {
    expect(enterHint({}, "↵", true)).toBe("↵");
    expect(enterHint({ meta: true }, "↵", true)).toBe("⌘↵");
    expect(enterHint({ shift: true }, "↵", true)).toBe("⇧↵");
    expect(enterHint({ alt: true }, "↵", true)).toBe("⌥↵");
    expect(enterHint({ meta: true }, "⏎", true)).toBe("⌘⏎");
  });

  it("spells the chord out elsewhere", () => {
    expect(enterHint({}, "↵", false)).toBe("Enter");
    expect(enterHint({ meta: true }, "↵", false)).toBe("Ctrl+Enter");
    expect(enterHint({ shift: true }, "↵", false)).toBe("Shift+Enter");
    expect(enterHint({ alt: true }, "↩", false)).toBe("Alt+Enter");
  });
});

describe("primaryHint", () => {
  it("is ⌘ on macOS and plain Ctrl elsewhere", () => {
    expect(primaryHint("s", true)).toBe("⌘S");
    expect(primaryHint("s", false)).toBe("Ctrl+S");
  });
});

describe("chord labels used across the UI", () => {
  it.each([
    [{ key: "t", meta: true }, "⌘T", "Ctrl+Shift+T"],
    [{ key: "d", meta: true, shift: true }, "⌘⇧D", "Ctrl+Alt+Shift+D"],
    [{ key: "r", meta: true, alt: true }, "⌘⌥R", "Ctrl+Alt+R"],
    [{ key: "c", meta: true, alt: true, shift: true }, "⌘⌥⇧C", "Ctrl+Alt+Shift+C"],
    [{ key: "1", meta: true }, "⌘1", "Ctrl+1"],
    [{ key: "+", meta: true }, "⌘+", "Ctrl++"],
  ])("%j reads %s on macOS and %s elsewhere", (chord, mac, pc) => {
    expect(chordLabel(chord, true)).toBe(mac);
    expect(chordLabel(chord, false)).toBe(pc);
  });
});

describe("app tips on macOS", () => {
  const kbds = (id: string) =>
    APP_TIPS.find((t) => t.id === id)!.segments.flatMap((s) => (typeof s === "string" ? [] : [s.kbd]));

  it("render the same keys as before", () => {
    expect(kbds("toggle-input")).toEqual(["⌘I"]);
    expect(kbds("newline")).toEqual(["⇧↵"]);
    expect(kbds("cycle-tabs")).toEqual(["⌘⌥←", "⌘⌥→"]);
    expect(kbds("zoom")).toEqual(["⌘+", "⌘−"]);
    expect(kbds("split")).toEqual(["⌘D", "⌘⇧D"]);
    expect(kbds("search")).toEqual(["⌘F", "↵", "⇧↵"]);
    expect(kbds("files-tab")).toEqual(["⌘⇧E", "⌘P"]);
    expect(kbds("switch-project")).toEqual(["⌘1", "⌘9"]);
    expect(APP_TIPS.some((t) => t.id === "mic-dictate")).toBe(true);
  });
});

describe("splitKeys", () => {
  it("splits glyph labels per modifier", () => {
    expect(splitKeys("⌘⇧D")).toEqual(["⌘", "⇧", "D"]);
    expect(splitKeys("⌘+")).toEqual(["⌘", "+"]);
    expect(splitKeys("Esc")).toEqual(["Esc"]);
    expect(splitKeys("")).toEqual([]);
  });

  it("splits worded labels at their pluses", () => {
    expect(splitKeys("Ctrl+Shift+T")).toEqual(["Ctrl", "Shift", "T"]);
    expect(splitKeys("Ctrl++")).toEqual(["Ctrl", "+"]);
    expect(splitKeys("Ctrl+-")).toEqual(["Ctrl", "-"]);
    expect(splitKeys("+")).toEqual(["+"]);
  });
});
