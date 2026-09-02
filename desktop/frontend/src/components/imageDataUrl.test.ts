import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(() =>
    Promise.resolve({ mimeType: "image/png", data: "AAA" }),
  ),
}));

vi.mock("../../bridge/commands", () => ({
  NotesReadFileAsInput: mocks.readFile,
}));

import { PEER_UPLOAD_MAX_BYTES } from "../peer/markers";
import { loadImageDataUrl, seedImageDataUrl } from "./imageDataUrl";

const SLUG = "a1b2c3d4";

beforeEach(() => {
  mocks.readFile.mockClear();
});

describe("loadImageDataUrl", () => {
  it("reads a path on this machine as-is", async () => {
    await loadImageDataUrl("/tmp/local-1.png");
    expect(mocks.readFile).toHaveBeenCalledWith("/tmp/local-1.png");
  });

  // The whole point of the slug: an attachment of a peer terminal was written on
  // the HOST's disk, so an unmarked read looks it up here and fails ("Preview
  // unavailable"). Marked, the command router forwards it to that host.
  // The reply travels as one frame over the peer link, so the read is capped
  // where a single-frame upload is — a bigger image leaves the chip's glyph.
  it("reads a peer path as a marked root so the read is routed to the host", async () => {
    await loadImageDataUrl("/tmp/peer-1.png", SLUG);
    expect(mocks.readFile).toHaveBeenCalledWith(
      `/@peer-${SLUG}/tmp/peer-1.png`,
      PEER_UPLOAD_MAX_BYTES,
    );
  });

  it("serves seeded bytes without reading the host", async () => {
    seedImageDataUrl("/tmp/seeded.png", SLUG, "data:image/png;base64,SEED");
    await expect(loadImageDataUrl("/tmp/seeded.png", SLUG)).resolves.toBe(
      "data:image/png;base64,SEED",
    );
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  // Temp paths collide across machines (/tmp/clipboard-x.png on two hosts), so
  // the cache is keyed by the marked path, not the bare one.
  it("keeps the same path on different machines apart in the cache", async () => {
    seedImageDataUrl("/tmp/shared.png", SLUG, "data:image/png;base64,HOST");
    await expect(loadImageDataUrl("/tmp/shared.png", SLUG)).resolves.toBe(
      "data:image/png;base64,HOST",
    );
    await expect(loadImageDataUrl("/tmp/shared.png")).resolves.toBe(
      "data:image/png;base64,AAA",
    );
    expect(mocks.readFile).toHaveBeenCalledWith("/tmp/shared.png");
  });
});
