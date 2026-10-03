import { describe, expect, it, vi } from "vitest";
import type { ClientRect, CollisionDetection } from "@dnd-kit/core";
import type { ActionsLayout } from "../types";
import { createActionsCollision } from "./actionsCollision";
import { groupDropId, isNestId, isZoneItemId, nestId, zoneDotsId, zoneGroup, zoneItemId } from "./actionsDndLayout";

type Args = Parameters<CollisionDetection>[0];

const box = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const TOOLS = zoneItemId("tools");
const EMPTY = zoneItemId("empty");
const HEADER = groupDropId("header");
const FOOTER = groupDropId("footer");
const TOOLS_AREA = groupDropId(zoneGroup("tools"));
const EMPTY_AREA = groupDropId(zoneGroup("empty"));

const layout: ActionsLayout = {
  header: ["build", TOOLS, "lint", EMPTY, "deploy"],
  footer: ["logs"],
  zones: { tools: ["ios", "android", "web"], empty: [] },
};

// What dnd-kit measures for that layout: a 2-row zone whose second column has
// a free cell (x 247-305, y 38-67), an empty 1-row zone, and a footer row. Each
// frame has 5px of padding and border around its drop area. Listed in
// registration order, which decides ties: children (nest zones, drop areas)
// register before their parents.
const button = (id: string, rect: ClientRect): [string, ClientRect][] => [
  [nestId(id), rect],
  [id, rect],
];
const scene = (): [string, ClientRect][] => [
  ...button("build", box(110, 0, 60, 32)),
  ...button("ios", box(185, 5, 58, 29)),
  ...button("android", box(185, 38, 58, 29)),
  ...button("web", box(247, 5, 58, 29)),
  [TOOLS_AREA, box(185, 5, 120, 62)],
  [TOOLS, box(180, 0, 130, 72)],
  ...button("lint", box(320, 0, 60, 32)),
  [EMPTY_AREA, box(395, 5, 150, 22)],
  [EMPTY, box(390, 0, 160, 32)],
  ...button("deploy", box(560, 0, 70, 32)),
  [HEADER, box(100, 0, 600, 72)],
  ...button("logs", box(640, 303, 50, 24)),
  [FOOTER, box(100, 300, 600, 30)],
];
// The tools zone moved 70px right and its frame was re-measured, but its drop
// area kept the old rect, which now covers build.
const staleToolsArea = (): [string, ClientRect][] =>
  scene().map(([id, rect]) => (id === TOOLS_AREA ? [id, box(115, 5, 120, 62)] : [id, rect]));

const SHIP = zoneItemId("ship");
const SHIP_AREA = groupDropId(zoneGroup("ship"));
const withShip: ActionsLayout = {
  header: layout.header,
  footer: ["logs", SHIP, "shell"],
  zones: { ...layout.zones, ship: ["prod"] },
};
// The footer of that layout: logs, a 2-row footer zone (frame 57px tall, drop
// area inset 5px) holding prod with a free cell under it (x 625-675, y 330.5-352),
// and shell.
const shipScene = (): [string, ClientRect][] => [
  ...scene().filter(([id]) => id !== FOOTER && id !== "logs" && id !== nestId("logs")),
  ...button("logs", box(560, 300, 50, 26.5)),
  ...button("prod", box(625, 305, 50, 21.5)),
  [SHIP_AREA, box(625, 305, 50, 47)],
  [SHIP, box(620, 300, 60, 57)],
  ...button("shell", box(690, 300, 50, 26.5)),
  [FOOTER, box(100, 300, 700, 57)],
];

interface DragOptions {
  movingRight?: boolean;
  rects?: [string, ClientRect][];
}

// The dragged overlay is a 40x24 box centred on the pointer; its start
// position sits behind it, so the drag reads as moving left or right.
function argsAt(
  activeId: string,
  x: number,
  y: number,
  { movingRight = false, rects = scene() }: DragOptions = {},
): Args {
  const collisionRect = box(x - 20, y - 12, 40, 24);
  const initial = box(collisionRect.left + (movingRight ? -30 : 30), y - 12, 40, 24);
  return {
    active: {
      id: activeId,
      data: { current: {} },
      rect: { current: { initial, translated: collisionRect } },
    },
    collisionRect,
    droppableRects: new Map(rects),
    droppableContainers: rects.map(([id, rect]) => ({
      id,
      key: id,
      disabled: false,
      node: { current: null },
      data: { current: {} },
      rect: { current: rect },
    })),
    pointerCoordinates: { x, y },
  } as unknown as Args;
}

function setup(
  canNest: (activeId: string, targetId: string) => boolean = () => true,
  forLayout: ActionsLayout = layout,
  openListOf?: (zone: string) => string,
) {
  const updateIndicator = vi.fn();
  const updateMenuDrop = vi.fn();
  const held = { current: null };
  const detect = createActionsCollision({
    layout: forLayout,
    canNest,
    updateIndicator,
    updateMenuDrop,
    held,
    openListOf,
  });
  const ids = (args: Args) => detect(args).map((c) => String(c.id));
  const indicator = () => updateIndicator.mock.lastCall?.[0];
  return { ids, indicator };
}

describe("a dragged zone", () => {
  it("targets header buttons and other zones by their frames", () => {
    const { ids } = setup();
    expect(ids(argsAt(TOOLS, 350, 16))).toEqual(["lint"]);
    expect(ids(argsAt(TOOLS, 470, 16))).toEqual([EMPTY]);
  });

  it("counts its own slot, so a drop in place stays a no-op", () => {
    const { ids } = setup();
    expect(ids(argsAt(TOOLS, 214, 20))).toEqual([TOOLS]);
    expect(ids(argsAt(TOOLS, 270, 50))).toEqual([TOOLS]);
  });

  it("falls back to the header row between items", () => {
    expect(setup().ids(argsAt(TOOLS, 650, 50))).toEqual([HEADER]);
  });

  it("targets footer buttons and the footer row", () => {
    const { ids } = setup();
    expect(ids(argsAt(TOOLS, 660, 315))).toEqual(["logs"]);
    expect(ids(argsAt(TOOLS, 150, 315))).toEqual([FOOTER]);
  });

  it("outside every droppable, reaches the nearest header or footer item", () => {
    const hits = setup().ids(argsAt(TOOLS, 660, 280));
    expect(hits[0]).toBe("logs");
    expect([...hits].sort()).toEqual([...layout.header, HEADER, ...layout.footer, FOOTER].sort());
  });
});

describe("a button dragged over a zone", () => {
  it("targets the zone button under the pointer", () => {
    const { ids } = setup();
    expect(ids(argsAt("lint", 190, 15))).toEqual(["ios"]);
    expect(ids(argsAt("lint", 252, 15))).toEqual(["web"]);
  });

  it("nests into a zone button from its leading part when it can nest", () => {
    // Moving left, the leading part is the right 45% of the button.
    expect(setup().ids(argsAt("lint", 230, 15))).toEqual([nestId("ios")]);
    expect(setup().ids(argsAt("build", 190, 15, { movingRight: true }))).toEqual([nestId("ios")]);
    expect(setup(() => false).ids(argsAt("lint", 230, 15))).toEqual(["ios"]);
  });

  it("lands in the zone's drop area over its empty space or the frame's padding", () => {
    const { ids } = setup();
    expect(ids(argsAt("lint", 270, 50))).toEqual([TOOLS_AREA]);
    expect(ids(argsAt("lint", 182, 36))).toEqual([TOOLS_AREA]);
    expect(ids(argsAt("lint", 240, 2))).toEqual([TOOLS_AREA]);
    expect(ids(argsAt("lint", 308, 36))).toEqual([TOOLS_AREA]);
    expect(ids(argsAt("lint", 470, 16))).toEqual([EMPTY_AREA]);
  });

  it("counts its own slot inside a zone", () => {
    const { ids } = setup();
    expect(ids(argsAt("ios", 214, 20))).toEqual(["ios"]);
    expect(ids(argsAt("ios", 214, 50))).toEqual(["android"]);
  });

  it("reads the zone from its frame, not from a drop area left stale by a preview", () => {
    expect(setup().ids(argsAt("lint", 125, 16, { rects: staleToolsArea() }))).toEqual(["build"]);
  });

  it("outside every droppable, joins the nearest zone instead of taking its place in the header", () => {
    // The frame and its drop area share a centre; listing the frame first
    // would hand it the tie.
    const frameFirst = [...scene().filter(([id]) => id === EMPTY), ...scene().filter(([id]) => id !== EMPTY)];
    const hits = setup().ids(argsAt("lint", 470, 90, { rects: frameFirst }));
    expect(hits[0]).toBe(EMPTY_AREA);
    expect(hits.filter(isZoneItemId)).toEqual([]);
  });
});

describe("a button dragged outside zones", () => {
  it("nests from a button's leading part and reorders past it", () => {
    const { ids } = setup();
    expect(ids(argsAt("build", 330, 16, { movingRight: true }))).toEqual([nestId("lint")]);
    expect(ids(argsAt("build", 370, 16, { movingRight: true }))).toEqual(["lint"]);
  });

  it("targets the row under the pointer between buttons", () => {
    const { ids } = setup();
    expect(ids(argsAt("lint", 650, 50))).toEqual([HEADER]);
    expect(ids(argsAt("lint", 150, 315))).toEqual([FOOTER]);
  });

  it("outside every droppable, goes to the nearest button instead of nesting into it", () => {
    // Each point is clear of every rect. A button's nest area has the button's
    // rect and registers first, so it would win the tie for the nearest.
    for (const [x, y, nearest] of [
      [120, 90, "build"],
      [720, 20, "deploy"],
      [665, 270, "logs"],
    ] as const) {
      const hits = setup().ids(argsAt("lint", x, y));
      expect(hits[0], `at ${x},${y}`).toBe(nearest);
      expect(hits.filter(isNestId)).toEqual([]);
    }
  });

  it("outside every droppable, stays on its own slot instead of reverting through its nest area", () => {
    const hits = setup().ids(argsAt("build", 120, 90));
    expect(hits[0]).toBe("build");
    expect(hits.filter(isNestId)).toEqual([]);
  });
});

describe("a menu item dragged out", () => {
  const child = "deploy:staging";

  it("joins a zone at its end over its empty space or the frame's padding", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 270, 50))).toEqual(["web"]);
    expect(indicator()).toEqual({ group: "zone:tools", index: 3 });
    expect(ids(argsAt(child, 182, 36))).toEqual(["web"]);
    expect(indicator()).toEqual({ group: "zone:tools", index: 3 });
  });

  it("joins an empty zone at its only slot", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 470, 16))).toEqual([EMPTY_AREA]);
    expect(indicator()).toEqual({ group: "zone:empty", index: 0 });
  });

  it("joins a zone at its end from a zone button's trailing part", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 190, 15))).toEqual(["web"]);
    expect(indicator()).toEqual({ group: "zone:tools", index: 3 });
  });

  it("nests into a zone button from its leading part", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 230, 15))).toEqual([nestId("ios")]);
    expect(indicator()).toBeNull();
  });

  it("opens a gap between header buttons outside zones", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 175, 50))).toEqual([TOOLS]);
    expect(indicator()).toEqual({ group: "header", index: 1 });
    expect(ids(argsAt(child, 650, 50))).toEqual(["deploy"]);
    expect(indicator()).toEqual({ group: "header", index: 5 });
  });

  it("opens a gap in the footer", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 150, 315))).toEqual(["logs"]);
    expect(indicator()).toEqual({ group: "footer", index: 0 });
  });

  it("does not join a zone whose stale drop area is under the pointer", () => {
    const { ids, indicator } = setup();
    expect(ids(argsAt(child, 125, 50, { rects: staleToolsArea() }))).toEqual(["build"]);
    expect(indicator()).toEqual({ group: "header", index: 0 });
  });

  it("outside every droppable, goes to the nearest button instead of nesting into it", () => {
    const hits = setup().ids(argsAt(child, 120, 90));
    expect(hits[0]).toBe("build");
    expect(hits.filter(isNestId)).toEqual([]);
  });
});

describe("a footer zone", () => {
  const ship = () => setup(() => true, withShip);
  const at = (id: string, x: number, y: number) => argsAt(id, x, y, { rects: shipScene() });

  it("takes a dragged header zone by its frame, never by its contents", () => {
    const { ids } = ship();
    expect(ids(at(TOOLS, 650, 315))).toEqual([SHIP]);
    expect(ids(at(TOOLS, 650, 341))).toEqual([SHIP]);
    expect(ids(at(TOOLS, 585, 313))).toEqual(["logs"]);
    expect(ids(at(TOOLS, 585, 345))).toEqual([FOOTER]);
  });

  it("goes to header items, header zones' frames and footer items when dragged itself", () => {
    const { ids } = ship();
    expect(ids(at(SHIP, 350, 16))).toEqual(["lint"]);
    expect(ids(at(SHIP, 214, 20))).toEqual([TOOLS]);
    expect(ids(at(SHIP, 715, 313))).toEqual(["shell"]);
    expect(ids(at(SHIP, 650, 315))).toEqual([SHIP]);
  });

  it("takes a button inside it like a header zone does", () => {
    const { ids } = ship();
    expect(ids(at("lint", 635, 315))).toEqual(["prod"]);
    expect(ids(at("lint", 670, 315))).toEqual([nestId("prod")]);
    expect(ids(at("lint", 650, 341))).toEqual([SHIP_AREA]);
    expect(ids(at("lint", 622, 330))).toEqual([SHIP_AREA]);
  });

  it("takes a menu item dragged out at its end", () => {
    const { ids, indicator } = ship();
    expect(ids(at("deploy:staging", 650, 341))).toEqual(["prod"]);
    expect(indicator()).toEqual({ group: "zone:ship", index: 1 });
  });
});

describe("a still pointer", () => {
  // A preview moved everything but the rows 70px right, under the pointer.
  const reflowed = (): [string, ClientRect][] =>
    scene().map(([id, rect]) => {
      if (id === HEADER || id === FOOTER) return [id, rect];
      return [id, box(rect.left + 70, rect.top, rect.width, rect.height)];
    });

  it("keeps a button drag's target while a preview reflows the rows", () => {
    const { ids } = setup();
    expect(ids(argsAt("lint", 190, 15))).toEqual(["ios"]);
    expect(ids(argsAt("lint", 190, 15, { rects: reflowed() }))).toEqual(["ios"]);
    expect(ids(argsAt("lint", 191, 15, { rects: reflowed() }))).toEqual(["build"]);
  });

  it("keeps a zone drag's and a menu item's target too", () => {
    const zone = setup();
    expect(zone.ids(argsAt(TOOLS, 350, 16))).toEqual(["lint"]);
    expect(zone.ids(argsAt(TOOLS, 350, 16, { rects: reflowed() }))).toEqual(["lint"]);
    const menu = setup();
    expect(menu.ids(argsAt("deploy:staging", 270, 50))).toEqual(["web"]);
    expect(menu.ids(argsAt("deploy:staging", 270, 50, { rects: reflowed() }))).toEqual(["web"]);
    expect(menu.indicator()).toEqual({ group: "zone:tools", index: 3 });
  });
});

describe("a zone with layers", () => {
  const layered: ActionsLayout = {
    ...layout,
    zones: { "tools/a": ["ios", "android", "web"], "tools/b": ["sim"], empty: [] },
  };
  const OPEN_AREA = groupDropId(zoneGroup("tools/b"));
  // Only the open layer registers droppables: layer b's one button and its drop area.
  const layeredScene = (): [string, ClientRect][] =>
    scene().flatMap(([id, rect]): [string, ClientRect][] => {
      if (id === TOOLS_AREA) return [...button("sim", box(185, 5, 58, 29)), [OPEN_AREA, rect]];
      return ["ios", "android", "web"].some((name) => id === name || id === nestId(name)) ? [] : [[id, rect]];
    });
  const openB = (zone: string) => (zone === "tools" ? "tools/b" : zone);

  it("takes a button into its open layer", () => {
    const { ids } = setup(undefined, layered, openB);
    expect(ids(argsAt("lint", 270, 50, { rects: layeredScene() }))).toEqual([OPEN_AREA]);
    expect(ids(argsAt("lint", 214, 20, { rects: layeredScene() }))).toEqual(["sim"]);
  });

  it("takes a menu item dragged out at its open layer's end", () => {
    const { ids, indicator } = setup(undefined, layered, openB);
    expect(ids(argsAt("deploy:staging", 270, 50, { rects: layeredScene() }))).toEqual(["sim"]);
    expect(indicator()).toEqual({ group: "zone:tools/b", index: 1 });
  });

  // The dots pill hangs 8px below the frame (y 65-80), outside the frame and the header row.
  const DOTS = zoneDotsId("tools");
  const withDots = (): [string, ClientRect][] => [[DOTS, box(225, 65, 40, 15)], ...layeredScene()];

  it("takes a button over its dots, below the frame or on it, at its open layer's end", () => {
    const { ids } = setup(undefined, layered, openB);
    expect(ids(argsAt("lint", 245, 76, { rects: withDots() }))).toEqual([OPEN_AREA]);
    expect(ids(argsAt("lint", 245, 68, { rects: withDots() }))).toEqual([OPEN_AREA]);
  });

  it("takes a menu item over its dots at its open layer's end", () => {
    const { ids, indicator } = setup(undefined, layered, openB);
    expect(ids(argsAt("deploy:staging", 245, 76, { rects: withDots() }))).toEqual(["sim"]);
    expect(indicator()).toEqual({ group: "zone:tools/b", index: 1 });
  });

  it("never targets the dots themselves from outside every droppable", () => {
    const { ids } = setup(undefined, layered, openB);
    expect(ids(argsAt("lint", 245, 200, { rects: withDots() }))).not.toContain(DOTS);
  });

  it("answers a still pointer afresh once a hover on the dots opens another layer", () => {
    let open = "tools/a";
    const { ids } = setup(undefined, layered, (zone) => (zone === "tools" ? open : zone));
    expect(ids(argsAt("lint", 245, 76, { rects: withDots() }))).toEqual([groupDropId(zoneGroup("tools/a"))]);
    open = "tools/b";
    expect(ids(argsAt("lint", 245, 76, { rects: withDots() }))).toEqual([OPEN_AREA]);
  });
});
