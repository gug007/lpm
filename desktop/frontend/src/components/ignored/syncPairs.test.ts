import { describe, expect, it } from "vitest";
import type { PeerClient } from "../../peer/usePeerState";
import type { ProjectInfo } from "../../types";
import { compareEnv, mask } from "./envCompare";
import { syncPairsFor } from "./syncPairs";

const peer = (slug: string, extra: Partial<PeerClient> = {}): PeerClient =>
  ({ slug, alias: `Mac ${slug}`, host: "h", port: 8766, enabled: true, connected: true, supportsIgnoredSync: true, ...extra }) as PeerClient;

const project = (name: string, root: string, extra: Partial<ProjectInfo> = {}): ProjectInfo =>
  ({ name, root, ...extra }) as ProjectInfo;

const projects = [
  project("web", "/Users/me/web"),
  project("peer-aaaaaaaa-web", "/@peer-aaaaaaaa/Users/studio/code/web"),
  project("peer-bbbbbbbb-web", "/@peer-bbbbbbbb/home/dev/web"),
  project("peer-aaaaaaaa-api", "/@peer-aaaaaaaa/Users/studio/api"),
  project("ssh-box", "", { isRemote: true }),
];

describe("syncPairsFor", () => {
  it("finds the same project on every connected computer that can sync", () => {
    const pairs = syncPairsFor("web", projects, [peer("aaaaaaaa"), peer("bbbbbbbb", { supportsIgnoredSync: false })]);
    expect(pairs).toEqual([
      { project: "web", slug: "aaaaaaaa", remoteRoot: "/Users/studio/code/web", machine: "Mac aaaaaaaa" },
    ]);
  });

  it("pairs a project on another computer with the local one of its name", () => {
    expect(syncPairsFor("peer-bbbbbbbb-web", projects, [peer("bbbbbbbb")])).toEqual([
      { project: "web", slug: "bbbbbbbb", remoteRoot: "/home/dev/web", machine: "Mac bbbbbbbb" },
    ]);
  });

  it("offers nothing without a counterpart, a connection, or local files", () => {
    expect(syncPairsFor("peer-aaaaaaaa-api", projects, [peer("aaaaaaaa")])).toEqual([]);
    expect(syncPairsFor("web", projects, [peer("aaaaaaaa", { connected: false })])).toEqual([]);
    expect(syncPairsFor("ssh-box", projects, [peer("aaaaaaaa")])).toEqual([]);
  });
});

describe("compareEnv", () => {
  it("compares key by key against the file the sync keeps", () => {
    const here = "DATABASE_URL=postgres://x\nSTRIPE=sk_old\nLEGACY=true\n# note\n";
    const there = "export DATABASE_URL=postgres://x\nSTRIPE=sk_new\nRESEND=re_1\n";
    const rows = (texts: string[], kept: number) =>
      Object.fromEntries(compareEnv(texts, kept).map((r) => [r.key, r.result]));
    expect(rows([here, there], 1)).toEqual({ DATABASE_URL: "Same", STRIPE: "Changed", LEGACY: "Removed", RESEND: "Added" });
    expect(rows([here, there], 0)).toMatchObject({ LEGACY: "Added", RESEND: "Removed" });
    const mini = "DATABASE_URL=postgres://x\nSTRIPE=sk_new\n";
    expect(rows([here, there, mini], 1)).toMatchObject({ STRIPE: "Changed", RESEND: "Added", DATABASE_URL: "Same" });
  });

  it("hides all but the ends of a value", () => {
    expect(mask("sk_test_EXAMPLE9c1d")).toBe("sk_t••••9c1d");
    expect(mask('"short"')).toBe("••••");
  });
});
