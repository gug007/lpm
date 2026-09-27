// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  binary: new Set<string>(),
  diff: "",
  changed: [] as { path: string; status: string }[],
  heads: {} as Record<string, string>,
  prefixes: {} as Record<string, string>,
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
}));

const missing = (rel: string) => new Error(`cannot read ${rel}: No such file or directory (os error 2)`);

vi.mock("../../bridge/commands", () => ({
  ReadFile: vi.fn((path: string) =>
    path in mocks.files
      ? Promise.resolve(mocks.binary.has(path) ? "PK\u0003\u0004\u0000\u0000" : mocks.files[path])
      : Promise.reject(missing(path)),
  ),
  ReadProjectFile: vi.fn((root: string, rel: string) => {
    const abs = `${root.replace(/\/$/, "")}/${rel}`;
    if (!(abs in mocks.files)) return Promise.reject(missing(rel));
    const binary = mocks.binary.has(abs);
    const content = binary ? "" : mocks.files[abs];
    return Promise.resolve({ content, binary, tooLarge: false, size: content.length, writable: true });
  }),
  GitDiff: vi.fn(() => Promise.resolve(mocks.diff)),
  GitShowPrefix: vi.fn((root: string) => Promise.resolve(mocks.prefixes[root] ?? "")),
  GitChangedFiles: vi.fn(() => Promise.resolve(mocks.changed.map((c) => ({ ...c, staged: false })))),
  GitFileDiff: vi.fn((_root: string, path: string) =>
    Promise.resolve({ original: mocks.heads[path] ?? "", modified: "", binary: false, tooLarge: false }),
  ),
  WriteFile: vi.fn(() => Promise.resolve()),
  WriteFileIfUnchanged: vi.fn((abs: string, expected: string, content: string) => {
    const current = mocks.files[abs] ?? "";
    if (current !== expected) return Promise.resolve({ written: false, currentContent: current });
    mocks.files[abs] = content;
    return Promise.resolve({ written: true });
  }),
  NotesReadFileAsInput: vi.fn(() => Promise.reject(new Error("no image"))),
}));
vi.mock("../../bridge/runtime", () => ({
  BrowserOpenURL: vi.fn(),
  EventsOn: vi.fn((name: string, cb: (payload: unknown) => void) => {
    if (!mocks.listeners.has(name)) mocks.listeners.set(name, new Set());
    mocks.listeners.get(name)?.add(cb);
    return () => mocks.listeners.get(name)?.delete(cb);
  }),
}));
vi.mock("../highlight", () => ({
  getLang: () => "",
  ensureLang: () => Promise.resolve(false),
  tokenizeLines: () => Promise.resolve([]),
}));
vi.mock("./MonacoEditor", () => ({
  MonacoEditor: (p: { value: string; readOnly?: boolean; onChange: (v: string) => void }) => (
    <textarea
      data-testid="monaco"
      value={p.value}
      readOnly={!!p.readOnly}
      onChange={(e) => p.onChange(e.target.value)}
    />
  ),
}));
vi.mock("./files/FilesDiffEditor", () => ({
  FilesDiffEditor: (p: { original: string; value: string }) => (
    <div data-testid="diff" data-original={p.original}>
      {p.value}
    </div>
  ),
}));
vi.mock("./OpenFileWithDropdown", () => ({ OpenFileWithDropdown: () => null }));

import * as commands from "../../bridge/commands";
import { isPeerRoot } from "../peer/markers";
import { openFileViewer, useFileViewerStore } from "../store/fileViewer";
import { FileViewerHost } from "./FileViewerHost";
import { FileViewerModal } from "./FileViewerModal";

const DOC = "/proj/docs/a.md";
const DOC_TEXT = "# Design\n\nSee [the guide](guide.md).\n";
const DOC_HEAD = "# Design\n\nSee the guide.\n";
const DIFF = [
  "diff --git a/docs/a.md b/docs/a.md",
  "--- a/docs/a.md",
  "+++ b/docs/a.md",
  "@@ -1,3 +1,3 @@",
  " # Design",
  " ",
  "-See the guide.",
  "+See [the guide](guide.md).",
].join("\n");
const MAIN = "/proj/main.ts";

let container: HTMLDivElement;
let root: Root;
let onClose: Mock<() => void>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onClose = vi.fn<() => void>();
  mocks.files = { [DOC]: DOC_TEXT, [MAIN]: "const a = 1;\n" };
  mocks.binary = new Set();
  mocks.diff = "";
  mocks.changed = [];
  mocks.heads = {};
  mocks.prefixes = {};
  mocks.listeners.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useFileViewerStore.getState().close();
  vi.clearAllMocks();
});

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => {});
}

async function emit(name: string, payload: unknown) {
  await act(async () => mocks.listeners.get(name)?.forEach((cb) => cb(payload)));
  await settle();
}

async function open(absPath: string, line = 0, projectRoot = "/proj") {
  await act(async () => {
    root.render(
      <FileViewerModal
        open
        absPath={absPath}
        line={line}
        col={0}
        projectRoot={projectRoot}
        onClose={onClose}
      />,
    );
  });
  await act(async () => {});
  await act(async () => {});
}

function change(rel: string, status: string, head: string, unified: string) {
  mocks.changed.push({ path: rel, status });
  mocks.heads[rel] = head;
  mocks.diff = unified;
}

function viewButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('[aria-label="View mode"] button')].find(
    (b) => b.textContent === label,
  );
}

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("header button")].find(
    (b) => b.textContent === label,
  );
}

const editor = () => document.querySelector<HTMLTextAreaElement>('textarea[data-testid="monaco"]');

async function type(text: string) {
  const el = editor();
  if (!el) throw new Error("no editor");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const heading = () => document.querySelector("h1")?.textContent ?? null;
const lines = (text: string | null | undefined) => (text ?? "").split("\n");
const sourceShows = (text: string) =>
  [...document.querySelectorAll(".whitespace-pre")].some((el) => el.textContent === text) ||
  lines(editor()?.value).includes(text) ||
  [...document.querySelectorAll('[data-testid="diff"]')].some(
    (d) => lines(d.getAttribute("data-original")).includes(text) || lines(d.textContent).includes(text),
  );
const pageText = () => document.body.textContent ?? "";

describe("FileViewerModal Markdown", () => {
  it("opens a Markdown file rendered, with its source a click away", async () => {
    await open(DOC);
    expect(heading()).toBe("Design");
    expect(viewButton("Preview")?.getAttribute("aria-pressed")).toBe("true");
    expect(viewButton("Diff")).toBeUndefined();

    await act(async () => viewButton("Source")?.click());
    expect(heading()).toBeNull();
    expect(sourceShows("# Design")).toBe(true);
  });

  it("opens on the source when the link points at a line", async () => {
    await open(DOC, 3);
    expect(heading()).toBeNull();
    expect(viewButton("Source")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders a changed Markdown file and offers its diff", async () => {
    change("docs/a.md", "modified", DOC_HEAD, DIFF);
    await open(DOC);
    expect(heading()).toBe("Design");

    await act(async () => viewButton("Diff")?.click());
    expect(heading()).toBeNull();
    expect(sourceShows("See the guide.")).toBe(true);
  });

  it("opens a linked file in the viewer", async () => {
    await open(DOC);
    await act(async () => document.querySelector<HTMLAnchorElement>("a[href='guide.md']")?.click());
    expect(useFileViewerStore.getState().current?.absPath).toBe("/proj/docs/guide.md");
  });

  it("leaves an unchanged file as source with no view switch", async () => {
    await open(MAIN);
    expect(document.querySelector('[aria-label="View mode"]')).toBeNull();
    expect(sourceShows("const a = 1;")).toBe(true);
  });
});

describe("FileViewerModal header", () => {
  const pathLine = () => document.querySelector("header")?.querySelector(".text-\\[12px\\]")?.textContent;

  it("shows a nested file's path within the project", async () => {
    await open(DOC);
    expect(pathLine()).toBe("docs/a.md");
  });

  it("shows the full path of a file at the project root", async () => {
    mocks.files["/proj/README.md"] = "# Readme\n";
    await open("/proj/README.md");
    expect(pathLine()).toBe("/proj/README.md");
  });

  it("shows a remote host's root file by its path on the host", async () => {
    mocks.files["/@peer-a1b2c3d4/home/ubuntu/app/AGENTS.md"] = "# Agents\n";
    await open("/@peer-a1b2c3d4/home/ubuntu/app/AGENTS.md", 0, "/@peer-a1b2c3d4/home/ubuntu/app");
    expect(pathLine()).toBe("/home/ubuntu/app/AGENTS.md");
  });
});

describe("FileViewerModal changes", () => {
  const MAIN_DIFF = [
    "diff --git a/main.ts b/main.ts",
    "--- a/main.ts",
    "+++ b/main.ts",
    "@@ -1 +1 @@",
    "-const a = 0;",
    "+const a = 1;",
  ].join("\n");

  it("opens a changed file on its diff, with the whole file a click away", async () => {
    change("main.ts", "modified", "const a = 0;\n", MAIN_DIFF);
    await open(MAIN);
    expect(viewButton("Diff")?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => viewButton("File")?.click());
    expect(editor()?.value).toBe("const a = 1;\n");
  });

  it("opens a changed file on the file itself when the link names a line", async () => {
    change("main.ts", "modified", "const a = 0;\n", MAIN_DIFF);
    await open(MAIN, 250);
    expect(viewButton("File")?.getAttribute("aria-pressed")).toBe("true");
    expect(editor()?.value).toBe("const a = 1;\n");
  });

  it("does not call a file git doesn't list as changed Modified", async () => {
    mocks.files["/proj/dist/app.js"] = "bundle();\n";
    mocks.diff = [
      "diff --git a/dist/app.js b/dist/app.js",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/dist/app.js",
      "@@ -0,0 +1 @@",
      "+bundle();",
    ].join("\n");
    await open("/proj/dist/app.js");
    expect(pageText()).not.toContain("Modified");
    expect(editor()?.value).toBe("bundle();\n");
  });
});

describe("FileViewerModal editing", () => {
  it("saves only over the text it loaded, so an agent's newer write survives", async () => {
    await open(MAIN);
    await act(async () => button("Edit")?.click());
    await type("const a = 2;\n");

    mocks.files[MAIN] = "const a = 3; // agent\n";
    await act(async () => button("Save")?.click());

    expect(commands.WriteFile).not.toHaveBeenCalled();
    expect(mocks.files[MAIN]).toBe("const a = 3; // agent\n");
    expect(pageText()).toContain("changed on disk while you were editing");
  });

  it("writes the edit when the disk still matches", async () => {
    await open(MAIN);
    await act(async () => button("Edit")?.click());
    await type("const a = 2;\n");
    await act(async () => button("Save")?.click());
    expect(mocks.files[MAIN]).toBe("const a = 2;\n");
    expect(button("Edit")).toBeDefined();
  });

  it("keeps an edit open when the backdrop is clicked", async () => {
    await open(MAIN);
    await act(async () => button("Edit")?.click());
    await type("const a = 2;\n");
    const backdrop = document.querySelector<HTMLElement>("[data-modal-overlay] > div");
    await act(async () => backdrop?.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(editor()?.value).toBe("const a = 2;\n");
  });

  it("offers no Edit for a file that could not be read", async () => {
    change("gone.ts", "deleted", "old();\n", [
      "diff --git a/gone.ts b/gone.ts",
      "deleted file mode 100644",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-old();",
    ].join("\n"));
    await open("/proj/gone.ts");
    expect(button("Edit")).toBeUndefined();
  });

  it("offers no Edit for a binary file", async () => {
    mocks.files["/proj/data/app.pdf"] = "";
    mocks.binary.add("/proj/data/app.pdf");
    await open("/proj/data/app.pdf");
    expect(button("Edit")).toBeUndefined();
    expect(editor()).toBeNull();
  });
});

describe("FileViewerModal keys", () => {
  it("closes on ⌘W instead of letting it reach the terminal", async () => {
    await open(MAIN);
    const e = new KeyboardEvent("keydown", { key: "w", metaKey: true, bubbles: true, cancelable: true });
    const reachedWindow = vi.fn();
    window.addEventListener("keydown", reachedWindow);
    await act(async () => document.body.dispatchEvent(e));
    window.removeEventListener("keydown", reachedWindow);
    expect(onClose).toHaveBeenCalled();
    expect(reachedWindow).not.toHaveBeenCalled();
  });
});

describe("FileViewerModal locations", () => {
  it("opens a ../ link from a terminal in a subfolder", async () => {
    mocks.files["/proj/shared/util.ts"] = "export const u = 1;\n";
    await open("/proj/api/../shared/util.ts", 0, "/proj/api");
    expect(editor()?.value).toBe("export const u = 1;\n");
  });

  it("finds a changed file's diff from a terminal in a repo subfolder", async () => {
    mocks.prefixes["/mono/apps/web"] = "apps/web/";
    mocks.files["/mono/apps/web/src/app.ts"] = "const v = 2;\n";
    change("apps/web/src/app.ts", "modified", "const v = 1;\n", "");
    await open("/mono/apps/web/src/app.ts", 0, "/mono/apps/web");
    await settle();
    expect(viewButton("Diff")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-testid="diff"]')?.getAttribute("data-original")).toBe(
      "const v = 1;\n",
    );
  });

  it("doesn't borrow the repo root's change for a same-named file in a subfolder", async () => {
    mocks.prefixes["/mono/apps/web"] = "apps/web/";
    mocks.files["/mono/apps/web/README.md"] = "# Web\n";
    change("README.md", "modified", "# Mono\n", "");
    await open("/mono/apps/web/README.md", 0, "/mono/apps/web");
    await settle();
    expect(pageText()).not.toContain("Modified");
    expect(heading()).toBe("Web");
  });

  it("reads a file in a paired Mac's home through a root that still routes to it", async () => {
    mocks.files["/@peer-a1b2c3d4~/notes.md"] = "# Notes\n";
    await open("/@peer-a1b2c3d4~/notes.md", 0, "/@peer-a1b2c3d4/Users/me/proj");
    const [root] = vi.mocked(commands.ReadProjectFile).mock.calls[0];
    expect(isPeerRoot(root)).toBe(true);
    expect(heading()).toBe("Notes");
  });
});

describe("FileViewerModal following the disk", () => {
  it("stays on the file, in place, when the open file turns modified", async () => {
    await open(MAIN);
    mocks.files[MAIN] = "const a = 2;\n";
    change("main.ts", "modified", "const a = 1;\n", "");
    await emit("git-changed", { path: "/proj", files: ["main.ts"] });
    expect(editor()?.value).toBe("const a = 2;\n");
    expect(viewButton("File")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the disk's text after cancelling an edit that conflicted", async () => {
    await open(MAIN);
    await act(async () => button("Edit")?.click());
    await type("const a = 2;\n");
    mocks.files[MAIN] = "const a = 3; // agent\n";
    await act(async () => button("Save")?.click());
    await act(async () => button("Cancel")?.click());
    expect(editor()?.value).toBe("const a = 3; // agent\n");
  });
});

describe("FileViewerModal zoom and focus", () => {
  it("offers zoom on a diff", async () => {
    change("main.ts", "modified", "const a = 0;\n", "");
    await open(MAIN);
    expect(viewButton("Diff")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('header [aria-label="Zoom in"]')).not.toBeNull();
  });

  it("hands focus back to the terminal after following a Markdown link", async () => {
    mocks.files["/proj/docs/guide.md"] = "# Guide\n";
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    await act(async () => root.render(<FileViewerHost />));
    await act(async () => openFileViewer({ absPath: DOC, line: 0, col: 0, projectRoot: "/proj" }));
    await settle();
    await act(async () => document.querySelector<HTMLAnchorElement>("a[href='guide.md']")?.click());
    await settle();
    expect(heading()).toBe("Guide");
    await act(async () => useFileViewerStore.getState().close());
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("FileViewerModal choices", () => {
  it("asks which file to open when a reference matches several", async () => {
    mocks.files["/proj/docs/README.md"] = "# Docs\n";
    mocks.files["/proj/mobile/README.md"] = "# Mobile\n";
    await act(async () =>
      root.render(
        <FileViewerModal
          open
          absPath="/proj/docs/README.md"
          line={3}
          col={0}
          projectRoot="/proj"
          choices={["/proj/docs/README.md", "/proj/mobile/README.md"]}
          onClose={onClose}
        />,
      ),
    );
    await settle();
    const options = [...document.querySelectorAll<HTMLButtonElement>("[role=dialog] li button")];
    expect(options.map((b) => b.querySelector(".truncate")?.textContent)).toEqual([
      "docs/README.md",
      "mobile/README.md",
    ]);
    expect(heading()).toBeNull();

    await act(async () => options[1].click());
    expect(useFileViewerStore.getState().current).toEqual({
      absPath: "/proj/mobile/README.md",
      line: 3,
      col: 0,
      projectRoot: "/proj",
    });
  });
});
