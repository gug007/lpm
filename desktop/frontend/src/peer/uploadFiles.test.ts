import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  track: vi.fn(
    (_token: string, _slug: string, _name: string, upload: Promise<unknown>) =>
      upload,
  ),
}));

vi.mock("../../bridge/commands", () => ({
  PeerUploadFile: mocks.upload,
}));
vi.mock("./uploadProgress", () => ({
  trackPeerUpload: mocks.track,
}));

import { newUploadToken, uploadPeerFile, uploadPeerFiles } from "./uploadFiles";

const SLUG = "a1b2c3d4";
const TERM = `peer-${SLUG}-web-3`;

function saves(...paths: string[]) {
  let i = 0;
  mocks.upload.mockImplementation(() => Promise.resolve(paths[i++]));
}

afterEach(() => {
  mocks.upload.mockReset();
  mocks.track.mockClear();
});

describe("uploadPeerFile", () => {
  // The transport takes a path, not bytes: nothing is read or encoded here, so
  // the file's size is the host's business rather than this side's.
  it("sends the peer and the host's own terminal id, never the marked one", async () => {
    saves("/Users/host/.lpm/uploads/notes.txt");
    await expect(
      uploadPeerFile(TERM, "/local/notes.txt", "tok-1"),
    ).resolves.toBe("/Users/host/.lpm/uploads/notes.txt");
    expect(mocks.upload).toHaveBeenCalledWith(
      SLUG,
      "web-3",
      "/local/notes.txt",
      "tok-1",
    );
  });

  // The toast follows the transfer by the same token Rust stamps its progress
  // with, and names the file the way the host will.
  it("puts the transfer under a progress toast keyed by its token", async () => {
    saves("/host/notes.txt");
    await uploadPeerFile(TERM, "/local/dir/notes.txt", "tok-2");
    expect(mocks.track).toHaveBeenCalledWith(
      "tok-2",
      SLUG,
      "notes.txt",
      expect.any(Promise),
    );
  });

  // The token keys the progress toast, so every transfer must have one even when
  // the caller doesn't care to name it.
  it("mints a token when the caller gives none", async () => {
    saves("/host/a.txt");
    await uploadPeerFile(TERM, "/local/a.txt");
    const token = mocks.upload.mock.calls[0][3];
    expect(typeof token).toBe("string");
    expect(token).not.toBe("");
    expect(newUploadToken()).not.toBe(token);
  });

  it("refuses a terminal that isn't on another Mac", async () => {
    await expect(uploadPeerFile("web-3", "/local/notes.txt")).rejects.toThrow(
      "notes.txt",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  // A host too old to be sent a file this size explains itself, and that reason
  // is the only thing that says why the attach did nothing.
  it("surfaces the host's rejection", async () => {
    const refusal =
      "big.zip is 40 MB — update lpm on the other Mac to send files over 8 MB";
    mocks.upload.mockImplementation(() => Promise.reject(refusal));
    await expect(uploadPeerFile(TERM, "/local/big.zip")).rejects.toBe(refusal);
  });

  it("fails when the host answers without a path", async () => {
    saves("");
    await expect(uploadPeerFile(TERM, "/local/notes.txt")).rejects.toThrow(
      "notes.txt",
    );
  });
});

describe("uploadPeerFiles", () => {
  it("keeps the host paths in the order the files were given", async () => {
    saves("/host/a.txt", "/host/b.txt");
    await expect(
      uploadPeerFiles(TERM, ["/local/a.txt", "/local/b.txt"]),
    ).resolves.toEqual(["/host/a.txt", "/host/b.txt"]);
  });

  it("gives each file in a batch its own token", async () => {
    saves("/host/a.txt", "/host/b.txt");
    await uploadPeerFiles(TERM, ["/local/a.txt", "/local/b.txt"]);
    const [first, second] = mocks.upload.mock.calls.map((c) => c[3]);
    expect(first).not.toBe(second);
  });

  it("rejects the batch with the reason one file failed", async () => {
    mocks.upload
      .mockImplementationOnce(() => Promise.resolve("/host/a.txt"))
      .mockImplementationOnce(() => Promise.reject("disk full"));
    await expect(
      uploadPeerFiles(TERM, ["/local/a.txt", "/local/b.txt"]),
    ).rejects.toBe("disk full");
  });
});
