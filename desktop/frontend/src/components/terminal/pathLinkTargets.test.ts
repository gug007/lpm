import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBuffer, ILink, ILinkProvider, Terminal } from "@xterm/xterm";

const mocks = vi.hoisted(() => ({
  index: [] as string[],
  files: [] as string[],
  openInDefaultApp: false,
}));

vi.mock("../../../bridge/commands", () => ({
  FileExists: vi.fn((path: string) => Promise.resolve(mocks.files.includes(path))),
  ListDirFiles: vi.fn(() => Promise.resolve(mocks.index.map((path) => ({ path, isDir: false })))),
  OpenPathInDefaultApp: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../../store/fileViewer", () => ({ openFileViewer: vi.fn() }));
vi.mock("../../store/settings", () => ({
  getSettings: () => ({ terminalOpenInDefaultApp: mocks.openInDefaultApp }),
}));

import { OpenPathInDefaultApp } from "../../../bridge/commands";
import { openFileViewer } from "../../store/fileViewer";
import { registerPathLinkProvider } from "./pathLinkProvider";
import { forgetFileIndexes } from "./fileIndex";

function bufferOf(rows: string[], cols: number): IBuffer {
  const scratch = { chars: "", width: 1 };
  const cell = { getChars: () => scratch.chars, getWidth: () => scratch.width };
  return {
    getNullCell: () => cell,
    getLine: (y: number) =>
      y < rows.length
        ? {
            isWrapped: false,
            length: cols,
            getCell: (x: number) => {
              scratch.chars = rows[y][x] ?? "";
              return cell;
            },
          }
        : undefined,
  } as unknown as IBuffer;
}

// One row of output, or several in a terminal `cols` wide, scanned at `line`.
async function linksOn(text: string | string[], cwd = "/repo", line = 1): Promise<ILink[]> {
  let provider: ILinkProvider | null = null;
  const rows = typeof text === "string" ? [text] : text;
  const term = {
    ...(typeof text === "string" ? {} : { cols: rows[0].length }),
    buffer: { active: bufferOf(rows, typeof text === "string" ? 120 : rows[0].length) },
    registerLinkProvider: (p: ILinkProvider) => {
      provider = p;
      return { dispose() {} };
    },
  } as unknown as Terminal;
  registerPathLinkProvider(term, { getCwd: () => cwd });
  return new Promise((resolve) => provider!.provideLinks(line, (links) => resolve(links ?? [])));
}

async function click(text: string, linkText: string, cwd = "/repo") {
  const link = (await linksOn(text, cwd)).find((l) => l.text === linkText);
  if (!link) throw new Error(`no link "${linkText}" in "${text}"`);
  link.activate({} as MouseEvent, link.text);
  await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
  return vi.mocked(openFileViewer).mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetFileIndexes();
  mocks.openInDefaultApp = false;
  mocks.files = [];
  mocks.index = [
    "desktop/frontend/src/components/FileViewer.tsx",
    "desktop/frontend/src/components/ui/blockingDialog.ts",
    "src/a.ts",
    "pkg/src/a.ts",
    "src/x.ts",
    "docs/README.md",
    "mobile/README.md",
  ];
});

describe("partial paths", () => {
  it("opens the one project file a partial path names", async () => {
    const req = await click("- ui/blockingDialog.ts", "ui/blockingDialog.ts");
    expect(req.absPath).toBe("/repo/desktop/frontend/src/components/ui/blockingDialog.ts");
  });

  it("prefers the path as printed when it exists", async () => {
    const req = await click("see src/a.ts:4", "src/a.ts:4");
    expect(req).toMatchObject({ absPath: "/repo/src/a.ts", line: 4 });
  });

  it("drops git's a/ and b/ prefixes", async () => {
    const req = await click("+++ b/src/x.ts", "b/src/x.ts");
    expect(req.absPath).toBe("/repo/src/x.ts");
  });

  it("opens a path the project index doesn't hold as printed", async () => {
    const req = await click("at node_modules/pkg/index.js", "node_modules/pkg/index.js");
    expect(req.absPath).toBe("/repo/node_modules/pkg/index.js");
  });
});

describe("bare file names", () => {
  it("links a name the project has a file for", async () => {
    const req = await click("- FileViewer.tsx", "FileViewer.tsx");
    expect(req.absPath).toBe("/repo/desktop/frontend/src/components/FileViewer.tsx");
  });

  it("leaves words that aren't project files alone", async () => {
    expect(await linksOn("built with Node.js, see lpm.cx, e.g. this")).toEqual([]);
  });

  it("lets the user choose when a name matches several files", async () => {
    const req = await click("read README.md:2", "README.md:2");
    expect(req.choices).toEqual(["/repo/docs/README.md", "/repo/mobile/README.md"]);
    expect(req.line).toBe(2);
  });

  it("opens the file at the root when there is one", async () => {
    mocks.index.push("README.md");
    const req = await click("read README.md", "README.md");
    expect(req.absPath).toBe("/repo/README.md");
    expect(req.choices).toBeUndefined();
  });
});

describe("a connected Mac's terminal", () => {
  const cwd = "/@peer-abcd1234/Users/dev/repo";

  it("opens an absolute path from that Mac, not this one", async () => {
    const req = await click("wrote /Users/dev/Movies/clip.mp4", "/Users/dev/Movies/clip.mp4", cwd);
    expect(req.absPath).toBe("/@peer-abcd1234/Users/dev/Movies/clip.mp4");
  });

  it("uses the viewer even when files open in the default app", async () => {
    mocks.openInDefaultApp = true;
    const req = await click("wrote /Users/dev/notes.md", "/Users/dev/notes.md", cwd);
    expect(req.absPath).toBe("/@peer-abcd1234/Users/dev/notes.md");
    expect(OpenPathInDefaultApp).not.toHaveBeenCalled();
  });

  it("still hands a local file to the default app", async () => {
    mocks.openInDefaultApp = true;
    const link = (await linksOn("wrote /Users/dev/notes.md")).find((l) => l.text === "/Users/dev/notes.md");
    link!.activate({} as MouseEvent, link!.text);
    await vi.waitFor(() => expect(OpenPathInDefaultApp).toHaveBeenCalledWith("/Users/dev/notes.md"));
    expect(openFileViewer).not.toHaveBeenCalled();
  });
});

describe("paths with spaces", () => {
  it("links the reading that is a file", async () => {
    const path = "/Users/me/Downloads/Q3 Report (final, v2).pdf";
    mocks.files = [path];
    const req = await click(`saved ${path}`, path);
    expect(req.absPath).toBe(path);
  });

  it("leaves prose alone when nothing it could name exists", async () => {
    expect(await linksOn("move /Users/me/old notes into the archive.md")).toEqual([]);
  });

  it("outranks the piece of it that reads as a path alone", async () => {
    const path = "/Users/me/My Docs/src/a.ts";
    mocks.files = [path];
    const links = await linksOn(`edit ${path}`);
    expect(links.map((l) => l.text)).toEqual([path]);
  });

  it("asks a connected Mac whether the file is there", async () => {
    const cwd = "/@peer-abcd1234/Users/dev/repo";
    mocks.files = ["/@peer-abcd1234/Users/dev/My Files/clip.mp4"];
    const req = await click("wrote /Users/dev/My Files/clip.mp4", "/Users/dev/My Files/clip.mp4", cwd);
    expect(req.absPath).toBe("/@peer-abcd1234/Users/dev/My Files/clip.mp4");
  });
});

describe("paths an agent cut at the right edge", () => {
  // Claude Code breaks a path longer than the row at the last column and indents the rest.
  const rows = ["⏺ /Users/me/Movies/clips/opus-vs-gpt-3d-", "  runner.mp4"];
  const path = "/Users/me/Movies/clips/opus-vs-gpt-3d-runner.mp4";

  it("links the whole path from either row when it is a file", async () => {
    mocks.files = [path];
    for (const line of [1, 2]) {
      const links = await linksOn(rows, "/repo", line);
      expect(links.map((l) => l.text)).toEqual([path]);
    }
    const [link] = await linksOn(rows, "/repo", 2);
    link.activate({} as MouseEvent, link.text);
    await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
    expect(vi.mocked(openFileViewer).mock.calls[0][0].absPath).toBe(path);
  });

  it("links nothing when the joined path is not a file", async () => {
    expect(await linksOn(rows, "/repo", 1)).toEqual([]);
    expect(await linksOn(rows, "/repo", 2)).toEqual([]);
  });
});
