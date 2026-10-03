// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo, ZoneInfo } from "../types";
import { buildActionsModel } from "../actionsLayoutModel";

vi.mock("../hooks/useGitStatus", () => ({ useGitStatus: () => ({ status: null }) }));
vi.mock("../hooks/useBranchPullRequest", () => ({ useBranchPullRequest: () => null }));
vi.mock("./BranchSwitcher", () => ({ BranchSwitcher: () => null }));
vi.mock("./BranchPrLink", () => ({ BranchPrLink: () => null }));
vi.mock("./AppTip", () => ({
  AppTip: ({ rowHeight }: { rowHeight?: number }) => <div data-tip={rowHeight ?? "auto"} />,
}));

import { TerminalFooter } from "./TerminalFooter";

const action = (name: string, display: string, position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;
const SHIP: ZoneInfo = { name: "ship", label: "Ship", rows: 2, display: "footer", position: 2, source: "project" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(actions: ActionInfo[], zones: ZoneInfo[]) {
  const model = buildActionsModel(actions, zones);
  act(() =>
    root.render(
      <DndContext>
        <TerminalFooter
          projectName="web"
          projectPath="/tmp/web"
          items={model.footerItems}
          layout={model.layout}
          onRunAction={() => {}}
          disabled={false}
        />
      </DndContext>,
    ),
  );
  return {
    surface: container.querySelector<HTMLElement>(".composer-terminal-surface")!,
    group: container.querySelector<HTMLElement>('[data-actions-group="footer"]')!,
    tip: container.querySelector<HTMLElement>("[data-tip]")!,
  };
}

describe("TerminalFooter", () => {
  it("is today's footer when it holds no zone", () => {
    const { surface, group, tip } = render([action("logs", "footer", 1)], []);
    expect(surface.className).toBe("composer-terminal-surface flex items-center gap-2 bg-[var(--terminal-bg)] px-3 py-2");
    expect(group.className.startsWith("flex flex-wrap items-center justify-end gap-1 ")).toBe(true);
    expect(tip.dataset.tip).toBe("auto");
    expect(group.querySelector("button")?.className).toContain("px-2.5 py-1 text-[11px]");
  });

  it("draws a footer zone in the row, aligned to the top with the tip on the first row", () => {
    const { surface, group, tip } = render([action("logs", "footer", 1), action("prod", "ship")], [SHIP]);
    expect(surface.className).toContain(" items-start ");
    expect(group.className).toContain(" items-start ");
    expect(tip.dataset.tip).toBe("26.5");
    const frame = group.querySelector<HTMLElement>('[data-actions-group="zone:ship"]')!.parentElement!;
    expect(frame.style.height).toBe("57px");
    expect(frame.querySelector("button")?.textContent).toBe("prod");
  });
});
