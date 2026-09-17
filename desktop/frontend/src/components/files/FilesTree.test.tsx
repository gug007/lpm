// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesTree } from "./FilesTree";
import type { Listing, TreeRow } from "./treeModel";
import type { Changes } from "./useChangedFiles";

let container: HTMLDivElement;
let root: Root;

const row = (path: string, isDir: boolean, depth: number): TreeRow => ({
  path,
  isDir,
  name: path.split("/").pop() ?? path,
  depth,
  expanded: isDir,
  loading: false,
  error: null,
});
const ROWS = [row("src", true, 0), row("src/a.ts", false, 1), row("src/b.ts", false, 1)];
const ROOT: Listing = { status: "ready", entries: [{ name: "src", isDir: true }] };
const NO_CHANGES: Changes = { status: "ready", files: [] };

function render(over: Partial<Parameters<typeof FilesTree>[0]> = {}) {
  const onActivate = vi.fn();
  const onCursorChange = vi.fn();
  const onChangesOnlyChange = vi.fn();
  const props = {
    rows: ROWS,
    rootListing: ROOT,
    changes: NO_CHANGES,
    decorations: new Map<string, string>(),
    changesOnly: false,
    onChangesOnlyChange,
    selectedPath: null,
    dirtyPaths: new Set<string>(),
    query: "",
    onQueryChange: vi.fn(),
    results: null,
    cursorRequest: null,
    filterFocusRequest: 0,
    onActivate,
    onToggleDir: vi.fn(),
    onRowMenu: vi.fn(),
    onCursorChange,
    ...over,
  };
  act(() => root.render(<FilesTree {...props} />));
  const list = container.querySelector<HTMLElement>('[role="tree"]')!;
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Filter files"]')!;
  return {
    list,
    input,
    onActivate,
    onCursorChange,
    onChangesOnlyChange,
    rerender: (next: Partial<typeof props>) => act(() => root.render(<FilesTree {...props} {...next} />)),
  };
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FilesTree keyboard", () => {
  it("moves focus from the list to the filter on /", () => {
    const { list, input } = render();
    act(() => list.focus());
    press(list, "/");
    expect(document.activeElement).toBe(input);
  });

  it("opens into the editor on Enter and previews on Space", () => {
    const { list, onActivate } = render();
    act(() => list.focus());
    press(list, "ArrowDown");
    press(list, "ArrowDown");
    press(list, "Enter");
    expect(onActivate).toHaveBeenLastCalledWith(ROWS[1], { focusEditor: true });
    press(list, " ");
    expect(onActivate).toHaveBeenLastCalledWith(ROWS[1], undefined);
  });

  it("reports the cursor row only while the list has focus", () => {
    const { list, onCursorChange } = render();
    act(() => list.focus());
    press(list, "ArrowDown");
    expect(onCursorChange).toHaveBeenLastCalledWith(ROWS[0]);
    act(() => list.blur());
    expect(onCursorChange).toHaveBeenLastCalledWith(null);
  });

  it("focuses and selects the filter when asked", () => {
    const { input, rerender } = render({ query: "tree" });
    const select = vi.spyOn(input, "select");
    rerender({ filterFocusRequest: 1 });
    expect(document.activeElement).toBe(input);
    expect(select).toHaveBeenCalled();
  });
});

describe("FilesTree changes only", () => {
  const toggle = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Uncommitted files only"]')!;

  it("switches the rail from the toolbar button", () => {
    const { onChangesOnlyChange } = render();
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    act(() => toggle().click());
    expect(onChangesOnlyChange).toHaveBeenCalledWith(true);
  });

  it("marks changed files with a letter and their folders with a dot", () => {
    render({
      decorations: new Map([
        ["src", "modified"],
        ["src/a.ts", "modified"],
        ["src/b.ts", "untracked"],
      ]),
    });
    const marks = [...container.querySelectorAll('[role="treeitem"] span[title]')].map(
      (el) => `${el.getAttribute("title")}:${el.textContent}`,
    );
    expect(marks).toEqual(["Contains changes:", "modified:M", "untracked:U"]);
  });

  it("says so when the working tree is clean", () => {
    const { list } = render({ changesOnly: true, rows: [] });
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(list.textContent).toContain("No uncommitted changes");
  });

  it("shows the git error instead of an empty list", () => {
    const { list } = render({
      changesOnly: true,
      rows: [],
      changes: { status: "error", message: "not a git repository" },
    });
    expect(list.textContent).toContain("not a git repository");
  });
});
