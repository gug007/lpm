import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  NotesReadFileAsInput: mocks.read,
  UploadFileForTerminal: mocks.upload,
}));

import { PEER_UPLOAD_MAX_BYTES } from "./markers";
import { uploadPeerFile, uploadPeerFiles } from "./uploadFiles";

const TERM = "peer-a1b2c3d4-web-3";

function reads(input: Record<string, string>) {
  mocks.read.mockImplementation(() => Promise.resolve(input));
}

function saves(...paths: string[]) {
  let i = 0;
  mocks.upload.mockImplementation(() => Promise.resolve(paths[i++]));
}

afterEach(() => {
  mocks.read.mockReset();
  mocks.upload.mockReset();
});

describe("uploadPeerFile", () => {
  it("reads under the link's cap and sends the file's own name to the host", async () => {
    reads({ name: "notes.txt", mimeType: "text/plain", data: "aGk=" });
    saves("/Users/host/.lpm/clipboard/notes.txt");
    await expect(uploadPeerFile(TERM, "/local/notes.txt")).resolves.toBe(
      "/Users/host/.lpm/clipboard/notes.txt",
    );
    expect(mocks.read).toHaveBeenCalledWith("/local/notes.txt", PEER_UPLOAD_MAX_BYTES);
    expect(mocks.upload).toHaveBeenCalledWith(TERM, "aGk=", "text/plain", "notes.txt");
  });

  it("names the file from its path when the read didn't", async () => {
    reads({ name: "", mimeType: "", data: "aGk=" });
    saves("/Users/host/.lpm/clipboard/report.pdf");
    await uploadPeerFile(TERM, "/local/dir/report.pdf");
    expect(mocks.upload).toHaveBeenCalledWith(
      TERM,
      "aGk=",
      "application/octet-stream",
      "report.pdf",
    );
  });

  // The cap is enforced by the read, so an oversize file never gets encoded or
  // put on the wire — and the message names the file that was refused.
  it("surfaces the read's refusal without attempting an upload", async () => {
    mocks.read.mockImplementation(() => Promise.reject("big.zip exceeds 8MB limit"));
    await expect(uploadPeerFile(TERM, "/local/big.zip")).rejects.toBe("big.zip exceeds 8MB limit");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  // A host on an older lpm has no upload_file_for_terminal; its rejection is the
  // only thing that explains why the attach did nothing, so it must not be lost.
  it("surfaces the host's rejection", async () => {
    reads({ name: "notes.txt", mimeType: "text/plain", data: "aGk=" });
    mocks.upload.mockImplementation(() =>
      Promise.reject("Command upload_file_for_terminal not found"),
    );
    await expect(uploadPeerFile(TERM, "/local/notes.txt")).rejects.toBe(
      "Command upload_file_for_terminal not found",
    );
  });

  it("fails when the host answers without a path", async () => {
    reads({ name: "notes.txt", mimeType: "text/plain", data: "aGk=" });
    saves("");
    await expect(uploadPeerFile(TERM, "/local/notes.txt")).rejects.toThrow("notes.txt");
  });

  it("fails when the file read back empty", async () => {
    reads({ name: "notes.txt", mimeType: "text/plain", data: "" });
    await expect(uploadPeerFile(TERM, "/local/notes.txt")).rejects.toThrow("notes.txt");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("uploadPeerFiles", () => {
  it("keeps the host paths in the order the files were given", async () => {
    reads({ name: "f", mimeType: "text/plain", data: "aGk=" });
    saves("/host/a.txt", "/host/b.txt");
    await expect(uploadPeerFiles(TERM, ["/local/a.txt", "/local/b.txt"])).resolves.toEqual([
      "/host/a.txt",
      "/host/b.txt",
    ]);
  });

  it("rejects the batch with the reason one file failed", async () => {
    reads({ name: "f", mimeType: "text/plain", data: "aGk=" });
    mocks.upload
      .mockImplementationOnce(() => Promise.resolve("/host/a.txt"))
      .mockImplementationOnce(() => Promise.reject("disk full"));
    await expect(uploadPeerFiles(TERM, ["/local/a.txt", "/local/b.txt"])).rejects.toBe("disk full");
  });
});
