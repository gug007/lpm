import { describe, expect, it } from "vitest";
import { placeMirrors } from "./mirrorRows";
import type { FollowState } from "../followApi";
import type { ProjectInfo } from "../types";

const SLUG = "aaaaaaaa";

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

function follow(project: string, sourceRoot: string, slug = SLUG): FollowState {
  return { project, slug, sourceRoot, lastSyncedAt: 0, files: 0, syncing: false };
}

function follows(...list: FollowState[]): Map<string, FollowState> {
  return new Map(list.map((f) => [f.project, f]));
}

const mirror = project("lpm-sync", "/Users/me/Projects/lpm-sync");

describe("placeMirrors", () => {
  it("files a mirror under its Mac, keyed by the folder it follows", () => {
    const placed = placeMirrors(
      [mirror],
      follows(follow("lpm-sync", "/Users/other/lpm")),
      new Set([SLUG]),
    );
    expect(placed.bySlug.get(SLUG)?.get("/Users/other/lpm")).toBe(mirror);
    expect(placed.hostedRemotely.has("lpm-sync")).toBe(true);
  });

  // Losing sight of a local folder because a laptop closed would be worse than
  // showing it in a slightly odd place.
  it("leaves a mirror in the local list when its Mac has no section", () => {
    const placed = placeMirrors(
      [mirror],
      follows(follow("lpm-sync", "/Users/other/lpm")),
      new Set(),
    );
    expect(placed.hostedRemotely.size).toBe(0);
  });

  it("keeps several mirrors from one Mac apart by their folder", () => {
    const web = project("web-sync", "/Users/me/Projects/web-sync");
    const placed = placeMirrors(
      [mirror, web],
      follows(
        follow("lpm-sync", "/Users/other/lpm"),
        follow("web-sync", "/Users/other/web"),
      ),
      new Set([SLUG]),
    );
    const byRoot = placed.bySlug.get(SLUG);
    expect(byRoot?.get("/Users/other/lpm")).toBe(mirror);
    expect(byRoot?.get("/Users/other/web")).toBe(web);
    expect(placed.hostedRemotely).toEqual(new Set(["lpm-sync", "web-sync"]));
  });

  it("ignores a record whose project is already gone", () => {
    const placed = placeMirrors([], follows(follow("lpm-sync", "/Users/other/lpm")), new Set([SLUG]));
    expect(placed.bySlug.size).toBe(0);
    expect(placed.hostedRemotely.size).toBe(0);
  });
});
