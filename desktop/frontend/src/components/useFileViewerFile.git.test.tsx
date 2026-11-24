// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const git = vi.hoisted(() => ({ prefix: vi.fn(), changes: vi.fn() }));
vi.mock("../../bridge/commands", () => ({ GitShowPrefix: git.prefix }));
vi.mock("./files/useChangedFiles", () => ({
  useChangedFiles: (_root: string, active: boolean) => git.changes(active),
}));
vi.mock("./files/useDiffView", () => ({ useDiffView: () => ({ diff: null, setWanted: () => {} }) }));
vi.mock("./files/useFileBuffer", () => ({
  useFileBuffer: () => ({ open: async () => {}, file: { loading: false, error: null, binary: false, tooLarge: false } }),
}));

import { useFileViewerFile } from "./useFileViewerFile";

let root: Root;
let viewer: ReturnType<typeof useFileViewerFile>;

function Probe({ absPath, onHost }: { absPath: string; onHost: boolean }) {
  viewer = useFileViewerFile(absPath, "~/api", onHost);
  return null;
}

const open = (absPath: string, onHost = true) =>
  act(async () => root.render(<Probe absPath={absPath} onHost={onHost} />));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  git.prefix.mockReset().mockReturnValue(new Promise(() => {}));
  git.changes.mockReset().mockReturnValue({ status: "loading", files: [] });
  root = createRoot(document.createElement("div"));
});

afterEach(() => act(() => root.unmount()));

describe("an SSH project's host file", () => {
  it("outside the project shows without asking git about it", async () => {
    await open("/var/log/api.log");
    expect(viewer.loading).toBe(false);
    expect(git.prefix).not.toHaveBeenCalled();
    expect(git.changes).toHaveBeenLastCalledWith(false);
  });

  it("in the project waits for git, whose diff it may open on", async () => {
    await open("~/api/src/a.ts");
    expect(viewer.loading).toBe(true);
    expect(git.prefix).toHaveBeenCalledWith("~/api");
    expect(git.changes).toHaveBeenLastCalledWith(true);
  });
});
