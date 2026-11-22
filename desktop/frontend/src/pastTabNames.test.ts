import { describe, expect, it, vi } from "vitest";

vi.mock("./terminals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./terminals")>()),
  getProjectTerminals: () => ({
    detailView: "terminal",
    panes: {
      kind: "split",
      a: { kind: "leaf", tabs: [{ label: "Claude Code", sessionTitle: "Fix login", resumeCmd: "claude --resume 5d0c7f3e-1111-4222-8333-944455556666" }] },
      b: { kind: "leaf", tabs: [{ label: "Deploy", resumeCmd: "codex resume 0199aa00-1111-4222-8333-944455556666" }, { label: "zsh" }] },
    },
  }),
}));

import { pastTabNames } from "./pastTabNames";
import { projectAgentRows } from "./sidebarAgents";

describe("pastTabNames", () => {
  it("names each saved agent tab by its conversation's status key", () => {
    expect(pastTabNames("bowen")).toEqual({
      "claude_code_5d0c7f3e-1111-4222-8333-944455556666": "Fix login",
      "codex_0199aa00-1111-4222-8333-944455556666": "Deploy",
    });
  });

  it("a status kept from before a restart, its tab gone, takes the saved tab's name", () => {
    const rows = projectAgentRows(
      { statusEntries: [{ key: "claude_code_5d0c7f3e-1111-4222-8333-944455556666", value: "Done", priority: 0, timestamp: 1 }] },
      2,
      {},
      pastTabNames("bowen"),
    );
    expect(rows.map((r) => r.title)).toEqual(["Fix login"]);
  });
});
