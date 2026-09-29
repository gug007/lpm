import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBuffer, ILink, ILinkProvider, Terminal } from "@xterm/xterm";

const mocks = vi.hoisted(() => ({ index: [] as string[], openInDefaultApp: false }));

vi.mock("../../../bridge/commands", () => ({
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

function bufferOf(text: string): IBuffer {
  const scratch = { chars: "", width: 1 };
  const cell = { getChars: () => scratch.chars, getWidth: () => scratch.width };
  return {
    getNullCell: () => cell,
    getLine: (y: number) =>
      y === 0
        ? {
            isWrapped: false,
            length: 120,
            getCell: (x: number) => {
              scratch.chars = text[x] ?? "";
              return cell;
            },
          }
        : undefined,
  } as unknown as IBuffer;
}

async function linksOn(text: string, cwd = "/repo"): Promise<ILink[]> {
  let provider: ILinkProvider | null = null;
  const term = {
    buffer: { active: bufferOf(text) },
    registerLinkProvider: (p: ILinkProvider) => {
      provider = p;
      return { dispose() {} };
    },
  } as unknown as Terminal;
  registerPathLinkProvider(term, { getCwd: () => cwd });
  return new Promise((resolve) => provider!.provideLinks(1, (links) => resolve(links ?? [])));
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
