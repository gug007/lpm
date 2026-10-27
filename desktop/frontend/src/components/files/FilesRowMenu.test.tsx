// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ focusProjectTerminal: vi.fn() }));

vi.mock("../../notifications/toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../../bridge/commands", () => ({
  ListOpenInTargets: vi.fn(() => Promise.resolve([])),
  LoadSettings: vi.fn(() => Promise.resolve({})),
  SaveSettings: vi.fn(() => Promise.resolve()),
  RevealInFinder: vi.fn(),
  SetClipboardText: vi.fn(),
}));
vi.mock("../../peer/uploadProgress", () => ({ trackPeerDownload: vi.fn() }));
vi.mock("../ignored/FilesSyncItems", () => ({ FilesSyncItems: () => null }));
vi.mock("../../store/app", () => ({
  useAppStore: { getState: () => ({ focusProjectTerminal: mocks.focusProjectTerminal }) },
}));

import { revealLabel } from "../../machineWords";
import { trashName } from "../../platform";
import { useComposerStore } from "../../store/composer";
import { subscribeComposerInsert } from "../../store/composerDrafts";
import { useTerminalTargets } from "../../store/terminalTargets";
import { FilesRowMenu } from "./FilesRowMenu";
import type { TreeEdits } from "./useTreeEdits";

let container: HTMLDivElement;
let root: Root;

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

function show(props: Partial<Parameters<typeof FilesRowMenu>[0]> = {}) {
  const onClose = vi.fn();
  act(() =>
    root.render(
      <FilesRowMenu
        target={{ path: "src/a.ts", isDir: false, x: 10, y: 10 }}
        absPath="/p/src/a.ts"
        projectName="shop"
        onOpen={vi.fn()}
        onClose={onClose}
        {...props}
      />,
    ),
  );
  return { onClose };
}

const item = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(label))!;

beforeEach(() => {
  useTerminalTargets.setState({ byProject: {} });
  useComposerStore.setState({ active: {}, recent: {} });
  mocks.focusProjectTerminal.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FilesRowMenu", () => {
  it("groups opening, editing, paths, then discarding last", () => {
    show({ edits: edits(), onDiscard: vi.fn() });
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent?.replace(/[⌘⌥⇧⌫].*|Ctrl.*/, ""));
    expect(labels).toEqual([
      "Open",
      "Open with",
      "Mention in agent",
      "New file…",
      "New folder…",
      "Rename…",
      `Move to ${trashName()}`,
      "Copy path",
      "Copy relative path",
      revealLabel(),
      "Discard changes",
    ]);
  });

  it("makes new entries beside a file and inside a folder", () => {
    const e = edits();
    show({ edits: e });
    act(() => item("New file").click());
    expect(e.create).toHaveBeenCalledWith("src", false);
    show({ edits: e, target: { path: "src", isDir: true, x: 0, y: 0 } });
    act(() => item("New folder").click());
    expect(e.create).toHaveBeenLastCalledWith("src", true);
  });

  it("keeps the tree as it is where it can't be changed", () => {
    show({ edits: edits({ blocked: "Not on this host" }) });
    for (const label of ["New file", "New folder", "Rename", "Move to"]) {
      expect(item(label).disabled).toBe(true);
      expect(item(label).title).toBe("Not on this host");
    }
    show();
    expect(item("Rename")).toBeUndefined();
  });

  it("mentions the file in the terminal whose input was shown last", () => {
    useTerminalTargets.setState({
      byProject: {
        shop: [
          { id: "t1", label: "Shell", emoji: "", historyKey: "h1" },
          { id: "t2", label: "Claude", emoji: "", historyKey: "h2" },
        ],
      },
    });
    useComposerStore.getState().setActive("shop", "t2");
    useComposerStore.getState().setActive("shop", null);
    const got: string[] = [];
    const stop = subscribeComposerInsert("t2", (text) => got.push(text));
    const { onClose } = show();
    act(() => item("Mention in agent").click());
    stop();
    expect(got).toEqual(["@src/a.ts "]);
    expect(onClose).toHaveBeenCalled();
    expect(mocks.focusProjectTerminal).not.toHaveBeenCalled();
  });

  it("brings a terminal whose input isn't on screen into view", () => {
    useTerminalTargets.setState({ byProject: { shop: [{ id: "t1", label: "Claude", emoji: "", historyKey: "h1" }] } });
    show();
    act(() => item("Mention in agent").click());
    expect(mocks.focusProjectTerminal).toHaveBeenCalledWith("shop", "t1");
    expect(useComposerStore.getState().open).toBe(true);
  });

  it("can't mention without a terminal to mention in", () => {
    show();
    expect(item("Mention in agent").disabled).toBe(true);
  });
});
