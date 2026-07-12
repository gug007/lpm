import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/commands", () => ({ PeerSend: vi.fn(() => Promise.resolve()) }));

import { PeerSend } from "../../../bridge/commands";
import { resolvePeerFrame } from "../../store/peerRequest";
import {
  makeRemoteReviewSource,
  remoteGitSummary,
  remoteGitCommit,
  remoteGitBranches,
} from "./remoteReviewSource";

const mockedSend = vi.mocked(PeerSend);

afterEach(() => vi.clearAllMocks());

// The frame the source last sent, for reading a generated reqId.
function lastFrame() {
  return mockedSend.mock.calls[mockedSend.mock.calls.length - 1][1] as Record<string, unknown>;
}

describe("makeRemoteReviewSource", () => {
  it("listChanged maps the git summary's files", async () => {
    const src = makeRemoteReviewSource("peer-1", "web").working;
    const p = src.listChanged("web", "");
    resolvePeerFrame("peer-1", {
      t: "git",
      project: "web",
      ok: true,
      isRepo: true,
      files: [{ path: "a.txt", status: "modified", staged: false }],
    });
    await expect(p).resolves.toEqual([{ path: "a.txt", status: "modified", staged: false }]);
  });

  it("fetchDiffs correlates by the reqId it generated", async () => {
    const src = makeRemoteReviewSource("peer-1", "web").working;
    const p = src.fetchDiffs("web", [{ path: "a.txt" }], "");
    const reqId = lastFrame().reqId as string;
    expect(reqId).toBeTruthy();
    resolvePeerFrame("peer-1", {
      t: "gitDiffs",
      project: "web",
      reqId,
      ok: true,
      diffs: { "a.txt": { original: "old", modified: "new", binary: false, tooLarge: false } },
    });
    await expect(p).resolves.toMatchObject({ "a.txt": { modified: "new" } });
  });

  it("is read-only so the pane never saves locally", () => {
    expect(makeRemoteReviewSource("peer-1", "web").working.editable).toBe(false);
  });
});

describe("remoteGitSummary", () => {
  it("parses the summary fields", async () => {
    const p = remoteGitSummary("peer-1", "web");
    resolvePeerFrame("peer-1", {
      t: "git",
      project: "web",
      ok: true,
      isRepo: true,
      branch: "main",
      ahead: 2,
      behind: 1,
      hasUpstream: true,
      files: [],
    });
    const s = await p;
    expect(s.branch).toBe("main");
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(1);
  });
});

describe("remoteGitBranches", () => {
  it("returns the current branch and list", async () => {
    const p = remoteGitBranches("peer-1", "web");
    resolvePeerFrame("peer-1", {
      t: "gitBranches",
      project: "web",
      ok: true,
      current: "main",
      branches: [{ name: "main" }, { name: "dev", remote: "origin" }],
    });
    const r = await p;
    expect(r.current).toBe("main");
    expect(r.branches.map((b) => b.name)).toEqual(["main", "dev"]);
    expect(r.branches[1].remote).toBe("origin");
  });
});

describe("remoteGitCommit", () => {
  it("rejects with the server error on failure", async () => {
    const p = remoteGitCommit("peer-1", "web", "msg", ["a.txt"]);
    const assertion = expect(p).rejects.toThrow(/Nothing to commit/);
    resolvePeerFrame("peer-1", { t: "gitCommit", project: "web", ok: false, error: "Nothing to commit." });
    await assertion;
  });
});
