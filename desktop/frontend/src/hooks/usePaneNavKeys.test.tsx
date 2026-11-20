// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("../platform", async (orig) => ({ ...(await orig<typeof import("../platform")>()), isMac: true }));

import { findPane, makePaneLeaf, makeTerminal, type PaneNode } from "../paneTree";
import { usePaneNavKeys } from "./usePaneNavKeys";

const tree: PaneNode = {
  kind: "split",
  direction: "row",
  ratio: 0.5,
  a: makePaneLeaf("p1", [makeTerminal("claude", "Claude")], 0),
  b: makePaneLeaf("p2", [makeTerminal("t1", "Terminal 1")], 0),
};

const focusPane = vi.fn();
const focusAdjacentPaneItem = vi.fn();
const focusPaneContent = vi.fn(() => true);
let focused = "p1";

function Probe({ maximized = false }: { maximized?: boolean }) {
  usePaneNavKeys({
    enabled: true,
    tree,
    maximized,
    services: [],
    getFocusedPane: () => findPane(tree, focused),
    focusAdjacentPaneItem,
    focusPane,
    focusPaneContent,
  });
  return null;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  focused = "p1";
  focusPane.mockClear();
  focusAdjacentPaneItem.mockClear();
  focusPaneContent.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function press(key: string, mods: Partial<KeyboardEventInit> = { metaKey: true, altKey: true }) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));
  });
}

describe("usePaneNavKeys", () => {
  it("moves the focus to the next pane and into what it shows", () => {
    act(() => root.render(<Probe />));
    press("ArrowDown");
    expect(focusPane).toHaveBeenCalledWith("p2");
    expect(focusPaneContent).toHaveBeenCalledWith("p2");
  });

  it("keeps the keys from the field it was pressed in, such as the file editor's add-cursor", () => {
    act(() => root.render(<Probe />));
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    const fieldSaw = vi.fn();
    field.addEventListener("keydown", fieldSaw);
    act(() => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", metaKey: true, altKey: true, bubbles: true, cancelable: true }));
    });
    expect(focusPane).toHaveBeenCalledWith("p2");
    expect(fieldSaw).not.toHaveBeenCalled();
    field.remove();
  });

  it("wraps back to the first pane after the last", () => {
    focused = "p2";
    act(() => root.render(<Probe />));
    press("ArrowDown");
    expect(focusPane).toHaveBeenCalledWith("p1");
  });

  it("still steps tabs within the pane", () => {
    act(() => root.render(<Probe />));
    press("ArrowRight");
    expect(focusAdjacentPaneItem).toHaveBeenCalledWith("p1", 1, []);
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("leaves ⌃⌥↓ to stepping through files", () => {
    act(() => root.render(<Probe />));
    press("ArrowDown", { ctrlKey: true, altKey: true });
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("stays put while a pane is maximized", () => {
    act(() => root.render(<Probe maximized />));
    press("ArrowUp");
    expect(focusPane).not.toHaveBeenCalled();
  });
});
