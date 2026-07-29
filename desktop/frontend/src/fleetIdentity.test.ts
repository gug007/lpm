import { describe, expect, it } from "vitest";
import {
  fleetIdentityTags,
  namelessIdentity,
  type FleetProjectIdentity,
} from "./fleetIdentity";

function identity(over: Partial<FleetProjectIdentity> = {}): FleetProjectIdentity {
  return {
    name: "app",
    label: "App",
    isCopy: false,
    isWorktree: false,
    isRemote: false,
    peerAlias: null,
    ...over,
  };
}

describe("fleetIdentityTags", () => {
  it("has nothing to say about a plain local project", () => {
    expect(fleetIdentityTags(identity())).toEqual([]);
  });

  it("marks a copy, a worktree and an SSH project", () => {
    expect(fleetIdentityTags(identity({ isCopy: true }))).toEqual(["Copy"]);
    expect(fleetIdentityTags(identity({ isWorktree: true }))).toEqual(["Worktree"]);
    expect(fleetIdentityTags(identity({ isRemote: true }))).toEqual(["SSH"]);
  });

  it("names the paired Mac last, after what kind of project it is", () => {
    expect(
      fleetIdentityTags(identity({ isCopy: true, peerAlias: "Studio Mac" })),
    ).toEqual(["Copy", "Studio Mac"]);
  });

  it("says nothing for a row that names no project", () => {
    expect(fleetIdentityTags(namelessIdentity("Multiple projects"))).toEqual([]);
  });
});
