import { describe, expect, it } from "vitest";
import { buildPeerSections, followForRow } from "./peerSections";
import { prefixName, prefixRoot } from "../peer/markers";
import type { FollowState } from "../followApi";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

const SLUG = "aaaaaaaa";
const REMOTE_ROOT = "/Users/other/Projects/lpm";

function project(name: string, root: string): ProjectInfo {
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
  };
}

function remote(name: string, hostPath: string): ProjectInfo {
  return project(prefixName(SLUG, name), prefixRoot(SLUG, hostPath));
}

function peer(overrides: Partial<PeerClient> = {}): PeerClient {
  return {
    slug: SLUG,
    alias: "Studio",
    host: "192.168.0.2",
    port: 8766,
    enabled: true,
    connected: true,
    ...overrides,
  };
}

function follow(project: string, sourceRoot: string, slug = SLUG): FollowState {
  return { project, slug, sourceRoot, lastSyncedAt: 0, files: 0, syncing: false };
}

function follows(...list: FollowState[]): Map<string, FollowState> {
  return new Map(list.map((f) => [f.project, f]));
}

const copy = project("lpm-sync", "/Users/me/Projects/lpm-sync");

describe("buildPeerSections", () => {
  it("marks the remote row a copy belongs to, and hides the copy locally", () => {
    const { sections, hostedRemotely } = buildPeerSections(
      [copy, remote("lpm", REMOTE_ROOT)],
      follows(follow("lpm-sync", REMOTE_ROOT)),
      [peer()],
    );
    expect(sections[0].mirrors.get(REMOTE_ROOT)).toBe(copy);
    expect(sections[0].strays).toEqual([]);
    expect(hostedRemotely.has("lpm-sync")).toBe(true);
  });

  // Running and testing here is the whole point of a copy, so it cannot vanish
  // with the Mac it came from.
  it("gives a copy its own row under a Mac that is away", () => {
    const { sections, hostedRemotely } = buildPeerSections(
      [copy],
      follows(follow("lpm-sync", REMOTE_ROOT)),
      [peer({ connected: false })],
    );
    expect(sections[0].connected).toBe(false);
    expect(sections[0].strays).toEqual([
      { project: copy, label: "lpm", follow: follow("lpm-sync", REMOTE_ROOT) },
    ]);
    expect(hostedRemotely.has("lpm-sync")).toBe(true);
  });

  // Same reasoning as an absent Mac: no row to mark means the copy needs one.
  it("gives a copy its own row when its folder is no longer listed over there", () => {
    const { sections } = buildPeerSections(
      [copy, remote("other", "/Users/other/Projects/other")],
      follows(follow("lpm-sync", REMOTE_ROOT)),
      [peer()],
    );
    expect(sections[0].mirrors.size).toBe(0);
    expect(sections[0].strays.map((s) => s.label)).toEqual(["lpm"]);
  });

  it("leaves a copy in the local list when its Mac is no longer paired", () => {
    const { sections, hostedRemotely } = buildPeerSections(
      [copy],
      follows(follow("lpm-sync", REMOTE_ROOT)),
      [],
    );
    expect(sections).toEqual([]);
    expect(hostedRemotely.size).toBe(0);
  });

  it("keeps several copies from one Mac apart by their folder", () => {
    const web = project("web-sync", "/Users/me/Projects/web-sync");
    const webRoot = "/Users/other/Projects/web";
    const { sections, hostedRemotely } = buildPeerSections(
      [copy, web, remote("lpm", REMOTE_ROOT), remote("web", webRoot)],
      follows(follow("lpm-sync", REMOTE_ROOT), follow("web-sync", webRoot)),
      [peer()],
    );
    expect(sections[0].mirrors.get(REMOTE_ROOT)).toBe(copy);
    expect(sections[0].mirrors.get(webRoot)).toBe(web);
    expect(hostedRemotely).toEqual(new Set(["lpm-sync", "web-sync"]));
  });

  it("ignores a record whose project is already gone", () => {
    const { sections, hostedRemotely } = buildPeerSections(
      [remote("lpm", REMOTE_ROOT)],
      follows(follow("lpm-sync", REMOTE_ROOT)),
      [peer()],
    );
    expect(sections[0].mirrors.size).toBe(0);
    expect(sections[0].strays).toEqual([]);
    expect(hostedRemotely.size).toBe(0);
  });

  it("keeps a connected Mac's section even with nothing in it", () => {
    const { sections } = buildPeerSections([], new Map(), [peer()]);
    expect(sections).toHaveLength(1);
    expect(sections[0].projects).toEqual([]);
  });

  it("drops a section for an away Mac with no copies here", () => {
    const { sections } = buildPeerSections([], new Map(), [peer({ connected: false })]);
    expect(sections).toEqual([]);
  });

  it("carries the machine's platform and state for its header", () => {
    const { sections } = buildPeerSections([], new Map(), [peer({ platform: "linux" })]);
    expect(sections[0].linuxHost).toBe(true);
    expect(sections[0].status).toEqual({ tone: "live", text: "Connected", detail: "" });
  });

  it("reads an unknown platform as a Mac, and a failure as an error", () => {
    const { sections } = buildPeerSections([copy], follows(follow("lpm-sync", REMOTE_ROOT)), [
      peer({ connected: false, lastError: "Connection refused (os error 61)" }),
    ]);
    expect(sections[0].linuxHost).toBe(false);
    expect(sections[0].status.tone).toBe("error");
    expect(sections[0].status.text).toBe("Refused the connection — lpm may not be running there");
  });
});

describe("followForRow", () => {
  const remoteRow = remote("lpm", REMOTE_ROOT);
  const all = [copy, remoteRow];
  const map = follows(follow("lpm-sync", REMOTE_ROOT));

  it("answers for the local copy", () => {
    expect(followForRow(map, all, "lpm-sync")?.project).toBe("lpm-sync");
  });

  // The copy's row is hidden while the Mac is on screen, so the remote row is where
  // the sync's controls have to be reachable.
  it("answers for the remote project the copy follows", () => {
    expect(followForRow(map, all, remoteRow.name)?.project).toBe("lpm-sync");
  });

  it("is empty for a remote project with no copy here", () => {
    const other = remote("web", "/Users/other/Projects/web");
    expect(followForRow(map, [...all, other], other.name)).toBeUndefined();
  });

  it("does not match another Mac's folder at the same path", () => {
    const elsewhere = project(prefixName("bbbbbbbb", "lpm"), prefixRoot("bbbbbbbb", REMOTE_ROOT));
    expect(followForRow(map, [...all, elsewhere], elsewhere.name)).toBeUndefined();
  });

  it("is empty for an ordinary local project", () => {
    expect(followForRow(map, [...all, project("web", "/Users/me/web")], "web")).toBeUndefined();
  });
});
