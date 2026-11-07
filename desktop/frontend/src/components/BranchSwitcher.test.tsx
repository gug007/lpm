// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { useGitStatus } from "../hooks/useGitStatus";

vi.mock("../../bridge/commands", () =>
  new Proxy(
    {},
    {
      has: () => true,
      get: (_t, prop) => (prop === "then" ? undefined : vi.fn(() => Promise.resolve(null))),
    },
  ));
vi.mock("../../bridge/runtime", () =>
  new Proxy(
    {},
    {
      has: () => true,
      get: (_t, prop) => (prop === "then" ? undefined : vi.fn()),
    },
  ));
vi.mock("../hooks/useBranchSearch", () => ({ useBranchSearch: () => null }));
vi.mock("../hooks/useRecentCommits", () => ({ useRecentCommits: () => [] }));
vi.mock("../hooks/useAIPicker", () => ({ useAIPicker: () => ({ anyAvailable: false }) }));
vi.mock("./CreateBranchModal", () => ({ CreateBranchModal: () => null }));
vi.mock("./CommitModal", () => ({ CommitModal: () => null }));
vi.mock("./AutoPRModal", () => ({ AutoPRModal: () => null }));
vi.mock("./MergeBranchDialog", () => ({ MergeBranchDialog: () => null }));
vi.mock("./PRModal", () => ({ PRModal: () => null }));
vi.mock("./history/CommitHistoryModal", () => ({ CommitHistoryModal: () => null }));
vi.mock("./ui/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

import { useOverlayStore } from "../store/overlay";
import { BranchSwitcher } from "./BranchSwitcher";

const gitState = {
  status: { isGitRepo: true, branch: "main", uncommitted: 0, ahead: 0, behind: 0, hasUpstream: true },
  branches: [{ name: "main", committerDate: 0 }],
  diffStat: null,
  refresh: vi.fn(),
} as unknown as ReturnType<typeof useGitStatus>;

// A button close to the sidebar, where a 520px menu can't hang left from it.
const NEAR_SIDEBAR = { left: 300, right: 340, top: 760, bottom: 790 } as DOMRect;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(NEAR_SIDEBAR);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(active = true) {
  act(() =>
    root.render(<BranchSwitcher projectName="web" projectPath="/tmp/web" gitState={gitState} active={active} />),
  );
}

const panel = () =>
  [...document.body.children].find((el) => (el as HTMLElement).style.position === "fixed") as
    | HTMLElement
    | undefined;
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const mouseDown = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
const openBranchMenu = () => click(container.querySelector('[aria-label="Switch branch"]')!);
const openCommitMenu = () => click([...container.querySelectorAll("button")].at(-1)!);

describe.each([
  { name: "branch", open: openBranchMenu, width: "520px", content: "Local" },
  { name: "commit", open: openCommitMenu, width: "320px", content: "Discard all changes" },
])("BranchSwitcher $name menu", ({ open, width, content }) => {
  it("draws outside the footer, so the pane can't clip it, and stays in the window", () => {
    render();
    open();
    expect(panel()?.textContent).toContain(content);
    expect(container.contains(panel()!)).toBe(false);
    expect(panel()?.style.width).toBe(width);
    expect(Number.parseFloat(panel()!.style.left)).toBeGreaterThanOrEqual(0);
  });

  it("stays open for a click inside it and closes for one outside", () => {
    render();
    open();
    mouseDown(panel()!.firstElementChild!);
    expect(panel()).toBeDefined();
    mouseDown(document.body);
    expect(panel()).toBeUndefined();
  });

  it("closes with its pane and hands the screen back to the in-pane browser", () => {
    render();
    open();
    expect(useOverlayStore.getState().count).toBe(1);
    render(false);
    expect(panel()).toBeUndefined();
    expect(useOverlayStore.getState().count).toBe(0);
    render(true);
    expect(panel()).toBeUndefined();
  });
});
