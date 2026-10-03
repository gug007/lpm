// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildActionsModel } from "../../actionsLayoutModel";
import { useRowMenu } from "../../hooks/useRowMenu";
import type { ActionInfo, ZoneInfo } from "../../types";
import type { TerminalViewHandle } from "../TerminalView";

vi.mock("../TerminalView", () => ({ TerminalView: () => <div data-testid="terminal" /> }));
vi.mock("../../hooks/useGitStatus", () => ({ useGitStatus: () => ({ status: null }) }));
vi.mock("../../hooks/useBranchPullRequest", () => ({ useBranchPullRequest: () => null }));
vi.mock("../BranchSwitcher", () => ({ BranchSwitcher: () => null }));
vi.mock("../BranchPrLink", () => ({ BranchPrLink: () => null }));
vi.mock("../AppTip", () => ({ AppTip: () => <div data-testid="tip" /> }));

import { TerminalPane } from "./TerminalPane";

const action = (name: string, display: string, position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;
const SHIP: ZoneInfo = { name: "ship", label: "Ship", rows: 1, display: "footer", position: 2, source: "project" };

function PaneWithRowMenu() {
  const { menu, onFooterContextMenu } = useRowMenu();
  const model = buildActionsModel([action("logs", "footer", 1), action("prod", "ship")], [SHIP]);
  return (
    <>
      <TerminalPane
        active
        visible
        keysActive
        showEmptyState={false}
        themeStyle={undefined}
        terminalRef={createRef<TerminalViewHandle>()}
        projectName="web"
        projectRoot="/tmp/web"
        services={[]}
        terminalTheme="default"
        fontSize={13}
        paneStatus={{ running: new Set(), done: new Set(), waiting: new Set(), error: new Set(), agents: new Map() }}
        footerItems={model.footerItems}
        layout={model.layout}
        disabled={false}
        onTerminalCountChange={() => {}}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onRunAction={() => {}}
        onFooterContextMenu={onFooterContextMenu}
        onNewTerminal={() => {}}
        onEditConfig={() => {}}
      />
      <output data-testid="menu">{JSON.stringify(menu)}</output>
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
const q = (selector: string) => container.querySelector(selector)!;
const menu = () => JSON.parse(q('[data-testid="menu"]').textContent!);

function rightClick(target: Element): MouseEvent {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <DndContext>
        <PaneWithRowMenu />
      </DndContext>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TerminalPane footer row menu", () => {
  it("opens on empty footer space, in place of the system menu", () => {
    expect(rightClick(q('[data-testid="tip"]')).defaultPrevented).toBe(true);
    expect(menu()).toEqual({ x: 30, y: 40, row: "footer" });
  });

  it("leaves a footer button and a footer zone to their own menus", () => {
    for (const target of [q("button"), q("[data-zone-frame]")]) {
      expect(rightClick(target).defaultPrevented).toBe(false);
      expect(menu()).toBeNull();
    }
  });

  it("leaves the terminal above it to its own menu", () => {
    expect(rightClick(q('[data-testid="terminal"]')).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });
});
