import { describe, expect, it } from "vitest";
import {
  bringChangesEntry,
  bringChangesSources,
  bringTargetBlockedReason,
  formatBytes,
} from "./bringChangesSources";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

const SLUG_A = "aaaaaaaa";
const SLUG_B = "bbbbbbbb";

function project(name: string, root: string, extra: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name,
    session: "",
    root,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
    isRemote: false,
    ...extra,
  };
}

function peer(slug: string, extra: Partial<PeerClient> = {}): PeerClient {
  return {
    slug,
    alias: `Mac ${slug[0].toUpperCase()}`,
    host: `${slug}.local`,
    port: 8766,
    enabled: true,
    connected: true,
    supportsGitBring: true,
    ...extra,
  };
}

const local = project("app", "/Users/me/app");
const onA = project(`peer-${SLUG_A}-app`, `/@peer-${SLUG_A}/Users/other/app`);
const onB = project(`peer-${SLUG_B}-app`, `/@peer-${SLUG_B}/Volumes/work/app`);

describe("bringChangesSources", () => {
  it("returns the host-native root of each connected, capable Mac", () => {
    const sources = bringChangesSources([local, onA, onB], [peer(SLUG_A), peer(SLUG_B)], "app");
    expect(sources).toEqual([
      { slug: SLUG_A, alias: "Mac A", root: "/Users/other/app" },
      { slug: SLUG_B, alias: "Mac B", root: "/Volumes/work/app" },
    ]);
  });

  it("skips disconnected Macs and builds without the feature", () => {
    expect(
      bringChangesSources([local, onA], [peer(SLUG_A, { connected: false })], "app"),
    ).toEqual([]);
    expect(
      bringChangesSources([local, onA], [peer(SLUG_A, { supportsGitBring: false })], "app"),
    ).toEqual([]);
  });

  it("skips a Mac that doesn't have a project of this name", () => {
    expect(bringChangesSources([local, onA], [peer(SLUG_A)], "other")).toEqual([]);
  });

  it("skips an SSH project, whose files don't live on that Mac", () => {
    const ssh = project(`peer-${SLUG_A}-app`, `/@peer-${SLUG_A}/srv/app`, { isRemote: true });
    expect(bringChangesSources([local, ssh], [peer(SLUG_A)], "app")).toEqual([]);
  });

  it("falls back to the host alias when the Mac has no name", () => {
    const sources = bringChangesSources([local, onA], [peer(SLUG_A, { alias: "" })], "app");
    expect(sources[0].alias).toBe(`${SLUG_A}.local`);
  });
});

describe("bringChangesEntry", () => {
  const projects = [local, onA, onB];
  const peers = [peer(SLUG_A), peer(SLUG_B)];

  it("resolves a local row to the first Mac offering the project", () => {
    const entry = bringChangesEntry(projects, peers, "app");
    expect(entry?.project.name).toBe("app");
    expect(entry?.initialSlug).toBe(SLUG_A);
    expect(entry?.sources).toHaveLength(2);
  });

  it("resolves a peer row to the same local project, preselecting that Mac", () => {
    const entry = bringChangesEntry(projects, peers, `peer-${SLUG_B}-app`);
    expect(entry?.project.name).toBe("app");
    expect(entry?.initialSlug).toBe(SLUG_B);
  });

  it("is unavailable with no matching local project", () => {
    expect(bringChangesEntry([onA], [peer(SLUG_A)], `peer-${SLUG_A}-app`)).toBeNull();
  });

  it("is unavailable for a local project no Mac has", () => {
    expect(bringChangesEntry([local, project("solo", "/Users/me/solo")], peers, "solo")).toBeNull();
  });

  it("is unavailable when the local project is an SSH project", () => {
    const ssh = project("app", "/srv/app", { isRemote: true });
    expect(bringChangesEntry([ssh, onA], [peer(SLUG_A)], "app")).toBeNull();
  });

  it("is unavailable for a duplicate, which no Mac mirrors by name", () => {
    const dup = project("app-x1y2z3", "/Users/me/app-x1y2z3", { parentName: "app" });
    expect(bringChangesEntry([local, dup, onA], [peer(SLUG_A)], "app-x1y2z3")).toBeNull();
  });
});

describe("bringTargetBlockedReason", () => {
  const target = {
    name: "app",
    root: "/Users/me/app",
    worktree: false,
    isRepo: true,
    dirty: false,
    submodules: false,
  };

  it("clears a clean repository", () => {
    expect(bringTargetBlockedReason(target)).toBeUndefined();
    expect(bringTargetBlockedReason(undefined)).toBeUndefined();
  });

  it("blocks a dirty tree and a non-repository", () => {
    expect(bringTargetBlockedReason({ ...target, dirty: true })).toMatch(/Uncommitted/);
    expect(bringTargetBlockedReason({ ...target, isRepo: false })).toMatch(/Git repository/);
  });

  it("reports the missing repository before the dirty tree", () => {
    expect(bringTargetBlockedReason({ ...target, isRepo: false, dirty: true })).toMatch(
      /Git repository/,
    );
  });
});

describe("formatBytes", () => {
  it("scales to the largest fitting unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 3.25)).toBe("3.3 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe("2 GB");
  });

  it("drops the decimal once the number is big enough to read", () => {
    expect(formatBytes(1024 * 42)).toBe("42 KB");
  });

  it("survives a missing total", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });
});
