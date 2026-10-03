// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";

const dnd = vi.hoisted(() => ({
  onDragStart: undefined as (() => void) | undefined,
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
  onDragCancel: undefined as (() => void) | undefined,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      onDragStart,
      onDragEnd,
      onDragCancel,
      children,
    }: {
      onDragStart?: () => void;
      onDragEnd?: (event: DragEndEvent) => void;
      onDragCancel?: () => void;
      children: ReactNode;
    }) => {
      dnd.onDragStart = onDragStart;
      dnd.onDragEnd = onDragEnd;
      dnd.onDragCancel = onDragCancel;
      return <>{children}</>;
    },
  };
});

import { type LayerRow, ZoneLayersEditor } from "./ZoneLayersEditor";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  dnd.onDragStart = undefined;
  dnd.onDragEnd = undefined;
  dnd.onDragCancel = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const byLabel = <T extends Element>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
const addButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add layer");
const strip = (rows: LayerRow[]) => rows.map(({ key, label }) => (key ? { key, label } : { label }));

function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function render(rows: LayerRow[]) {
  const onChange = vi.fn();
  const onDraggingChange = vi.fn();
  act(() => root.render(<ZoneLayersEditor rows={rows} onChange={onChange} onDraggingChange={onDraggingChange} />));
  return Object.assign(onChange, { onDraggingChange });
}

const keyed = (key: string, label = ""): LayerRow => ({ id: `key:${key}`, key, label });

describe("ZoneLayersEditor", () => {
  it("shows only Add layer when the zone has no layers", () => {
    render([]);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(addButton()).toBeDefined();
  });

  it("adds two layers at once to a zone without layers: one for today's buttons and a new one", () => {
    const onChange = render([]);
    act(() => addButton()!.click());
    const rows: LayerRow[] = onChange.mock.calls[0][0];
    expect(strip(rows)).toEqual([{ label: "" }, { label: "" }]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });

  it("adds one layer after the last", () => {
    const onChange = render([keyed("a", "Dev"), keyed("b")]);
    act(() => addButton()!.click());
    expect(strip(onChange.mock.calls[0][0])).toEqual([{ key: "a", label: "Dev" }, { key: "b", label: "" }, { label: "" }]);
  });

  it("numbers each row's field and remove button", () => {
    render([keyed("a", "Dev"), keyed("b")]);
    const first = byLabel<HTMLInputElement>("Layer 1 name")!;
    const second = byLabel<HTMLInputElement>("Layer 2 name")!;
    expect([first.value, first.placeholder]).toEqual(["Dev", "Layer 1"]);
    expect([second.value, second.placeholder]).toEqual(["", "Layer 2"]);
    expect(byLabel("Remove layer 2")).not.toBeNull();
  });

  it("renames a layer", () => {
    const onChange = render([keyed("a", "Dev"), keyed("b")]);
    act(() => setValue(byLabel<HTMLInputElement>("Layer 2 name")!, "Ops"));
    expect(strip(onChange.mock.calls[0][0])).toEqual([{ key: "a", label: "Dev" }, { key: "b", label: "Ops" }]);
  });

  it("removes a layer", () => {
    const onChange = render([keyed("a", "Dev"), keyed("b")]);
    act(() => byLabel<HTMLButtonElement>("Remove layer 1")!.click());
    expect(strip(onChange.mock.calls[0][0])).toEqual([{ key: "b", label: "" }]);
  });

  it("keeps the last existing layer, since removed layers' buttons move into one that stays", () => {
    const onChange = render([keyed("b"), { id: "new:1", label: "Fresh" }]);
    expect(byLabel<HTMLButtonElement>("Remove layer 1")!.disabled).toBe(true);
    expect(byLabel<HTMLButtonElement>("Remove layer 2")!.disabled).toBe(false);
    act(() => byLabel<HTMLButtonElement>("Remove layer 2")!.click());
    expect(strip(onChange.mock.calls[0][0])).toEqual([{ key: "b", label: "" }]);
  });

  it("lets every new layer go", () => {
    const onChange = render([{ id: "new:1", label: "" }]);
    expect(byLabel<HTMLButtonElement>("Remove layer 1")!.disabled).toBe(false);
    act(() => byLabel<HTMLButtonElement>("Remove layer 1")!.click());
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("reorders by dragging a row onto another", () => {
    const onChange = render([keyed("a"), keyed("b"), keyed("c")]);
    act(() => dnd.onDragEnd!({ active: { id: "key:c" }, over: { id: "key:a" } } as unknown as DragEndEvent));
    expect(strip(onChange.mock.calls[0][0]).map((row) => row.key)).toEqual(["c", "a", "b"]);
  });

  it("ignores a drag dropped where it started", () => {
    const onChange = render([keyed("a"), keyed("b")]);
    act(() => dnd.onDragEnd!({ active: { id: "key:a" }, over: { id: "key:a" } } as unknown as DragEndEvent));
    act(() => dnd.onDragEnd!({ active: { id: "key:a" }, over: null } as unknown as DragEndEvent));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports a drag from its start to its drop", () => {
    const onChange = render([keyed("a"), keyed("b")]);
    act(() => dnd.onDragStart!());
    expect(onChange.onDraggingChange).toHaveBeenLastCalledWith(true);
    act(() => dnd.onDragEnd!({ active: { id: "key:a" }, over: null } as unknown as DragEndEvent));
    expect(onChange.onDraggingChange).toHaveBeenLastCalledWith(false);
  });

  it("reports a cancelled drag as over", () => {
    const onChange = render([keyed("a"), keyed("b")]);
    act(() => dnd.onDragStart!());
    act(() => dnd.onDragCancel!());
    expect(onChange.onDraggingChange).toHaveBeenLastCalledWith(false);
  });
});
