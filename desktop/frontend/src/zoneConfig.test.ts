import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { buildActionsModel } from "./actionsLayoutModel";
import type { ActionInfo, ZoneInfo } from "./types";
import {
  type ActionsSnapshot,
  type NewZone,
  addZoneAroundActionToDoc,
  addZoneToDoc,
  removeZoneFromDoc,
  setZoneDetailsInDoc,
  zoneDetailsOf,
  zoneKeyFor,
} from "./zoneConfig";

const run = (yaml: string, edit: (doc: ReturnType<typeof YAML.parseDocument>) => void) => {
  const doc = YAML.parseDocument(yaml);
  edit(doc);
  return YAML.parse(String(doc)) ?? {};
};

const button = (name: string, display = "", position?: number): ActionInfo =>
  ({ name, label: name, cmd: `run ${name}`, confirm: false, display, position }) as ActionInfo;

const zoneInfo = (name: string, over: Partial<ZoneInfo> = {}): ZoneInfo => ({
  name,
  label: name,
  rows: 1,
  source: "project",
  ...over,
});

// What the app shows now, the layout built the way the app builds it.
const snapshotOf = (actions: ActionInfo[] = [], zones: ZoneInfo[] = []): ActionsSnapshot => ({
  actions,
  zones,
  layout: buildActionsModel(actions, zones).layout,
});

const HEADER_ZONE: NewZone = { label: "", rows: 2, display: "header" };
const FOOTER_ZONE: NewZone = { label: "", rows: 1, display: "footer" };

const add = (yaml: string, zone: NewZone, now: ActionsSnapshot) => run(yaml, (doc) => addZoneToDoc(doc, zone, now));

describe("addZoneToDoc", () => {
  it("adds a zone with its height, first in an empty row", () => {
    expect(add("root: /tmp\n", HEADER_ZONE, snapshotOf())).toEqual({
      root: "/tmp",
      zones: { zone: { rows: 2, position: 1 } },
    });
  });

  it("writes the footer and the name for a named footer zone", () => {
    const out = add("root: /tmp\n", { label: " Deploy ", rows: 2, display: "footer" }, snapshotOf());
    expect(out.zones).toEqual({ deploy: { rows: 2, position: 1, display: "footer", label: "Deploy" } });
  });

  it("puts the zone past buttons that all have a position", () => {
    const now = snapshotOf([button("test", "", 1), button("lint", "", 2), button("deploy", "", 3)]);
    const out = add("root: /tmp\n", HEADER_ZONE, now);
    expect(out.zones.zone).toEqual({ rows: 2, position: 4 });
    expect(out.actions).toEqual({ test: { position: 1 }, lint: { position: 2 }, deploy: { position: 3 } });
  });

  it("numbers a header row of buttons without a position, the new zone last", () => {
    // Shown by name, since the backend sorts unpositioned buttons that way.
    const now = snapshotOf([button("test"), button("lint"), button("deploy")]);
    const out = add("root: /tmp\n", HEADER_ZONE, now);
    expect(out.actions).toEqual({ deploy: { position: 1 }, lint: { position: 2 }, test: { position: 3 } });
    expect(out.zones.zone.position).toBe(4);
  });

  it("numbers a mixed row so the zone does not land between the numbered and the unnumbered", () => {
    const now = snapshotOf([button("x", "", 1), button("y", "", 2), button("lint"), button("test")]);
    const out = add("root: /tmp\n", HEADER_ZONE, now);
    expect(out.actions).toEqual({
      x: { position: 1 },
      y: { position: 2 },
      lint: { position: 3 },
      test: { position: 4 },
    });
    expect(out.zones.zone.position).toBe(5);
  });

  it("numbers the footer row on its own, leaving the header alone", () => {
    const now = snapshotOf([button("test"), button("logs", "footer"), button("shell", "footer")]);
    const out = add("root: /tmp\n", FOOTER_ZONE, now);
    expect(out.actions).toEqual({ logs: { position: 1 }, shell: { position: 2 } });
    expect(out.zones.zone).toEqual({ rows: 1, display: "footer", position: 3 });
  });

  it("numbers the zones of the row along with its buttons", () => {
    const now = snapshotOf([button("test", "", 1), button("lint")], [zoneInfo("build", { position: 2 })]);
    const out = add("zones:\n  build:\n    rows: 1\n    position: 2\n", HEADER_ZONE, now);
    expect(out.zones).toEqual({
      build: { rows: 1, position: 2 },
      zone: { rows: 2, position: 4 },
    });
    expect(out.actions).toEqual({ test: { position: 1 }, lint: { position: 3 } });
  });

  it("writes a position note for a zone another file declares", () => {
    const now = snapshotOf([button("test")], [zoneInfo("build", { source: "repo" })]);
    const out = add("root: /tmp\n", HEADER_ZONE, now);
    expect(out.zones).toEqual({ build: { position: 1 }, zone: { rows: 2, position: 3 } });
  });

  it("leaves the buttons inside zones and the other zones' row alone", () => {
    const now = snapshotOf(
      [button("test"), button("ios", "build"), button("logs", "footer")],
      [zoneInfo("build"), zoneInfo("ship", { display: "footer" })],
    );
    const out = add("root: /tmp\n", HEADER_ZONE, now);
    expect(Object.keys(out.actions)).toEqual(["test"]);
    expect(Object.keys(out.zones).sort()).toEqual(["build", "zone"]);
  });

  it("keeps a shorthand command when the button gets its position", () => {
    const now = snapshotOf([button("test")]);
    const out = add("actions:\n  test: npm test\n", HEADER_ZONE, now);
    expect(out.actions.test).toEqual({ cmd: "npm test", position: 1 });
  });

  it("keeps the zones already in the file", () => {
    const now = snapshotOf([], [zoneInfo("build")]);
    const out = add("zones:\n  build:\n    rows: 3\n    label: Build\n", HEADER_ZONE, now);
    expect(out.zones).toEqual({
      build: { rows: 3, label: "Build", position: 1 },
      zone: { rows: 2, position: 2 },
    });
  });

  it("takes the next key when the file already has the zone, whatever the shown zones say", () => {
    const out = add("zones:\n  zone:\n    rows: 1\n    position: 1\n", HEADER_ZONE, snapshotOf());
    expect(Object.keys(out.zones)).toEqual(["zone", "zone-2"]);
    expect(out.zones.zone).toEqual({ rows: 1, position: 1 });
    expect(out.zones["zone-2"].rows).toBe(2);
  });

  it("takes the next key when another file declares the zone", () => {
    const out = add("root: /tmp\n", HEADER_ZONE, snapshotOf([], [zoneInfo("zone", { source: "global" })]));
    expect(Object.keys(out.zones)).toContain("zone-2");
  });

  it("keys a named zone after its name and counts the file's keys as taken", () => {
    const out = add("zones:\n  deploy:\n    rows: 1\n", { ...HEADER_ZONE, label: "Deploy" }, snapshotOf());
    expect(Object.keys(out.zones)).toEqual(["deploy", "deploy-2"]);
    expect(out.zones["deploy-2"].label).toBe("Deploy");
  });
});

const around = (yaml: string, action: string, now: ActionsSnapshot) => {
  let key: string | null = null;
  const out = run(yaml, (doc) => {
    key = addZoneAroundActionToDoc(doc, action, 1, now);
  });
  return { out, key };
};

describe("addZoneAroundActionToDoc", () => {
  it("puts the zone at the button's spot with the button inside", () => {
    const now = snapshotOf([button("test", "", 1), button("lint", "", 2), button("deploy", "", 3)]);
    const { out, key } = around("root: /tmp\n", "lint", now);
    expect(key).toBe("zone");
    expect(out.zones).toEqual({ zone: { rows: 1, position: 2 } });
    expect(out.actions).toEqual({
      test: { position: 1 },
      lint: { position: 1, display: "zone" },
      deploy: { position: 3 },
    });
  });

  it("makes a footer zone for a footer button and leaves the header alone", () => {
    const now = snapshotOf([button("test", "", 1), button("logs", "footer", 1), button("seed", "footer", 2)]);
    const { out } = around("root: /tmp\n", "seed", now);
    expect(out.zones).toEqual({ zone: { rows: 1, display: "footer", position: 2 } });
    expect(out.actions).toEqual({ logs: { position: 1 }, seed: { position: 1, display: "zone" } });
  });

  it("goes right after the zone the button leaves, and drops the button's layer", () => {
    const layers = [
      { name: "mobile", position: 1 },
      { name: "web", position: 2 },
    ];
    const now = snapshotOf(
      [button("test", "", 1), { ...button("ios", "build", 1), layer: "mobile" }],
      [zoneInfo("build", { rows: 2, position: 2, layers })],
    );
    const yaml =
      "actions:\n  ios:\n    cmd: make ios\n    display: build\n    layer: mobile\n" +
      "zones:\n  build:\n    rows: 2\n    position: 2\n    layers:\n      mobile:\n        position: 1\n      web:\n        position: 2\n";
    const { out } = around(yaml, "ios", now);
    expect(out.actions.ios).toEqual({ cmd: "make ios", display: "zone", position: 1 });
    expect(out.zones.zone).toEqual({ rows: 1, position: 3 });
    expect(out.zones.build.position).toBe(2);
  });

  it("writes a terminal button declared in another file as a sparse override", () => {
    const claude = { ...button("claude"), type: "terminal" } as ActionInfo;
    const { out } = around("root: /tmp\n", "claude", snapshotOf([button("test", "", 1), claude]));
    expect(out.terminals).toEqual({ claude: { position: 1, display: "zone" } });
    expect(out.zones.zone).toEqual({ rows: 1, position: 2 });
  });

  it("takes the next key when the project already has a zone of that name", () => {
    const now = snapshotOf([button("test", "", 1)], [zoneInfo("zone", { rows: 2, position: 2 })]);
    const { out, key } = around("zones:\n  zone:\n    rows: 2\n    position: 2\n", "test", now);
    expect(key).toBe("zone-2");
    expect(out.zones).toEqual({ zone: { rows: 2, position: 2 }, "zone-2": { rows: 1, position: 1 } });
  });

  it("changes nothing for a button that sits in no row", () => {
    const { out, key } = around("root: /tmp\n", "ghost", snapshotOf([button("test")]));
    expect(key).toBeNull();
    expect(out).toEqual({ root: "/tmp" });
  });
});

describe("zone config edits", () => {
  it("writes the name and the height in place", () => {
    const out = run("zones:\n  build:\n    rows: 1\n    label: Build\n    position: 3\n", (doc) =>
      setZoneDetailsInDoc(doc, "build", { label: " Builds ", rows: 3 }),
    );
    expect(out.zones.build).toEqual({ rows: 3, label: "Builds", position: 3 });
  });

  it("drops the label when the name is cleared", () => {
    const out = run("zones:\n  build:\n    rows: 2\n    label: Build\n", (doc) =>
      setZoneDetailsInDoc(doc, "build", { label: "  ", rows: 2 }),
    );
    expect(out.zones.build).toEqual({ rows: 2 });
  });

  it("creates the entry when the zone is missing from the section", () => {
    const out = run("zones:\n  other:\n    rows: 1\n", (doc) => setZoneDetailsInDoc(doc, "build", { label: "Build", rows: 2 }));
    expect(out.zones).toEqual({ other: { rows: 1 }, build: { rows: 2, label: "Build" } });
  });

  it("creates the section and the entry when there is no zones section", () => {
    expect(run("root: /tmp\n", (doc) => setZoneDetailsInDoc(doc, "build", { label: "", rows: 2 }))).toEqual({
      root: "/tmp",
      zones: { build: { rows: 2 } },
    });
  });

  it("removes the zone and an emptied zones section", () => {
    expect(run("root: /tmp\nzones:\n  build:\n    rows: 1\n", (doc) => removeZoneFromDoc(doc, "build"))).toEqual({
      root: "/tmp",
    });
  });

  it("keeps the other zones", () => {
    const out = run("zones:\n  a:\n    rows: 1\n  b:\n    rows: 2\n", (doc) => removeZoneFromDoc(doc, "a"));
    expect(out.zones).toEqual({ b: { rows: 2 } });
  });

  it("removes a position-only note for a zone declared in another file", () => {
    expect(run("root: /tmp\nzones:\n  build:\n    position: 3\n", (doc) => removeZoneFromDoc(doc, "build"))).toEqual({
      root: "/tmp",
    });
  });

  it("does nothing when there is no zones section", () => {
    expect(run("root: /tmp\n", (doc) => removeZoneFromDoc(doc, "a"))).toEqual({ root: "/tmp" });
  });
});

describe("zoneDetailsOf", () => {
  it("shows a zone's own name", () => {
    expect(zoneDetailsOf({ name: "build", label: "Build", rows: 2 })).toEqual({ label: "Build", rows: 2 });
  });

  it("leaves the name empty for a zone known only by its key", () => {
    expect(zoneDetailsOf({ name: "zone-2", label: "zone-2", rows: 1 })).toEqual({ label: "", rows: 1 });
  });
});

describe("zoneKeyFor", () => {
  it("slugs the name", () => {
    expect(zoneKeyFor("Deploy Targets", [])).toBe("deploy-targets");
  });

  it("falls back to zone when the name gives nothing usable", () => {
    expect(zoneKeyFor("  ", [])).toBe("zone");
    expect(zoneKeyFor("Сборка", [])).toBe("zone");
  });

  it("never takes a reserved name", () => {
    expect(zoneKeyFor("Footer", [])).toBe("zone");
    expect(zoneKeyFor("menu", [])).toBe("zone");
  });

  it("stays unique among the project's zones", () => {
    expect(zoneKeyFor("Deploy", ["deploy", "deploy-2"])).toBe("deploy-3");
    expect(zoneKeyFor("", ["zone"])).toBe("zone-2");
  });
});
