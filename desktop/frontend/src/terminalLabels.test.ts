import { describe, it, expect } from "vitest";
import { disambiguateLabel, pickTerminalLabel } from "./terminalLabels";
import {
  makePaneLeaf,
  makeTerminal,
  type PaneLeaf,
  type PaneNode,
} from "./paneTree";

function leafWithLabels(labels: string[]): PaneLeaf {
  return makePaneLeaf(
    "pane",
    labels.map((label, i) => makeTerminal(`t${i}`, label)),
  );
}

function splitOf(a: PaneNode, b: PaneNode): PaneNode {
  return { kind: "split", direction: "row", ratio: 0.5, a, b };
}

describe("disambiguateLabel", () => {
  it("keeps the bare label when nothing is open", () => {
    expect(disambiguateLabel(null, "Ultracode")).toBe("Ultracode");
    expect(disambiguateLabel(leafWithLabels([]), "Ultracode")).toBe("Ultracode");
  });

  it("keeps the bare label for the first instance", () => {
    expect(disambiguateLabel(leafWithLabels(["Claude"]), "Ultracode")).toBe("Ultracode");
  });

  it("suffixes the second instance with 2", () => {
    expect(disambiguateLabel(leafWithLabels(["Ultracode"]), "Ultracode")).toBe("Ultracode 2");
  });

  it("numbers each further instance sequentially", () => {
    expect(disambiguateLabel(leafWithLabels(["Ultracode", "Ultracode 2"]), "Ultracode")).toBe(
      "Ultracode 3",
    );
  });

  it("refills the smallest free suffix left by a closed tab", () => {
    expect(disambiguateLabel(leafWithLabels(["Ultracode", "Ultracode 3"]), "Ultracode")).toBe(
      "Ultracode 2",
    );
  });

  it("counts identical labels across every pane in a split tree", () => {
    const tree = splitOf(leafWithLabels(["Ultracode"]), leafWithLabels(["Ultracode 2"]));
    expect(disambiguateLabel(tree, "Ultracode")).toBe("Ultracode 3");
  });

  it("treats distinct base labels independently", () => {
    expect(disambiguateLabel(leafWithLabels(["Ultracode", "Ultracode 2"]), "Claude")).toBe("Claude");
  });
});

describe("pickTerminalLabel", () => {
  it("starts at 1 for an empty tree", () => {
    expect(pickTerminalLabel(null)).toBe("Terminal 1");
  });

  it("fills the smallest unused integer", () => {
    expect(pickTerminalLabel(leafWithLabels(["Terminal 1", "Terminal 3"]))).toBe("Terminal 2");
  });
});
