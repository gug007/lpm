import { describe, expect, it } from "vitest";
import type { PeerClient } from "../peer/usePeerState";
import { peerMediaBlock } from "./mediaPreview";

const peer = (over: Partial<PeerClient>): PeerClient => ({
  slug: "abcd1234",
  alias: "Studio Mac",
  host: "studio.local",
  port: 8766,
  enabled: true,
  connected: true,
  supportsMediaRange: true,
  supportsMediaAudio: true,
  ...over,
});

const clip = "/@peer-abcd1234/Users/dev/Movies/clip.mp4";
const song = "/@peer-abcd1234/Users/dev/Music/song.mp3";

describe("peerMediaBlock", () => {
  it("lets local media through", () => {
    expect(peerMediaBlock("/Users/dev/Movies/clip.mp4", "video", [])).toBeNull();
    expect(peerMediaBlock("/Users/dev/Music/song.mp3", "audio", [])).toBeNull();
  });

  it("streams from a connected Mac that serves ranges", () => {
    expect(peerMediaBlock(clip, "video", [peer({})])).toBeNull();
    expect(peerMediaBlock(song, "audio", [peer({})])).toBeNull();
  });

  it("names a Mac that is offline or unknown", () => {
    expect(peerMediaBlock(clip, "video", [peer({ connected: false })])).toBe(
      "Can't reach Studio Mac to play this video.",
    );
    expect(peerMediaBlock(clip, "video", [])).toBe("Can't reach another Mac to play this video.");
    expect(peerMediaBlock(song, "audio", [peer({ connected: false })])).toBe(
      "Can't reach Studio Mac to play this audio file.",
    );
  });

  it("asks for an update when that Mac's lpm can't stream", () => {
    expect(peerMediaBlock(clip, "video", [peer({ supportsMediaRange: false })])).toBe(
      "Update lpm on Studio Mac to preview its videos here.",
    );
  });

  it("asks for an update when that Mac streams video but not audio yet", () => {
    const older = peer({ supportsMediaAudio: undefined });
    expect(peerMediaBlock(clip, "video", [older])).toBeNull();
    expect(peerMediaBlock(song, "audio", [older])).toBe(
      "Update lpm on Studio Mac to play its audio here.",
    );
  });
});
