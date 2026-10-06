import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBuffer, ILink, ILinkProvider, Terminal } from "@xterm/xterm";

const mocks = vi.hoisted(() => ({
  index: [] as string[],
  openInDefaultApp: false,
}));

vi.mock("../../platform", () => ({
  platform: "windows",
  isMac: false,
  isLinux: false,
  isWindows: true,
}));
vi.mock("../../../bridge/commands", () => ({
  FileExists: vi.fn(() => Promise.resolve(false)),
  ListDirFiles: vi.fn(() => Promise.resolve(mocks.index.map((path) => ({ path, isDir: false })))),
  OpenPathInDefaultApp: vi.fn(() => Promise.resolve()),
  RevealInFinder: vi.fn(() => Promise.resolve()),
  GetMsysMounts: vi.fn(() =>
    Promise.resolve({ root: "C:\\Program Files\\Git", tmp: "C:\\Users\\me\\AppData\\Local\\Temp\\" }),
  ),
}));
vi.mock("../../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../../store/fileViewer", () => ({ openFileViewer: vi.fn() }));
vi.mock("../../store/settings", () => ({
  getSettings: () => ({ terminalOpenInDefaultApp: mocks.openInDefaultApp }),
}));

import { OpenPathInDefaultApp, RevealInFinder } from "../../../bridge/commands";
import { openFileViewer } from "../../store/fileViewer";
import { registerPathLinkProvider } from "./pathLinkProvider";
import { forgetFileIndexes } from "./fileIndex";

const CWD = "C:\\repo";

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

async function activate(text: string, linkText: string) {
  let provider: ILinkProvider | null = null;
  const term = {
    buffer: { active: bufferOf(text) },
    registerLinkProvider: (p: ILinkProvider) => {
      provider = p;
      return { dispose() {} };
    },
  } as unknown as Terminal;
  registerPathLinkProvider(term, { getCwd: () => CWD });
  const links = await new Promise<ILink[]>((resolve) =>
    provider!.provideLinks(1, (found) => resolve(found ?? [])),
  );
  const link = links.find((l) => l.text === linkText);
  if (!link) throw new Error(`no link "${linkText}" in "${text}"`);
  link.activate({} as MouseEvent, link.text);
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetFileIndexes();
  mocks.openInDefaultApp = true;
  mocks.index = ["scripts/release.cmd", "src/index.js", "notes.md"];
});

describe("files Windows would run", () => {
  it("shows a program in File Explorer instead of running it", async () => {
    await activate("saved C:\\Users\\me\\Downloads\\setup.exe", "C:\\Users\\me\\Downloads\\setup.exe");
    await vi.waitFor(() =>
      expect(RevealInFinder).toHaveBeenCalledWith("C:\\Users\\me\\Downloads\\setup.exe"),
    );
    expect(OpenPathInDefaultApp).not.toHaveBeenCalled();
    expect(openFileViewer).not.toHaveBeenCalled();
  });

  it("opens a script in the viewer instead of running it", async () => {
    await activate("run scripts\\release.cmd now", "scripts\\release.cmd");
    await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
    expect(vi.mocked(openFileViewer).mock.calls[0][0].absPath).toBe("C:\\repo\\scripts\\release.cmd");
    expect(OpenPathInDefaultApp).not.toHaveBeenCalled();
  });

  it("treats a project's .js file as a script", async () => {
    await activate("see src\\index.js", "src\\index.js");
    await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
    expect(OpenPathInDefaultApp).not.toHaveBeenCalled();
  });

  it("still hands other files to the default app", async () => {
    await activate("wrote C:\\repo\\notes.md", "C:\\repo\\notes.md");
    await vi.waitFor(() => expect(OpenPathInDefaultApp).toHaveBeenCalledWith("C:\\repo\\notes.md"));
    expect(RevealInFinder).not.toHaveBeenCalled();
  });
});

describe("Git Bash paths", () => {
  beforeEach(() => {
    mocks.openInDefaultApp = false;
  });

  it("opens /tmp in the user's temp folder", async () => {
    await activate("wrote /tmp/build-1234/report.html", "/tmp/build-1234/report.html");
    await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
    expect(vi.mocked(openFileViewer).mock.calls[0][0].absPath).toBe(
      "C:\\Users\\me\\AppData\\Local\\Temp\\build-1234\\report.html",
    );
  });

  it("opens the rest of the tree under the Git install", async () => {
    await activate("see /usr/share/doc/README.md", "/usr/share/doc/README.md");
    await vi.waitFor(() => expect(openFileViewer).toHaveBeenCalled());
    expect(vi.mocked(openFileViewer).mock.calls[0][0].absPath).toBe(
      "C:\\Program Files\\Git\\usr\\share\\doc\\README.md",
    );
  });
});
