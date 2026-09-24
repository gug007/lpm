// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  diff: "",
}));

vi.mock("../../bridge/commands", () => ({
  ReadFile: vi.fn((path: string) =>
    path in mocks.files ? Promise.resolve(mocks.files[path]) : Promise.reject(new Error("missing")),
  ),
  GitDiff: vi.fn(() => Promise.resolve(mocks.diff)),
  WriteFile: vi.fn(() => Promise.resolve()),
  NotesReadFileAsInput: vi.fn(() => Promise.reject(new Error("no image"))),
}));
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));
vi.mock("../highlight", () => ({
  getLang: () => "",
  ensureLang: () => Promise.resolve(false),
  tokenizeLines: () => Promise.resolve([]),
}));
vi.mock("./MonacoEditor", () => ({ MonacoEditor: () => <div data-testid="monaco" /> }));
vi.mock("./OpenFileWithDropdown", () => ({ OpenFileWithDropdown: () => null }));

import { useFileViewerStore } from "../store/fileViewer";
import { FileViewerModal } from "./FileViewerModal";

const DOC = "/proj/docs/a.md";
const DOC_TEXT = "# Design\n\nSee [the guide](guide.md).\n";
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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.files = { [DOC]: DOC_TEXT, "/proj/main.ts": "const a = 1;\n" };
  mocks.diff = "";
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useFileViewerStore.getState().close();
  vi.clearAllMocks();
});

async function open(absPath: string, line = 0) {
  await act(async () => {
    root.render(
      <FileViewerModal
        open
        absPath={absPath}
        line={line}
        col={0}
        projectRoot="/proj"
        onClose={() => {}}
      />,
    );
  });
  await act(async () => {});
}

function viewButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('[aria-label="View mode"] button')].find(
    (b) => b.textContent === label,
  );
}

const heading = () => document.querySelector("h1")?.textContent ?? null;
const sourceShows = (text: string) =>
  [...document.querySelectorAll(".whitespace-pre")].some((el) => el.textContent === text);

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
    mocks.diff = DIFF;
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

  it("leaves other files as source with no view switch", async () => {
    await open("/proj/main.ts");
    expect(document.querySelector('[aria-label="View mode"]')).toBeNull();
    expect(sourceShows("const a = 1;")).toBe(true);
  });
});
