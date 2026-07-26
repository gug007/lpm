import { describe, expect, it } from "vitest";
import { syncSourceFor } from "./syncSource";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

const SLUG = "aaaaaaaa";

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

function peer(extra: Partial<PeerClient> = {}): PeerClient {
  return {
    slug: SLUG,
    alias: "Mac A",
    host: `${SLUG}.local`,
    port: 8766,
    enabled: true,
    connected: true,
    supportsGitBring: true,
    supportsGitFollow: true,
    ...extra,
  };
}

const local = project("app", "/Users/me/app");
const onPeer = project(`peer-${SLUG}-app`, `/@peer-${SLUG}/Users/other/app`);

describe("syncSourceFor", () => {
  it("returns the host-native folder of a connected, capable Mac", () => {
    expect(syncSourceFor([local, onPeer], [peer()], onPeer.name)).toEqual({
      remoteName: "app",
      sourceRoot: "/Users/other/app",
      slug: SLUG,
    });
  });

  it("is offered even when no local project of that name exists", () => {
    expect(syncSourceFor([onPeer], [peer()], onPeer.name)).not.toBeNull();
  });

  it("skips a Mac that is disconnected or on a build without syncing", () => {
    expect(syncSourceFor([onPeer], [peer({ connected: false })], onPeer.name)).toBeNull();
    expect(
      syncSourceFor([onPeer], [peer({ supportsGitFollow: false })], onPeer.name),
    ).toBeNull();
  });

  // The one-shot transfer is not enough on its own: syncing also needs the
  // fingerprint verb, so a Mac with only the older capability is refused.
  it("requires the follow capability, not just the transfer", () => {
    expect(
      syncSourceFor(
        [onPeer],
        [peer({ supportsGitBring: true, supportsGitFollow: undefined })],
        onPeer.name,
      ),
    ).toBeNull();
  });

  it("says nothing for a local row", () => {
    expect(syncSourceFor([local, onPeer], [peer()], local.name)).toBeNull();
  });

  it("skips an SSH project on that Mac, whose files are elsewhere again", () => {
    const ssh = project(`peer-${SLUG}-remote`, "", { isRemote: true });
    expect(syncSourceFor([ssh], [peer()], ssh.name)).toBeNull();
  });

  it("skips a peer row whose root belongs to a different Mac", () => {
    const mismatched = project(`peer-${SLUG}-app`, "/@peer-bbbbbbbb/Users/other/app");
    expect(syncSourceFor([mismatched], [peer()], mismatched.name)).toBeNull();
  });

  it("skips a peer row with no usable root marker", () => {
    const bare = project(`peer-${SLUG}-app`, "/Users/other/app");
    expect(syncSourceFor([bare], [peer()], bare.name)).toBeNull();
  });
});
