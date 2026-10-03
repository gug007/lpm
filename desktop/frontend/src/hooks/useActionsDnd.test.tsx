import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { zoneItemId } from "../components/actionsDndLayout";
import { type UseActionsDndResult, useActionsDnd } from "./useActionsDnd";

const layout = (): ActionsLayout => ({
  header: ["build", "lint", zoneItemId("tools")],
  footer: ["logs"],
  zones: { tools: ["ios"], empty: [] },
});

// Renders the hook once and hands back its handlers; the state setters they
// call are no-ops after a server render, so only the callbacks are observable.
function mount(current: ActionsLayout) {
  const onPreview = vi.fn();
  const onMove = vi.fn();
  const onDragActiveChange = vi.fn();
  let api!: UseActionsDndResult;
  function Probe() {
    api = useActionsDnd({
      layout: current,
      onPreview,
      onMove,
      onStructural: vi.fn(),
      canNest: () => false,
      isMenu: () => false,
      indicatorRef: { current: null },
      menuDropRef: { current: null },
      onDragActiveChange,
    });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { api, onPreview, onMove, onDragActiveChange };
}

const start = (id: string) => ({ active: { id } }) as unknown as DragStartEvent;
const over = (id: string, overId: string, x = 0, y = 0) =>
  ({ active: { id }, over: { id: overId }, delta: { x, y } }) as unknown as DragOverEvent;
const end = (id: string, overId: string) =>
  ({ active: { id }, over: { id: overId } }) as unknown as DragEndEvent;

describe("useActionsDnd previews", () => {
  it("previews a header button that moves over a zone's button", () => {
    const { api, onPreview } = mount(layout());
    api.onDragStart(start("lint"));
    api.onDragOver(over("lint", "ios", 10));
    expect(onPreview).toHaveBeenCalledTimes(1);
    const next: ActionsLayout = onPreview.mock.calls[0][0];
    expect(next.zones.tools).toEqual(["lint", "ios"]);
    expect(next.header).toEqual(["build", zoneItemId("tools")]);
  });

  it("does not preview a move inside the button's own row", () => {
    const { api, onPreview } = mount(layout());
    api.onDragStart(start("lint"));
    api.onDragOver(over("lint", "build", 10));
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("previews every change of target, so the rows show where a drop lands", () => {
    // Collision detection holds its answer while the pointer stands still,
    // so a new target here always comes from a pointer move.
    const { api, onPreview } = mount(layout());
    api.onDragStart(start("lint"));
    api.onDragOver(over("lint", "ios", 10, 4));
    api.onDragOver(over("lint", "actions-group:zone:empty", 10, 4));
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onPreview.mock.calls[1][0].zones.empty).toEqual(["lint"]);
  });

  it("commits against the layout the drag started from", () => {
    const start0 = layout();
    const { api, onMove } = mount(start0);
    api.onDragStart(start("lint"));
    api.onDragEnd(end("lint", "ios"));
    expect(onMove).toHaveBeenCalledTimes(1);
    const [next, before] = onMove.mock.calls[0];
    expect(before).toBe(start0);
    expect(next.zones.tools).toEqual(["lint", "ios"]);
  });
});

describe("useActionsDnd drag activity", () => {
  it("reports the drag from its start, end and cancel handlers, not from a later effect", () => {
    const { api, onDragActiveChange } = mount(layout());
    api.onDragStart(start("lint"));
    expect(onDragActiveChange.mock.calls).toEqual([[true]]);
    api.onDragEnd(end("lint", "build"));
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false]]);
    api.onDragStart(start("lint"));
    api.onDragCancel();
    expect(onDragActiveChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
