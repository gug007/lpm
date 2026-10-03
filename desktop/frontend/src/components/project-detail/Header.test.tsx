// @vitest-environment happy-dom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

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

function render(actionsWrapped: boolean) {
  const onRowContextMenu = vi.fn();
  act(() =>
    root.render(
      <Header
        projectName="web"
        showProjectName
        sidebarCollapsed={false}
        rowRef={createRef<HTMLDivElement>()}
        innerRef={createRef<HTMLDivElement>()}
        actionsWrapped={actionsWrapped}
        actions={<span data-testid="actions">actions</span>}
        controls={null}
        onRowContextMenu={onRowContextMenu}
      />,
    ),
  );
  return onRowContextMenu;
}

const rightClick = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

describe("Header", () => {
  it("hands right-clicks on its row to the row menu", () => {
    const handler = render(false);
    rightClick(container.querySelector("h1")!);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does so on the wrapped actions row too", () => {
    const handler = render(true);
    rightClick(container.querySelector('[data-testid="actions"]')!);
    expect(handler).toHaveBeenCalledOnce();
  });
});
