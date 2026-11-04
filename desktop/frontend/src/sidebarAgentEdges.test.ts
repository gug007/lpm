// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { agentsOutOfView, edgeAgentState } from "./sidebarAgentEdges";
import type { StatusEntry } from "./types";

const entry = (key: string, value: string) => ({ key, value }) as StatusEntry;
const project = (...values: string[]) => ({
  statusEntries: values.map((value, i) => entry(`agent-${i}`, value)),
});

function listWith(rows: { state?: string; top: number; height?: number }[]) {
  const list = document.createElement("nav");
  list.getBoundingClientRect = () => ({ top: 100, bottom: 400 }) as DOMRect;
  for (const { state, top, height = 30 } of rows) {
    const row = document.createElement("div");
    if (state) row.setAttribute("data-edge-agent", state);
    row.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    list.append(row);
  }
  return list;
}

describe("edgeAgentState", () => {
  it("is silent for agents nothing is waiting on", () => {
    expect(edgeAgentState([project("Done", "Idle"), project()])).toBeUndefined();
  });

  it("takes the most urgent agent across every project it folds", () => {
    expect(edgeAgentState([project("Running"), project("Error", "Waiting")])).toBe("needs-you");
    expect(edgeAgentState([project("Running", "Error")])).toBe("error");
    expect(edgeAgentState([project("Done", "Running")])).toBe("working");
  });
});

describe("agentsOutOfView", () => {
  it("says nothing while every marked row is on screen", () => {
    expect(agentsOutOfView(listWith([{ state: "working", top: 200 }]))).toEqual({});
  });

  it("sorts rows to the end they went past", () => {
    const list = listWith([
      { state: "working", top: 20 },
      { state: "error", top: 500 },
    ]);
    expect(agentsOutOfView(list)).toEqual({ above: "working", below: "error" });
  });

  it("speaks for the most urgent row on each end", () => {
    const list = listWith([
      { state: "working", top: 0 },
      { state: "needs-you", top: 40 },
      { state: "working", top: 60 },
    ]);
    expect(agentsOutOfView(list).above).toBe("needs-you");
  });

  it("keeps a row counted until less than half of it shows", () => {
    expect(agentsOutOfView(listWith([{ state: "working", top: 90 }])).above).toBeUndefined();
    expect(agentsOutOfView(listWith([{ state: "working", top: 80 }])).above).toBe("working");
    expect(agentsOutOfView(listWith([{ state: "working", top: 380 }])).below).toBeUndefined();
    expect(agentsOutOfView(listWith([{ state: "working", top: 390 }])).below).toBe("working");
  });

  it("ignores unmarked rows and rows with no box", () => {
    const list = listWith([{ top: 0 }, { state: "working", top: 0, height: 0 }]);
    expect(agentsOutOfView(list)).toEqual({});
  });
});
