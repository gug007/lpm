import { describe, expect, it } from "vitest";
import YAML from "yaml";
import type { ActionInfo, ActionsLayout, ZoneInfo } from "./types";
import {
  applyActionUpdates,
  applyZoneUpdates,
  buildLayoutUpdates,
  patchLayoutDoc,
} from "./actionsLayoutUpdates";
import { layoutWithoutZone, zoneItemId } from "./components/actionsDndLayout";

const action = (name: string, display = "", type?: string): ActionInfo =>
  ({ name, label: name, cmd: name, confirm: false, display, type }) as ActionInfo;

const current = [
  action("test"),
  action("ios", "build"),
  action("logs", "footer"),
  action("shell", "", "terminal"),
];

describe("buildLayoutUpdates", () => {
  it("writes the zone name for a button that moved into a zone", () => {
    const layout: ActionsLayout = {
      header: [zoneItemId("build")],
      footer: ["logs"],
      zones: { build: ["ios", "test"] },
    };
    const { actions } = buildLayoutUpdates(current, layout);
    expect(actions.get("test")).toEqual({ position: 2, display: "build", section: "actions" });
    expect(actions.get("ios")).toEqual({ position: 1, section: "actions" });
  });

  it("writes an explicit header display for a button that went back to the header", () => {
    const layout: ActionsLayout = { header: ["test", "ios"], footer: ["logs"], zones: { build: [] } };
    expect(buildLayoutUpdates(current, layout).actions.get("ios")).toEqual({
      position: 2,
      display: "header",
      section: "actions",
    });
  });

  it("writes the new zone name for a button that moved to another zone", () => {
    const layout: ActionsLayout = {
      header: [zoneItemId("build"), zoneItemId("deploy")],
      footer: ["logs"],
      zones: { build: [], deploy: ["ios"] },
    };
    expect(buildLayoutUpdates(current, layout).actions.get("ios")).toEqual({
      position: 1,
      display: "deploy",
      section: "actions",
    });
  });

  it("writes footer for a button that moved from a zone to the footer", () => {
    const layout: ActionsLayout = {
      header: ["test", zoneItemId("build")],
      footer: ["logs", "ios"],
      zones: { build: [] },
    };
    expect(buildLayoutUpdates(current, layout).actions.get("ios")).toEqual({
      position: 2,
      display: "footer",
      section: "actions",
    });
  });

  it("leaves display alone when the header is only reordered", () => {
    const layout: ActionsLayout = {
      header: ["shell", "test"],
      footer: ["logs"],
      zones: { build: ["ios"] },
    };
    const { actions } = buildLayoutUpdates(current, layout);
    expect(actions.get("test")).toEqual({ position: 2, section: "actions" });
    expect(actions.get("shell")).toEqual({ position: 1, section: "terminals" });
  });

  it("leaves display alone when the footer is only reordered", () => {
    const withTail = [...current, action("tail", "footer")];
    const layout: ActionsLayout = {
      header: ["test"],
      footer: ["tail", "logs"],
      zones: { build: ["ios"] },
    };
    const { actions } = buildLayoutUpdates(withTail, layout);
    expect(actions.get("tail")).toEqual({ position: 1, section: "actions" });
    expect(actions.get("logs")).toEqual({ position: 2, section: "actions" });
  });

  it("counts a button whose zone is gone as a header button", () => {
    const stale = [action("test"), action("old", "gone")];
    const layout: ActionsLayout = { header: ["old", "test"], footer: [], zones: {} };
    expect(buildLayoutUpdates(stale, layout).actions.get("old")).toEqual({
      position: 1,
      section: "actions",
    });
  });

  it("numbers zones along the header", () => {
    const layout: ActionsLayout = {
      header: ["test", zoneItemId("build")],
      footer: [],
      zones: { build: ["ios"] },
    };
    expect([...buildLayoutUpdates(current, layout).zones]).toEqual([["build", { position: 2 }]]);
  });

  it("writes a terminal's note into the terminals section", () => {
    const layout: ActionsLayout = { header: [], footer: [], zones: { build: ["shell"] } };
    expect(buildLayoutUpdates(current, layout).actions.get("shell")?.section).toBe("terminals");
  });
});

describe("applying updates in the store", () => {
  it("moves the button and renumbers the zone", () => {
    const layout: ActionsLayout = { header: [zoneItemId("build")], footer: [], zones: { build: ["test"] } };
    const updates = buildLayoutUpdates(current, layout);
    const moved = applyActionUpdates(current, updates.actions).find((a) => a.name === "test");
    expect(moved?.display).toBe("build");
    const zones: ZoneInfo[] = [{ name: "build", label: "Build", rows: 2, source: "global" }];
    expect(applyZoneUpdates(zones, updates.zones)[0].position).toBe(1);
  });

  it("shows a button moved back to the header as a header button", () => {
    const layout: ActionsLayout = { header: ["test", "ios"], footer: ["logs"], zones: { build: [] } };
    const applied = applyActionUpdates(current, buildLayoutUpdates(current, layout).actions);
    expect(applied.find((a) => a.name === "ios")?.display).toBe("header");
    expect(applied.find((a) => a.name === "test")?.display).toBe("");
  });
});

describe("patchLayoutDoc", () => {
  const patch = (yaml: string, layout: ActionsLayout) => {
    const doc = YAML.parseDocument(yaml);
    patchLayoutDoc(doc, buildLayoutUpdates(current, layout));
    return YAML.parse(String(doc));
  };

  it("adds a zone note for a button declared elsewhere without copying its command", () => {
    const out = patch("root: /tmp\n", {
      header: [zoneItemId("build")],
      footer: [],
      zones: { build: ["test"] },
    });
    expect(out.actions.test).toEqual({ position: 1, display: "build" });
  });

  it("keeps a zone's rows when it only moves", () => {
    const out = patch("zones:\n  build:\n    rows: 2\n", {
      header: ["test", zoneItemId("build")],
      footer: [],
      zones: { build: [] },
    });
    expect(out.zones.build).toEqual({ rows: 2, position: 2 });
  });

  it("writes a position note for a zone declared in another file", () => {
    const out = patch("root: /tmp\n", { header: [zoneItemId("build")], footer: [], zones: { build: [] } });
    expect(out.zones.build).toEqual({ position: 1 });
  });

  it("sets display to header when a button goes back to the header", () => {
    const out = patch("actions:\n  ios:\n    cmd: make ios\n    display: build\n", {
      header: ["ios"],
      footer: [],
      zones: { build: [] },
    });
    expect(out.actions.ios).toEqual({ cmd: "make ios", position: 1, display: "header" });
  });

  it("overrides a zone inherited from another file when a button goes to the header", () => {
    const out = patch("root: /tmp\n", { header: ["ios"], footer: [], zones: { build: [] } });
    expect(out.actions.ios).toEqual({ position: 1, display: "header" });
  });

  it("widens a shorthand entry into a map when it moves into a zone", () => {
    const out = patch("actions:\n  test: make test\n", {
      header: [zoneItemId("build")],
      footer: [],
      zones: { build: ["test"] },
    });
    expect(out.actions.test).toEqual({ cmd: "make test", position: 1, display: "build" });
  });
});

// A drag previews each cross-group move into the store, so by the drop the
// dragged button's display already shows where it is going. `before` is the
// layout the drag started from.
describe("dropping a button the store has already previewed", () => {
  const before: ActionsLayout = {
    header: ["test", zoneItemId("build"), "shell"],
    footer: ["logs"],
    zones: { build: ["ios"] },
  };

  const previewed = (layout: ActionsLayout) =>
    applyActionUpdates(current, buildLayoutUpdates(current, layout).actions);
  const displayIn = (store: ActionInfo[], name: string) => store.find((a) => a.name === name)?.display;

  it("writes footer for a button dropped in the footer", () => {
    const after: ActionsLayout = {
      header: [zoneItemId("build"), "shell"],
      footer: ["logs", "test"],
      zones: { build: ["ios"] },
    };
    const store = previewed(after);
    expect(displayIn(store, "test")).toBe("footer");
    expect(buildLayoutUpdates(store, after, before).actions.get("test")).toEqual({
      position: 2,
      display: "footer",
      section: "actions",
    });
  });

  it("writes the zone name for a button dropped into a zone", () => {
    const after: ActionsLayout = {
      header: [zoneItemId("build"), "shell"],
      footer: ["logs"],
      zones: { build: ["ios", "test"] },
    };
    const store = previewed(after);
    expect(displayIn(store, "test")).toBe("build");
    expect(buildLayoutUpdates(store, after, before).actions.get("test")).toEqual({
      position: 2,
      display: "build",
      section: "actions",
    });
  });

  it("writes an explicit header display for a button dragged out of a zone", () => {
    const after: ActionsLayout = {
      header: ["test", "ios", zoneItemId("build"), "shell"],
      footer: ["logs"],
      zones: { build: [] },
    };
    const store = previewed(after);
    expect(displayIn(store, "ios")).toBe("header");
    expect(buildLayoutUpdates(store, after, before).actions.get("ios")).toEqual({
      position: 2,
      display: "header",
      section: "actions",
    });
  });

  it("writes the new zone name for a button dragged between zones", () => {
    const start: ActionsLayout = {
      header: ["test", zoneItemId("build"), zoneItemId("deploy"), "shell"],
      footer: ["logs"],
      zones: { build: ["ios"], deploy: [] },
    };
    const after: ActionsLayout = {
      header: ["test", zoneItemId("build"), zoneItemId("deploy"), "shell"],
      footer: ["logs"],
      zones: { build: [], deploy: ["ios"] },
    };
    const store = previewed(after);
    expect(displayIn(store, "ios")).toBe("deploy");
    expect(buildLayoutUpdates(store, after, start).actions.get("ios")).toEqual({
      position: 1,
      display: "deploy",
      section: "actions",
    });
  });

  it("leaves display alone for buttons that stayed in their group, whatever the store shows", () => {
    const store = current.map((a) =>
      a.name === "test" || a.name === "ios" ? { ...a, display: "footer" } : a,
    );
    const after: ActionsLayout = {
      header: ["shell", "test", zoneItemId("build")],
      footer: ["logs"],
      zones: { build: ["ios"] },
    };
    const { actions } = buildLayoutUpdates(store, after, before);
    expect(actions.get("test")).toEqual({ position: 2, section: "actions" });
    expect(actions.get("ios")).toEqual({ position: 1, section: "actions" });
  });

  it("falls back to the store's display for a button the drag-start layout doesn't list", () => {
    const start: ActionsLayout = { ...before, footer: [] };
    const inFooter: ActionsLayout = {
      header: ["test", zoneItemId("build"), "shell"],
      footer: ["logs"],
      zones: { build: ["ios"] },
    };
    const inHeader: ActionsLayout = {
      header: ["test", "logs", zoneItemId("build"), "shell"],
      footer: [],
      zones: { build: ["ios"] },
    };
    expect(buildLayoutUpdates(current, inFooter, start).actions.get("logs")).toEqual({
      position: 1,
      section: "actions",
    });
    expect(buildLayoutUpdates(current, inHeader, start).actions.get("logs")).toEqual({
      position: 2,
      display: "header",
      section: "actions",
    });
  });

  it("saves the display into the config", () => {
    const after: ActionsLayout = {
      header: [zoneItemId("build"), "shell"],
      footer: ["logs", "test"],
      zones: { build: ["ios"] },
    };
    const doc = YAML.parseDocument("actions:\n  test: make test\n");
    patchLayoutDoc(doc, buildLayoutUpdates(previewed(after), after, before));
    expect(YAML.parse(String(doc)).actions.test).toEqual({
      cmd: "make test",
      position: 2,
      display: "footer",
    });
  });
});

describe("zones changing rows", () => {
  const zones: ZoneInfo[] = [
    { name: "build", label: "Build", rows: 2, source: "project" },
    { name: "ship", label: "Ship", rows: 2, display: "footer", source: "global" },
  ];
  const base: ActionsLayout = {
    header: ["test", zoneItemId("build")],
    footer: ["logs", zoneItemId("ship")],
    zones: { build: ["ios"], ship: [] },
  };

  it("writes footer for a zone moved into the footer", () => {
    const after: ActionsLayout = { ...base, header: ["test"], footer: ["logs", zoneItemId("build"), zoneItemId("ship")] };
    expect(buildLayoutUpdates(current, after, base, zones).zones.get("build")).toEqual({ position: 2, display: "footer" });
  });

  it("writes an explicit header for a zone moved into the header", () => {
    const after: ActionsLayout = { ...base, header: [zoneItemId("ship"), "test", zoneItemId("build")], footer: ["logs"] };
    expect(buildLayoutUpdates(current, after, base, zones).zones.get("ship")).toEqual({ position: 1, display: "header" });
  });

  it("leaves display alone for a zone that only moved along its row", () => {
    const after: ActionsLayout = { ...base, footer: [zoneItemId("ship"), "logs"] };
    expect(buildLayoutUpdates(current, after, base, zones).zones.get("ship")).toEqual({ position: 1 });
  });

  it("reads a zone's row from its info when no drag-start layout is given", () => {
    const after: ActionsLayout = { ...base, header: ["test", zoneItemId("build"), zoneItemId("ship")], footer: ["logs"] };
    expect(buildLayoutUpdates(current, after, undefined, zones).zones.get("ship")).toEqual({ position: 3, display: "header" });
  });

  it("writes no display for a zone it knows nothing about", () => {
    expect(buildLayoutUpdates(current, base).zones.get("ship")).toEqual({ position: 2 });
  });

  it("sends a removed footer zone's buttons back to the footer", () => {
    const start: ActionsLayout = { header: [zoneItemId("build")], footer: ["logs", zoneItemId("ship")], zones: { build: ["ios"], ship: ["test"] } };
    const store = current.map((a) => (a.name === "test" ? { ...a, display: "ship" } : a));
    const after = layoutWithoutZone(start, "ship");
    expect(buildLayoutUpdates(store, after, start, zones).actions.get("test")).toEqual({
      position: 2,
      display: "footer",
      section: "actions",
    });
  });

  it("applies the new row and spot in the store", () => {
    const after: ActionsLayout = { ...base, header: ["test"], footer: ["logs", zoneItemId("build"), zoneItemId("ship")] };
    const applied = applyZoneUpdates(zones, buildLayoutUpdates(current, after, base, zones).zones);
    expect(applied.find((z) => z.name === "build")).toMatchObject({ position: 2, display: "footer" });
    expect(applied.find((z) => z.name === "ship")).toMatchObject({ position: 3, display: "footer" });
  });

  it("writes a zone's new row next to its spot in the project file", () => {
    const before: ActionsLayout = { header: [zoneItemId("build")], footer: [], zones: { build: [] } };
    const after: ActionsLayout = { header: [], footer: [zoneItemId("build")], zones: { build: [] } };
    const doc = YAML.parseDocument("zones:\n  build:\n    rows: 2\n");
    patchLayoutDoc(doc, buildLayoutUpdates([], after, before, zones));
    expect(YAML.parse(String(doc)).zones.build).toEqual({ rows: 2, position: 1, display: "footer" });
  });

  it("writes a display note for a zone declared in another file", () => {
    const after: ActionsLayout = { header: [zoneItemId("ship")], footer: [], zones: { ship: [] } };
    const doc = YAML.parseDocument("root: /tmp\n");
    patchLayoutDoc(doc, buildLayoutUpdates([], after, undefined, zones));
    expect(YAML.parse(String(doc)).zones.ship).toEqual({ position: 1, display: "header" });
  });
});
