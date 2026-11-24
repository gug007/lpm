import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({}));
vi.mock("./files/useChangedFiles", () => ({ useChangedFiles: vi.fn() }));
vi.mock("./files/useDiffView", () => ({ useDiffView: vi.fn() }));
vi.mock("./files/useFileBuffer", () => ({ useFileBuffer: vi.fn() }));

import { readError, viewerLocation } from "./useFileViewerFile";

describe("viewerLocation", () => {
  it("reads a file outside the project through its folder", () => {
    expect(viewerLocation("/var/log/app.log", "/repo")).toEqual({ root: "/var/log", rel: "app.log" });
    expect(viewerLocation("/repo/src/a.ts", "/repo")).toEqual({ root: "/repo", rel: "src/a.ts" });
  });

  it("reads an SSH host's file through its project, wherever it is", () => {
    expect(viewerLocation("/var/log/app.log", "~/api", true)).toEqual({ root: "~/api", rel: "/var/log/app.log" });
    expect(viewerLocation("~/api/src/a.ts", "~/api", true)).toEqual({ root: "~/api", rel: "src/a.ts" });
  });

  it("drops a connected computer's marker from its SSH host's path", () => {
    const root = "/@peer-abcd1234~/api";
    expect(viewerLocation("/@peer-abcd1234/var/log/app.log", root, true)).toEqual({ root, rel: "/var/log/app.log" });
  });
});

describe("readError", () => {
  it("says the same of this computer's errors and a host's", () => {
    expect(readError("cannot read a: No such file or directory (os error 2)")).toBe("This file doesn't exist");
    expect(readError("head: cannot open '/a' for reading: No such file or directory")).toBe("This file doesn't exist");
    expect(readError("head: /a: No such file or directory")).toBe("This file doesn't exist");
    expect(readError("head: cannot open '/a' for reading: Permission denied")).toBe("No permission to read this file");
    expect(readError("head: error reading '/var/log': Is a directory")).toBe("This is a folder, not a file");
  });

  it("keeps anything else as it came", () => {
    expect(readError("ssh: connect to host staging port 22: Operation timed out")).toMatch(/timed out/);
    expect(readError("path escapes the project: /a")).toBe("Update lpm on that computer to open this file");
  });
});
