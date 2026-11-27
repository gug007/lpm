import { describe, expect, it, vi } from "vitest";

vi.mock("./InteractivePane", () => ({
  captureInteractivePaneLog: () => "ready\nGET / 200\n",
}));

import { readTerminal, serviceChip, terminalChip } from "./composerChipCapture";
import { findChips } from "./composerChips";

describe("log chips", () => {
  it("read back from their text as the chips they were built as", () => {
    for (const { text, spec } of [terminalChip("terminal", "ready\nGET / 200", {}), serviceChip("api", "GET / 500", {})]) {
      const [found] = findChips(text, { projects: new Map(), saved: new Map() });
      expect(found.spec).toEqual({ kind: spec.kind, label: spec.label, detail: spec.detail });
    }
  });
});

describe("readTerminal", () => {
  it("stamps a capture taken again with its own time", () => {
    const first = terminalChip("api", "ready", { terminalId: "t1", lines: 40 });
    const earlier = { ...first.spec, source: { ...first.spec.source, capturedAt: 1000 } };
    const again = readTerminal(earlier, 40);
    expect(again.text).toContain("GET / 200");
    expect(again.spec.source?.capturedAt).toBeGreaterThan(1000);
  });
});
