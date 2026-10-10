// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const stop = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("../../../bridge/commands", () => ({ StopTerminal: stop }));

import { rememberLivePtys, stopLeftoverPtys } from "./leftoverPtys";
import { makeBrowser, makePaneLeaf, makeTerminal } from "../../paneTree";

beforeEach(() => {
  stop.mockClear();
  sessionStorage.clear();
});

describe("leftover ptys", () => {
  it("stops the project's own ptys a reload left running, once", () => {
    const tree = makePaneLeaf(
      "pane-1",
      [
        makeTerminal("api-1", "Terminal 1"),
        makeTerminal("api-2", "Shared", { peerAdopted: true }),
        makeBrowser("browser-1"),
      ],
      0,
    );
    rememberLivePtys("api", tree);
    stopLeftoverPtys("api");
    expect(stop.mock.calls).toEqual([["api-1"]]);
    stopLeftoverPtys("api");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("forgets a project whose last terminal closed", () => {
    rememberLivePtys("api", makePaneLeaf("pane-1", [makeTerminal("api-1", "T")], 0));
    rememberLivePtys("api", null);
    stopLeftoverPtys("api");
    expect(stop).not.toHaveBeenCalled();
  });
});
