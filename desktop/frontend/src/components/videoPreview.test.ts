import { describe, expect, it } from "vitest";
import type { PeerClient } from "../peer/usePeerState";
import { peerVideoBlock } from "./videoPreview";

const peer = (over: Partial<PeerClient>): PeerClient => ({
  slug: "abcd1234",
  alias: "Studio Mac",
  host: "studio.local",
  port: 8766,
  enabled: true,
  connected: true,
  supportsMediaRange: true,
  ...over,
});

const clip = "/@peer-abcd1234/Users/dev/Movies/clip.mp4";

describe("peerVideoBlock", () => {
  it("lets a local video through", () => {
    expect(peerVideoBlock("/Users/dev/Movies/clip.mp4", [])).toBeNull();
  });

  it("streams from a connected Mac that serves ranges", () => {
    expect(peerVideoBlock(clip, [peer({})])).toBeNull();
  });

  it("names a Mac that is offline or unknown", () => {
    expect(peerVideoBlock(clip, [peer({ connected: false })])).toBe(
      "Can't reach Studio Mac to play this video.",
    );
    expect(peerVideoBlock(clip, [])).toBe("Can't reach another Mac to play this video.");
  });

  it("asks for an update when that Mac's lpm can't stream", () => {
    expect(peerVideoBlock(clip, [peer({ supportsMediaRange: false })])).toBe(
      "Update lpm on Studio Mac to preview its videos here.",
    );
  });
});
