// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestClaudeTabMoves, useClaudeTabMoveRequests, useClaudeTabMoves } from "./claudeTabMoves";

let host: HTMLDivElement;
let root: Root;

function Mover({ project, move }: { project: string; move: (id: string, account: string) => Promise<void> }) {
  useClaudeTabMoveRequests(project, move);
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useClaudeTabMoves.setState({ pending: [] });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useClaudeTabMoveRequests", () => {
  it("moves its project's tabs one at a time, once", async () => {
    const order: string[] = [];
    let finishFirst = () => {};
    const move = vi.fn((id: string) => {
      order.push(`start ${id}`);
      return id === "t1"
        ? new Promise<void>((done) => {
            finishFirst = () => {
              order.push("end t1");
              done();
            };
          })
        : Promise.resolve();
    });
    act(() => root.render(<Mover project="lpm" move={move} />));

    await act(async () => {
      requestClaudeTabMoves("other", ["x"], "side");
      requestClaudeTabMoves("lpm", ["t1", "t2"], "side");
    });
    expect(order).toEqual(["start t1"]);

    await act(async () => finishFirst());
    expect(order).toEqual(["start t1", "end t1", "start t2"]);
    expect(move).toHaveBeenCalledWith("t2", "side");
    expect(move).toHaveBeenCalledTimes(2);
    expect(useClaudeTabMoves.getState().pending).toEqual([{ projectName: "other", ids: ["x"], account: "side" }]);
  });

  it("keeps going after a move fails", async () => {
    const move = vi.fn((id: string) => (id === "t1" ? Promise.reject(new Error("no")) : Promise.resolve()));
    act(() => root.render(<Mover project="lpm" move={move} />));
    await act(async () => requestClaudeTabMoves("lpm", ["t1", "t2"], "side"));
    expect(move).toHaveBeenCalledWith("t2", "side");
  });
});
