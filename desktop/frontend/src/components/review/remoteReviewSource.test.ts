import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/commands", () => ({ PeerSend: vi.fn(() => Promise.resolve()) }));

import { PeerSend } from "../../../bridge/commands";
import { resolvePeerFrame } from "../../store/peerRequest";
import {
  makeRemoteReviewSource,
  remoteGitSummary,
  remoteGitCommit,
  remoteGitBranches,
  remoteGitFetch,
  remoteGitDiscardAll,
  remoteGitGenPr,
  remoteGitCreatePr,
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

describe("remoteGitFetch", () => {
  it("sends a gitFetch frame and resolves on ok", async () => {
    const p = remoteGitFetch("peer-1", "web");
    expect(lastFrame()).toMatchObject({ t: "gitFetch", project: "web" });
    resolvePeerFrame("peer-1", { t: "gitFetch", project: "web", ok: true });
    await expect(p).resolves.toBeUndefined();
  });
});

describe("remoteGitDiscardAll", () => {
  it("rejects with the server error on failure", async () => {
    const p = remoteGitDiscardAll("peer-1", "web");
    const assertion = expect(p).rejects.toThrow(/Not a repo/);
    resolvePeerFrame("peer-1", { t: "gitDiscardAll", project: "web", ok: false, error: "Not a repo." });
    await assertion;
  });
});

describe("remoteGitGenPr", () => {
  it("returns the drafted title and body", async () => {
    const p = remoteGitGenPr("peer-1", "web");
    resolvePeerFrame("peer-1", {
      t: "gitGenPr",
      project: "web",
      ok: true,
      title: "Add feature",
      body: "Details here",
    });
    await expect(p).resolves.toEqual({ title: "Add feature", body: "Details here" });
  });
});

describe("remoteGitCreatePr", () => {
  it("sends title/body and returns the created URL", async () => {
    const p = remoteGitCreatePr("peer-1", "web", "T", "B");
    expect(lastFrame()).toMatchObject({ t: "gitCreatePr", project: "web", title: "T", body: "B" });
    resolvePeerFrame("peer-1", {
      t: "gitCreatePr",
      project: "web",
      ok: true,
      url: "https://github.com/x/y/pull/1",
    });
    await expect(p).resolves.toBe("https://github.com/x/y/pull/1");
  });
});
