// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRowMenu } from "./useRowMenu";
import { ZoneFrame } from "../components/ZoneFrame";

function Probe() {
  const { menu, onHeaderContextMenu, onFooterContextMenu } = useRowMenu();
  return (
    <>
      <div onContextMenu={onHeaderContextMenu}>
        <h1 data-testid="title">web</h1>
        <button data-testid="run">Run</button>
        <ZoneFrame rows={1} state="empty">
          <div data-testid="zone-pad" />
        </ZoneFrame>
        <div data-testid="taken" onContextMenu={(e) => e.preventDefault()} />
      </div>
      <div onContextMenu={onFooterContextMenu}>
        <span data-testid="tip">tip</span>
      </div>
      <output data-testid="menu">{JSON.stringify(menu)}</output>
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`)!;
const menu = () => JSON.parse(q("menu").textContent!);

function rightClick(target: Element): MouseEvent {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
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
  act(() => root.render(<Probe />));
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  act(() => root.unmount());
  container.remove();
});

describe("useRowMenu", () => {
  it("opens the header menu on empty header space in place of the system menu", () => {
    const e = rightClick(q("title"));
    expect(e.defaultPrevented).toBe(true);
    expect(menu()).toEqual({ x: 10, y: 20, row: "header" });
  });

  it("opens the footer menu on empty footer space", () => {
    rightClick(q("tip"));
    expect(menu()).toEqual({ x: 10, y: 20, row: "footer" });
  });

  it("keeps the system menu on a button and on a zone", () => {
    for (const id of ["run", "zone-pad"]) {
      expect(rightClick(q(id)).defaultPrevented, id).toBe(false);
      expect(menu(), id).toBeNull();
    }
  });

  it("leaves a right-click another handler took", () => {
    rightClick(q("taken"));
    expect(menu()).toBeNull();
  });

  it("keeps the system menu on selected text, so it can be copied", () => {
    window.getSelection()!.selectAllChildren(q("title"));
    expect(rightClick(q("title")).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    window.getSelection()!.removeAllRanges();
    rightClick(q("title"));
    expect(menu()).toEqual({ x: 10, y: 20, row: "header" });
  });

  it("still opens its menu when the selection is elsewhere", () => {
    window.getSelection()!.selectAllChildren(q("title"));
    expect(rightClick(q("tip")).defaultPrevented).toBe(true);
    expect(menu()).toEqual({ x: 10, y: 20, row: "footer" });
  });
});
