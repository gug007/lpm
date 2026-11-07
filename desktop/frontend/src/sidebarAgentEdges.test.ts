// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { agentsOutOfView, edgeAgentsOf, edgeAgentsOfRow, edgeLinePieces, edgeLineRuns } from "./sidebarAgentEdges";
import type { StatusEntry } from "./types";

const entry = (key: string, value: string) => ({ key, value }) as StatusEntry;
const project = (...values: string[]) => ({
  statusEntries: values.map((value, i) => entry(`agent-${i}`, value)),
});

function listWith(rows: { state?: string; top: number; height?: number }[]) {
  const list = document.createElement("nav");
  list.getBoundingClientRect = () => ({ top: 100, bottom: 400, width: 259.6 }) as DOMRect;
  for (const { state, top, height = 30 } of rows) {
    const row = document.createElement("div");
    if (state) row.setAttribute("data-edge-agent", state);
    row.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    list.append(row);
  }
  return list;
}

describe("edgeAgentsOf", () => {
  it("is silent for agents nothing is waiting on", () => {
    expect(edgeAgentsOf([project("Done", "Idle"), project()])).toBeUndefined();
  });

  it("names every agent across the projects it folds", () => {
    expect(edgeAgentsOf([project("Running"), project("Error", "Waiting")])).toBe("working error needs-you");
    expect(edgeAgentsOf([project("Done", "Running")])).toBe("working");
  });
});

describe("edgeAgentsOfRow", () => {
  const row = { state: "working", shared: [] } as const;

  it("counts the agents folded into a tab", () => {
    expect(edgeAgentsOfRow({ ...row, shared: ["needs-you", "done", "working"] })).toBe("working needs-you working");
  });

  it("says nothing for a row already looked at", () => {
    expect(edgeAgentsOfRow({ state: "error", shared: ["working"], seenAt: 1 })).toBeUndefined();
  });

  it("says nothing when no agent on the row is waited on", () => {
    expect(edgeAgentsOfRow({ state: "done", shared: ["idle"] })).toBeUndefined();
  });
});

describe("agentsOutOfView", () => {
  it("says nothing while every marked row is on screen", () => {
    expect(agentsOutOfView(listWith([{ state: "working", top: 200 }]))).toEqual({ above: [], below: [], width: 260 });
  });

  it("sorts rows to the end they went past", () => {
    const list = listWith([
      { state: "working", top: 20 },
      { state: "error", top: 500 },
    ]);
    expect(agentsOutOfView(list)).toEqual({ above: ["working"], below: ["error"], width: 260 });
  });

  it("lists every agent past an end, most urgent first", () => {
    const list = listWith([
      { state: "working", top: 0 },
      { state: "error", top: 20 },
      { state: "needs-you", top: 40 },
      { state: "working", top: 60 },
    ]);
    expect(agentsOutOfView(list).above).toEqual(["needs-you", "error", "working", "working"]);
  });

  it("counts each agent a folded row stands for", () => {
    const list = listWith([{ state: "working needs-you working", top: 500 }]);
    expect(agentsOutOfView(list).below).toEqual(["needs-you", "working", "working"]);
  });

  it("keeps a row counted until less than half of it shows", () => {
    expect(agentsOutOfView(listWith([{ state: "working", top: 90 }])).above).toEqual([]);
    expect(agentsOutOfView(listWith([{ state: "working", top: 80 }])).above).toEqual(["working"]);
    expect(agentsOutOfView(listWith([{ state: "working", top: 380 }])).below).toEqual([]);
    expect(agentsOutOfView(listWith([{ state: "working", top: 390 }])).below).toEqual(["working"]);
  });

  it("ignores unmarked rows and rows with no box", () => {
    const list = listWith([{ top: 0 }, { state: "working", top: 0, height: 0 }]);
    expect(agentsOutOfView(list)).toMatchObject({ above: [], below: [] });
  });
});

describe("edgeLinePieces", () => {
  const gaps = (pieces: { start: number; end: number }[]) => pieces.slice(1).map((p, i) => p.start - pieces[i].end);

  it("fills the line with one agent", () => {
    expect(edgeLinePieces(1, 260)).toEqual([{ start: 0, end: 260 }]);
  });

  it("shares the line evenly up to five", () => {
    const pieces = edgeLinePieces(5, 258);
    expect(pieces.map((p) => p.end - p.start)).toEqual([50, 50, 50, 50, 50]);
    expect(gaps(pieces)).toEqual([2, 2, 2, 2]);
  });

  it("leaves a wider gap after every fifth piece and ends at the line's end", () => {
    const pieces = edgeLinePieces(12, 260);
    expect(gaps(pieces)).toEqual([2, 2, 2, 2, 6, 2, 2, 2, 2, 6, 2]);
    expect(pieces.at(-1)?.end).toBe(260);
    expect(pieces.every((p) => Number.isInteger(p.start) && Number.isInteger(p.end))).toBe(true);
  });

  it("leaves off the pieces that no longer fit", () => {
    const pieces = edgeLinePieces(200, 160);
    expect(pieces.length).toBeLessThan(200);
    expect(pieces.every((p) => p.end - p.start >= 2 && p.end <= 160)).toBe(true);
  });
});

describe("edgeLineRuns", () => {
  it("masks each state to its own pieces", () => {
    expect(edgeLineRuns(["needs-you", "working", "working"], 34)).toEqual([
      { tone: "needs-you", mask: "linear-gradient(90deg, transparent 0px, #000 0px 10px, transparent 10px)" },
      {
        tone: "working",
        mask: "linear-gradient(90deg, transparent 12px, #000 12px 22px, transparent 22px, transparent 24px, #000 24px 34px, transparent 34px)",
      },
    ]);
  });

  it("leaves out a state whose pieces no longer fit", () => {
    const agents = [...Array<"error">(200).fill("error"), "working" as const];
    expect(edgeLineRuns(agents, 160).map((run) => run.tone)).toEqual(["error"]);
  });
});
