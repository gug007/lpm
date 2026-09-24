import { describe, expect, it, vi } from "vitest";

vi.mock("../mirror", () => ({ IS_MIRROR_WINDOW: false }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn() }));

import { makePaneLeaf, makeTerminal, type PaneNode } from "../paneTree";
import { applyAgentSessionEvent } from "../hooks/terminals/useAgentSessionEvents";
import { prefixName } from "./markers";
import { translatePeerEventPayload } from "./router";

const SLUG = "a1b2c3d4";

const hostEvent = (provider: "claude" | "codex", sessionId: string) => ({
  project: "app",
  paneId: "app-3",
  provider,
  sessionId,
});

function applyFromHost(tree: PaneNode, event: ReturnType<typeof hostEvent>) {
  const next = applyAgentSessionEvent(
    tree,
    prefixName(SLUG, "app"),
    translatePeerEventPayload("agent-session", SLUG, event),
  );
  return next?.kind === "leaf" ? next.tabs[0] : null;
}

// The host names the project and pty in its own terms; the tab here only answers
// to the marked ones. This is what lets a peer agent tab resume its conversation
// after the host's terminal is gone.
describe("agent-session forwarded from a host", () => {
  it("makes an agent typed into a peer terminal resumable", () => {
    const tree = makePaneLeaf("pane", [makeTerminal(prefixName(SLUG, "app-3"), "Terminal")]);
    expect(applyFromHost(tree, hostEvent("claude", "c-1"))?.resumeCmd).toBe(
      "claude --resume c-1",
    );
  });

  it("builds a Codex resume command for a Codex tab", () => {
    const tree = makePaneLeaf("pane", [
      makeTerminal(prefixName(SLUG, "app-3"), "Codex", { startCmd: "codex --full-auto" }),
    ]);
    expect(applyFromHost(tree, hostEvent("codex", "x-9"))?.resumeCmd).toBe("codex resume x-9");
  });

  it("leaves another project's tab with the same host pty id alone", () => {
    const tree = makePaneLeaf("pane", [makeTerminal(prefixName(SLUG, "app-3"), "Terminal")]);
    const next = applyAgentSessionEvent(
      tree,
      prefixName("ffffffff", "app"),
      translatePeerEventPayload("agent-session", SLUG, hostEvent("claude", "c-1")),
    );
    expect(next).toBe(tree);
  });
});
