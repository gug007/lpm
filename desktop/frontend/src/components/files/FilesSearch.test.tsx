// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  cancel: vi.fn(),
  replace: vi.fn(),
  undo: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  diskChange: null as null | ((files: string[] | null) => void),
}));
vi.mock("../../../bridge/commands", () => ({
  SearchFiles: mocks.search,
  CancelFileSearch: mocks.cancel,
  ReplaceInFiles: mocks.replace,
  UndoReplace: mocks.undo,
}));
vi.mock("../../notifications/toast", () => ({ toast: mocks.toast }));
vi.mock("../../hooks/useGitChanged", () => ({
  useGitChanged: (_root: string, onChanged: (files: string[] | null) => void, active: boolean) => {
    mocks.diskChange = active ? onChanged : null;
  },
}));

import { FilesSearch } from "./FilesSearch";
import type { LineMatch } from "./fileSearch";
import { useFilesSearch } from "./useFilesSearch";

const A1: LineMatch = { line: 1, col: 7, len: 3, text: "const foo = 1;", start: 6 };
const A2: LineMatch = { line: 3, col: 1, len: 3, text: "foo();", start: 0 };
const B1: LineMatch = { line: 2, col: 5, len: 3, text: "// foo", start: 3 };
const REPLY = {
  files: [
    { path: "src/a.ts", matches: [A1, A2] },
    { path: "b.md", matches: [B1] },
  ],
  truncated: false,
  invalid: null,
};
const PLAIN = { matchCase: false, wholeWord: false, regex: false };
const NO_FILTERS = { include: [], exclude: [] };

let container: HTMLDivElement;
let root: Root;
type OnOpen = (path: string, match: LineMatch, focusEditor: boolean) => void;
let onOpen: ReturnType<typeof vi.fn<OnOpen>>;
let unsaved: ReadonlySet<string>;

function Harness() {
  const search = useFilesSearch("/proj", true);
  const { show } = search;
  useEffect(() => show(), [show]);
  return (
    <FilesSearch
      search={search}
      changesCount={null}
      onLeave={() => {}}
      openedKey={null}
      onOpen={onOpen}
      unsaved={unsaved}
    />
  );
}

const field = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const input = () => field("Search in files");
const list = () => container.querySelector<HTMLElement>('[aria-label="Search results"]');
const rows = () => [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
const button = (label: string, scope: ParentNode = container) =>
  scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const text = () => container.textContent ?? "";
const lastSearch = () => mocks.search.mock.calls[mocks.search.mock.calls.length - 1];

function type(target: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

async function settle(ms = 250) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function render() {
  act(() => root.render(<Harness />));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.search.mockReset().mockResolvedValue(REPLY);
  mocks.cancel.mockReset().mockResolvedValue(null);
  mocks.replace.mockReset().mockResolvedValue({ replaced: 1, files: 1, skipped: [], undoable: true });
  mocks.undo.mockReset().mockResolvedValue({ restored: 1, skipped: [] });
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
  mocks.diskChange = null;
  localStorage.clear();
  onOpen = vi.fn<OnOpen>();
  unsaved = new Set();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("FilesSearch", () => {
  it("searches as you type and shows every occurrence under its file", async () => {
    type(input(), "foo");
    expect(mocks.search).not.toHaveBeenCalled();
    await settle();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(lastSearch().slice(0, 5)).toEqual(["/proj", "foo", PLAIN, NO_FILTERS, null]);
    expect(text()).toContain("3 results in 2 files");
    const marks = [...container.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["foo", "foo", "foo"]);
    expect(rows()).toHaveLength(5);
  });

  it("stops the search still running when the query changes, and drops its answer", async () => {
    let answer: (value: typeof REPLY) => void = () => {};
    mocks.search.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    type(input(), "fo");
    await settle();
    type(input(), "foo");
    expect(mocks.cancel).toHaveBeenCalledWith("/proj", mocks.search.mock.calls[0][5]);
    await act(async () => answer({ ...REPLY, files: [REPLY.files[1]] }));
    expect(text()).not.toContain("1 result in 1 file");
    await settle();
    expect(text()).toContain("3 results in 2 files");
  });

  it("shows an invalid regex beside the field instead of failing", async () => {
    mocks.search.mockResolvedValue({ files: [], truncated: false, invalid: { field: "query", message: "unclosed group" } });
    act(() => button("Use regular expression").click());
    type(input(), "foo(");
    await settle();
    expect(lastSearch()[2]).toEqual({ ...PLAIN, regex: true });
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(text()).toContain("Not a valid regular expression: unclosed group");
    expect(list()).toBeNull();
  });

  it("searches again when a toggle changes, and remembers it", async () => {
    type(input(), "foo");
    await settle();
    act(() => button("Match case").click());
    await settle();
    expect(lastSearch().slice(0, 5)).toEqual(["/proj", "foo", { ...PLAIN, matchCase: true }, NO_FILTERS, null]);
    expect(JSON.parse(localStorage.getItem("lpm:filesSearchOptions")!)).toMatchObject({ matchCase: true });
  });

  it("walks the results by keyboard: Enter opens into the editor, Space keeps the list", async () => {
    type(input(), "foo");
    await settle();
    press(input(), "ArrowDown");
    expect(document.activeElement).toBe(list());
    press(list()!, "ArrowDown");
    press(list()!, "Enter");
    expect(onOpen).toHaveBeenLastCalledWith("src/a.ts", A1, true);
    press(list()!, "ArrowDown");
    press(list()!, " ");
    expect(onOpen).toHaveBeenLastCalledWith("src/a.ts", A2, false);
  });

  it("folds a file's occurrences with ← and on its row", async () => {
    type(input(), "foo");
    await settle();
    act(() => list()!.focus());
    press(list()!, "ArrowLeft");
    expect(rows()).toHaveLength(3);
    press(list()!, "ArrowRight");
    expect(rows()).toHaveLength(5);
    act(() => rows().find((r) => r.title === "b.md")!.click());
    expect(rows()).toHaveLength(4);
  });

  it("clears the query on Escape", async () => {
    type(input(), "foo");
    await settle();
    press(input(), "Escape");
    expect(input().value).toBe("");
    expect(list()).toBeNull();
  });
});

describe("FilesSearch keeps up with changes on disk", () => {
  it("runs again quietly after a file changes, and says when the results moved", async () => {
    type(input(), "foo");
    await settle();
    expect(mocks.diskChange).not.toBeNull();
    const moved = { ...REPLY, files: [{ path: "src/a.ts", matches: [A1, A2, { ...B1, line: 9 }] }, REPLY.files[1]] };
    mocks.search.mockResolvedValueOnce(moved);
    act(() => mocks.diskChange!(["src/a.ts"]));
    act(() => mocks.diskChange!(["src/b.ts"]));
    expect(text()).not.toContain("Searching…");
    await settle(500);
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(text()).toContain("4 results in 2 files · Updated");
    await settle(4000);
    expect(text()).not.toContain("Updated");
  });

  it("listens only while a query is typed", () => {
    expect(mocks.diskChange).toBeNull();
  });
});

describe("FilesSearch file filters", () => {
  it("searches only the files the globs let through", async () => {
    act(() => button("Files to include or exclude").click());
    type(input(), "foo");
    type(field("Files to include"), "src, *.ts");
    type(field("Files to exclude"), "*.test.ts");
    await settle();
    expect(lastSearch()[3]).toEqual({ include: ["src", "*.ts"], exclude: ["*.test.ts"] });
  });

  it("puts a bad glob under its own field", async () => {
    mocks.search.mockResolvedValue({ files: [], truncated: false, invalid: { field: "exclude", message: "unclosed class" } });
    act(() => button("Files to include or exclude").click());
    type(input(), "foo");
    type(field("Files to exclude"), "[a");
    await settle();
    expect(field("Files to exclude").getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-invalid")).toBe("false");
    expect(text()).toContain("unclosed class");
  });
});

describe("FilesSearch history", () => {
  it("brings back earlier searches with ↑ and returns with ↓", async () => {
    type(input(), "foo");
    press(input(), "Enter");
    type(input(), "bar");
    press(input(), "Enter");
    type(input(), "draft");
    press(input(), "ArrowUp");
    expect(input().value).toBe("bar");
    press(input(), "ArrowUp");
    expect(input().value).toBe("foo");
    press(input(), "ArrowDown");
    expect(input().value).toBe("bar");
    press(input(), "ArrowDown");
    expect(input().value).toBe("draft");
    const saved = JSON.parse(localStorage.getItem("lpm:filesSearchHistory:/proj")!);
    expect(saved.map((e: { query: string }) => e.query)).toEqual(["bar", "foo"]);
  });

  it("skips the newest entry when it is what the field holds", async () => {
    type(input(), "foo");
    press(input(), "Enter");
    type(input(), "bar");
    press(input(), "Enter");
    press(input(), "ArrowUp");
    expect(input().value).toBe("foo");
  });
});

describe("FilesSearch replace", () => {
  const PREVIEW = {
    ...REPLY,
    files: REPLY.files.map((f) => ({ ...f, matches: f.matches.map((m) => ({ ...m, replacement: "bar" })) })),
  };

  async function openReplace() {
    mocks.search.mockResolvedValue(PREVIEW);
    type(input(), "foo");
    act(() => button("Replace").click());
    type(field("Replace with"), "bar");
    await settle();
  }

  it("previews each replacement beside the match it replaces", async () => {
    await openReplace();
    expect(lastSearch()[4]).toBe("bar");
    expect([...container.querySelectorAll("del")].map((d) => d.textContent)).toEqual(["foo", "foo", "foo"]);
    expect([...container.querySelectorAll("ins")].map((d) => d.textContent)).toEqual(["bar", "bar", "bar"]);
  });

  it("replaces one match, offers Undo, and searches again", async () => {
    await openReplace();
    const searches = mocks.search.mock.calls.length;
    const row = rows().find((r) => r.textContent?.includes("const"))!;
    await act(async () => button("Replace", row).click());
    expect(mocks.replace).toHaveBeenCalledWith("/proj", "foo", PLAIN, "bar", ["src/a.ts"], { line: 1, col: 7 }, expect.any(String));
    expect(mocks.search.mock.calls.length).toBe(searches + 1);
    const [message, options] = mocks.toast.success.mock.calls[0];
    expect(message).toBe("Replaced 1 match in 1 file");
    await act(async () => options.action.onClick());
    expect(mocks.undo).toHaveBeenCalledWith("/proj", mocks.replace.mock.calls[0][6]);
  });

  it("asks before Replace all and leaves files with unsaved edits alone", async () => {
    unsaved = new Set(["b.md"]);
    render();
    await openReplace();
    expect(button("Replace in file", rows().find((r) => r.title === "b.md")!).disabled).toBe(true);
    act(() => button("Replace all").click());
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Replace 2 matches in 1 file with");
    expect(document.body.textContent).toContain("has unsaved edits");
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Replace all")!;
    await act(async () => confirm.click());
    expect(mocks.replace.mock.calls[0][4]).toEqual(["src/a.ts"]);
  });
});
