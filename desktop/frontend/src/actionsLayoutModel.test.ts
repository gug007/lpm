import { describe, expect, it } from "vitest";
import type { ActionInfo, ZoneDisplay, ZoneInfo, ZoneRows } from "./types";
import { buildActionsModel, nextActionPosition, sortByPosition } from "./actionsLayoutModel";
import { zoneItemId } from "./components/actionsDndLayout";

const action = (name: string, display = "", position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;

const zone = (name: string, position?: number, rows: ZoneRows = 1, display?: ZoneDisplay): ZoneInfo => ({
  name,
  label: name,
  rows,
  position,
  source: "project",
  ...(display ? { display } : {}),
});

describe("buildActionsModel", () => {
  it("puts zones among header buttons by position", () => {
    const model = buildActionsModel([action("test", "", 1), action("lint", "", 3)], [zone("build", 2)]);
    expect(model.layout.header).toEqual(["test", zoneItemId("build"), "lint"]);
    expect(model.headerItems.map((item) => item.kind)).toEqual(["action", "zone", "action"]);
  });

  it("sorts each button into the header, the footer or its zone", () => {
    const model = buildActionsModel(
      [action("test"), action("logs", "footer"), action("ios", "build", 1), action("old", "menu")],
      [zone("build")],
    );
    expect(model.layout.footer).toEqual(["logs"]);
    expect(model.layout.zones).toEqual({ build: ["ios"] });
    expect(model.layout.header).toEqual([zoneItemId("build"), "test"]);
  });

  it("sorts a layered zone's buttons into its layers, missing layers into the first", () => {
    const zones: ZoneInfo[] = [
      { name: "build", label: "Build", rows: 2, source: "project", layers: [{ name: "mobile" }, { name: "web" }] },
    ];
    const acts = [
      action("ios", "build"),
      { ...action("deploy", "build"), layer: "web" },
      { ...action("old", "build"), layer: "gone" },
    ];
    const model = buildActionsModel(acts, zones);
    expect(model.layout.zones).toEqual({ "build/mobile": ["ios", "old"], "build/web": ["deploy"] });
    const item = model.headerItems[0];
    expect(item.kind === "zone" && item.layers.map((l) => [l.key, l.ids])).toEqual([
      ["build/mobile", ["ios", "old"]],
      ["build/web", ["deploy"]],
    ]);
    expect(item.kind === "zone" && item.actions.map((a) => a.name)).toEqual(["ios", "old", "deploy"]);
  });

  it("gives a plain zone one layer view keyed by its name", () => {
    const model = buildActionsModel([action("ios", "build")], [zone("build")]);
    const item = model.headerItems[0];
    expect(item.kind === "zone" && item.layers.map((l) => [l.key, l.layer, l.ids])).toEqual([["build", null, ["ios"]]]);
  });

  it("shows a button whose zone is missing in the header", () => {
    const model = buildActionsModel([action("ios", "gone")], []);
    expect(model.layout.header).toEqual(["ios"]);
  });

  it("keeps an empty zone", () => {
    const model = buildActionsModel([], [zone("agents")]);
    expect(model.layout).toEqual({ header: [zoneItemId("agents")], footer: [], zones: { agents: [] } });
  });

  it("numbers the next header item after zones too", () => {
    const model = buildActionsModel([action("test", "", 1)], [zone("build", 5)]);
    expect(model.nextHeaderPosition).toBe(6);
  });

  it("renders header buttons in the order drag and drop sees", () => {
    const model = buildActionsModel([action("check"), action("alpha"), action("Build")], []);
    expect(model.layout.header).toEqual(["Build", "alpha", "check"]);
  });
});

describe("buildActionsModel with footer zones", () => {
  it("puts footer zones among footer buttons by position", () => {
    const model = buildActionsModel(
      [action("logs", "footer", 1), action("shell", "footer", 3), action("prod", "ship", 1), action("test", "", 1)],
      [zone("ship", 2, 2, "footer"), zone("build", 2)],
    );
    expect(model.layout.footer).toEqual(["logs", zoneItemId("ship"), "shell"]);
    expect(model.footerItems.map((item) => item.kind)).toEqual(["action", "zone", "action"]);
    expect(model.layout.header).toEqual(["test", zoneItemId("build")]);
    expect(model.layout.zones).toEqual({ ship: ["prod"], build: [] });
  });

  it("keeps a zone without a display in the header", () => {
    const model = buildActionsModel([], [zone("build")]);
    expect(model.headerItems.map((item) => item.id)).toEqual([zoneItemId("build")]);
    expect(model.footerItems).toEqual([]);
  });

  it("numbers the next footer item after footer zones, apart from the header", () => {
    const model = buildActionsModel(
      [action("logs", "footer", 1), action("test", "", 7)],
      [zone("ship", 4, 1, "footer")],
    );
    expect(model.nextFooterPosition).toBe(5);
    expect(model.nextHeaderPosition).toBe(8);
  });

  it("orders footer buttons by position, then name, like the backend", () => {
    const model = buildActionsModel([action("b", "footer", 1), action("c", "footer"), action("a", "footer", 1)], []);
    expect(model.layout.footer).toEqual(["a", "b", "c"]);
  });
});

describe("nextActionPosition", () => {
  it("is 1 when no action has a position", () => {
    expect(nextActionPosition([])).toBe(1);
    expect(nextActionPosition([action("test"), action("logs", "footer")])).toBe(1);
  });

  it("goes past a zone that holds more buttons than either row", () => {
    const actions = [
      action("test", "", 1),
      action("logs", "footer", 1),
      ...[1, 2, 3, 4, 5].map((n) => action(`step${n}`, "build", n)),
    ];
    const model = buildActionsModel(actions, [zone("build", 1)]);
    expect(model.nextHeaderPosition).toBe(2);
    expect(model.nextFooterPosition).toBe(2);
    expect(nextActionPosition(actions)).toBe(6);
  });

  it("goes past hand-written sparse positions", () => {
    expect(nextActionPosition([action("a", "", 10), action("b", "footer", 20)])).toBe(21);
    expect(nextActionPosition([action("a", "build", 10), action("b", "build", 20)])).toBe(21);
  });

  it("counts menu items", () => {
    expect(nextActionPosition([action("a", "", 1), action("old", "menu", 7)])).toBe(8);
  });
});

describe("sortByPosition", () => {
  it("puts positioned items first, then sorts by name", () => {
    const sorted = sortByPosition([
      { name: "c" },
      { name: "b", position: 2 },
      { name: "a", position: 2 },
      { name: "d", position: 1 },
    ]);
    expect(sorted.map((item) => item.name)).toEqual(["d", "a", "b", "c"]);
  });

  it("breaks ties bytewise like the backend, not by locale", () => {
    const sorted = sortByPosition([
      { name: "start_all", position: 1 },
      { name: "alpha" },
      { name: "start-all", position: 1 },
      { name: "iOS" },
      { name: "ios" },
      { name: "Build" },
    ]);
    expect(sorted.map((item) => item.name)).toEqual([
      "start-all",
      "start_all",
      "Build",
      "alpha",
      "iOS",
      "ios",
    ]);
  });
});
