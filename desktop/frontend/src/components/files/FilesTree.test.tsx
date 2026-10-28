// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMac } from "../../platform";
import type { NameEditView } from "./FilesNameInput";
import { FilesTree } from "./FilesTree";
import { DRAFT_PATH } from "./treeEdits";
import type { Listing, TreeRow } from "./treeModel";
import type { Changes } from "./useChangedFiles";
import type { TreeEdits } from "./useTreeEdits";

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
  const props = {
    rows: ROWS,
    rootListing: ROOT,
    changes: NO_CHANGES,
    decorations: new Map<string, string>(),
    ignoredPaths: new Set<string>(),
    changesOnly: false,
    allChanges: false,
    onAllChangesChange: vi.fn(),
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
    onDiscard: vi.fn(),
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
    expect(list.textContent).toContain("No uncommitted changes");
  });

  it("offers the whole diff stack above the changed files", () => {
    const changes: Changes = {
      status: "ready",
      files: [{ path: "src/a.ts", status: "modified" }],
    };
    const onAllChangesChange = vi.fn();
    const { rerender } = render({ changesOnly: true, changes, onAllChangesChange });
    const row = () =>
      container.querySelector<HTMLButtonElement>('button[title="Show every change as one diff"]');
    expect(row()!.textContent).toBe("View all changes1");
    act(() => row()!.click());
    expect(onAllChangesChange).toHaveBeenCalledWith(true);
    rerender({ allChanges: true });
    act(() => row()!.click());
    expect(onAllChangesChange).toHaveBeenLastCalledWith(false);
    rerender({ allChanges: false, changes: NO_CHANGES });
    expect(row()).toBe(null);
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

describe("FilesTree edits", () => {
  const edits = (over: Partial<TreeEdits> = {}): TreeEdits => ({
    edit: null,
    view: null,
    pending: [],
    blocked: null,
    create: vi.fn(),
    rename: vi.fn(),
    trash: vi.fn(),
    ...over,
  });
  const draft = (over: Partial<NameEditView> = {}): NameEditView => ({
    path: DRAFT_PATH,
    initial: "",
    isDir: false,
    problem: null,
    busy: false,
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onBlur: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  });
  const newFile = () => container.querySelector<HTMLButtonElement>('button[aria-label="New file"]')!;
  const type = (input: HTMLInputElement, value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("makes a new file in the open file's folder from beside the filter", () => {
    const e = edits();
    render({ edits: e, selectedPath: "src/a.ts" });
    act(() => newFile().click());
    expect(e.create).toHaveBeenCalledWith("src", false);
  });

  it("offers no New file where the tree is read-only", () => {
    render({ edits: edits({ blocked: "Not here" }) });
    expect(newFile().disabled).toBe(true);
    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(newFile()).toBe(null);
  });

  it("names a new entry in a focused field at the top of its folder", () => {
    const view = draft();
    render({ edits: edits({ edit: { kind: "create", dir: "src", isDir: false }, view }) });
    const field = container.querySelector<HTMLInputElement>('input[aria-label="New file name"]')!;
    expect(document.activeElement).toBe(field);
    const items = [...container.querySelectorAll('[role="treeitem"]')];
    expect(items[1].contains(field)).toBe(true);
    type(field, "c.ts");
    expect(view.onChange).toHaveBeenLastCalledWith("c.ts");
    press(field, "Enter");
    expect(view.onCommit).toHaveBeenCalledWith("c.ts");
    press(field, "Escape");
    expect(view.onCancel).toHaveBeenCalled();
  });

  it("renames in place, with the name before the extension selected", () => {
    const view = draft({ path: "src/a.ts", initial: "a.ts" });
    render({ edits: edits({ edit: { kind: "rename", path: "src/a.ts", isDir: false }, view }) });
    const field = container.querySelector<HTMLInputElement>('input[aria-label="Rename a.ts"]')!;
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 1]);
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
  });

  it("shows what's wrong with the name under the field", () => {
    render({
      edits: edits({
        edit: { kind: "create", dir: "", isDir: true },
        view: draft({ isDir: true, problem: "src already exists" }),
      }),
    });
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("src already exists");
    expect(container.querySelector("input[aria-invalid]")!.getAttribute("aria-invalid")).toBe("true");
  });

  it("hides what is on its way to the Trash", () => {
    const { list } = render({ edits: edits({ pending: ["src/a.ts"] }) });
    const names = [...list.querySelectorAll('[role="treeitem"] span.truncate')].map((el) => el.textContent);
    expect(names).toEqual(["src", "b.ts"]);
  });

  it("moves the cursor's row to the Trash on the chord", () => {
    const e = edits();
    const { list } = render({ edits: e });
    act(() => list.focus());
    press(list, "ArrowDown");
    press(list, "ArrowDown");
    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(e.trash).toHaveBeenCalledWith(ROWS[1]);
  });
});
