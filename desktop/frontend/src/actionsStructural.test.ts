import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { nestEntry } from "./actionsStructural";
import { extractToTop } from "./actionsStructural";
import { extractOnto } from "./actionsStructural";
import { reorderMenu } from "./actionsStructural";
import { ungroupMenu } from "./actionsStructural";
import { applyOpToDoc } from "./actionsStructural";

function parse(s: string) {
  return YAML.parseDocument(s);
}

describe("nestEntry: leaf onto plain leaf -> split menu", () => {
  it("moves source under target.actions and keeps target cmd as default", () => {
    const doc = parse(`
actions:
  build:
    cmd: npm run build
  test:
    cmd: npm test
`);
    nestEntry(doc, "test", "build");
    const out = String(doc);
    const reparsed = YAML.parse(out);
    expect(reparsed.actions.test).toBeUndefined();
    expect(reparsed.actions.build.cmd).toBe("npm run build");
    expect(reparsed.actions.build.actions.test.cmd).toBe("npm test");
  });
});

describe("nestEntry: widens scalar shorthand target", () => {
  it("turns a string entry into a map with cmd + actions", () => {
    const doc = parse(`
actions:
  build: npm run build
  test:
    cmd: npm test
`);
    nestEntry(doc, "test", "build");
    const reparsed = YAML.parse(String(doc));
    expect(reparsed.actions.build.cmd).toBe("npm run build");
    expect(reparsed.actions.build.actions.test.cmd).toBe("npm test");
  });
});

describe("nestEntry: leaf onto existing menu -> added as child", () => {
  it("appends source to target.actions without disturbing existing children", () => {
    const doc = parse(`
actions:
  menu:
    cmd: default
    actions:
      first:
        cmd: echo 1
  loose:
    cmd: echo loose
`);
    nestEntry(doc, "loose", "menu");
    const reparsed = YAML.parse(String(doc));
    expect(reparsed.actions.loose).toBeUndefined();
    expect(reparsed.actions.menu.actions.first.cmd).toBe("echo 1");
    expect(reparsed.actions.menu.actions.loose.cmd).toBe("echo loose");
  });
});

describe("extractToTop: from split menu, no collapse (default + child remain)", () => {
  it("promotes child to top level, parent stays a menu", () => {
    const doc = YAML.parseDocument(`
actions:
  menu:
    cmd: echo default
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
`);
    extractToTop(doc, "menu", "a");
    const r = YAML.parse(String(doc));
    expect(r.actions.a.cmd).toBe("echo a");
    expect(r.actions.menu.cmd).toBe("echo default");
    expect(r.actions.menu.actions.b.cmd).toBe("echo b");
    expect(r.actions.menu.actions.a).toBeUndefined();
  });
});

describe("extractToTop: split menu collapses when last child leaves", () => {
  it("drops the empty actions: map, parent becomes a plain button", () => {
    const doc = YAML.parseDocument(`
actions:
  menu:
    cmd: echo default
    actions:
      a:
        cmd: echo a
`);
    extractToTop(doc, "menu", "a");
    const r = YAML.parse(String(doc));
    expect(r.actions.a.cmd).toBe("echo a");
    expect(r.actions.menu.cmd).toBe("echo default");
    expect(r.actions.menu.actions).toBeUndefined();
  });
});

describe("extractToTop: pure dropdown keeps its sole surviving child", () => {
  it("parent menu stays intact with the remaining child, no auto-promote", () => {
    const doc = YAML.parseDocument(`
actions:
  menu:
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
`);
    extractToTop(doc, "menu", "a");
    const r = YAML.parse(String(doc));
    expect(r.actions.a.cmd).toBe("echo a");
    expect(r.actions.menu.actions.b.cmd).toBe("echo b");
    expect(r.actions.b).toBeUndefined();
  });
});

describe("extractOnto: child onto a plain leaf -> new split menu", () => {
  it("moves the child under the target and keeps source menu with its survivor", () => {
    const doc = YAML.parseDocument(`
actions:
  src:
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
  dest:
    cmd: echo dest
`);
    extractOnto(doc, "src", "a", "dest");
    const r = YAML.parse(String(doc));
    expect(r.actions.dest.cmd).toBe("echo dest");
    expect(r.actions.dest.actions.a.cmd).toBe("echo a");
    expect(r.actions.src.actions.b.cmd).toBe("echo b");
    expect(r.actions.b).toBeUndefined();
  });
});

describe("extractOnto: position-aware cross-level move", () => {
  const deepDoc = () =>
    YAML.parseDocument(`actions:
  Build:
    cmd: b
    actions:
      iOS:
        cmd: i
        actions:
          Clean: { cmd: c }
          Release: { cmd: r }
      Tools: { cmd: t }
      Deploy: { cmd: d }
`);

  function buildPositions(doc: ReturnType<typeof parse>) {
    const r = YAML.parse(String(doc));
    return Object.fromEntries(
      Object.entries(r.actions.Build.actions).map(([k, v]) => [
        k,
        (v as { position?: number }).position,
      ]),
    );
  }

  it("lands the moved child before a specific sibling at the target level", () => {
    const doc = deepDoc();
    extractOnto(doc, "Build:iOS", "Release", "Build", "Tools", "before");
    const r = YAML.parse(String(doc));
    expect(r.actions.Build.actions.Release.cmd).toBe("r");
    expect(r.actions.Build.actions.iOS.actions.Release).toBeUndefined();
    expect(buildPositions(doc)).toEqual({ iOS: 1, Release: 2, Tools: 3, Deploy: 4 });
  });

  it("lands the moved child after a specific sibling at the target level", () => {
    const doc = deepDoc();
    extractOnto(doc, "Build:iOS", "Release", "Build", "Tools", "after");
    expect(buildPositions(doc)).toEqual({ iOS: 1, Tools: 2, Release: 3, Deploy: 4 });
  });

  it("lands the moved child at the front (before the first sibling)", () => {
    const doc = deepDoc();
    extractOnto(doc, "Build:iOS", "Release", "Build", "iOS", "before");
    expect(buildPositions(doc)).toEqual({ Release: 1, iOS: 2, Tools: 3, Deploy: 4 });
  });

  it("lands the moved child at the end (after the last sibling)", () => {
    const doc = deepDoc();
    extractOnto(doc, "Build:iOS", "Release", "Build", "Deploy", "after");
    expect(buildPositions(doc)).toEqual({ iOS: 1, Tools: 2, Deploy: 3, Release: 4 });
  });

  it("leaves the source menu intact with its surviving child", () => {
    const doc = deepDoc();
    extractOnto(doc, "Build:iOS", "Release", "Build", "Tools", "before");
    const r = YAML.parse(String(doc));
    expect(r.actions.Build.actions.iOS.cmd).toBe("i");
    expect(r.actions.Build.actions.iOS.actions.Clean.cmd).toBe("c");
  });

  it("still throws on a name collision at the destination", () => {
    const doc = YAML.parseDocument(`actions:
  Build:
    cmd: b
    actions:
      iOS:
        actions:
          Tools: { cmd: nested }
      Tools: { cmd: top }
`);
    const before = String(doc);
    expect(() => extractOnto(doc, "Build:iOS", "Tools", "Build", "Tools", "before")).toThrow(
      /already exists/,
    );
    expect(String(doc)).toBe(before);
  });
});

describe("applyOpToDoc: routes a position-aware extractOnto", () => {
  it("threads over + position through to extractOnto", () => {
    const doc = YAML.parseDocument(`actions:
  Build:
    cmd: b
    actions:
      iOS:
        cmd: i
        actions:
          Release: { cmd: r }
          Clean: { cmd: c }
      Tools: { cmd: t }
      Deploy: { cmd: d }
`);
    applyOpToDoc(doc, {
      kind: "extractOnto",
      parent: "Build:iOS",
      child: "Release",
      target: "Build",
      over: "Deploy",
      position: "after",
    });
    const r = YAML.parse(String(doc));
    expect(r.actions.Build.actions.Release.cmd).toBe("r");
    expect(r.actions.Build.actions.iOS.actions.Release).toBeUndefined();
    expect(r.actions.Build.actions.Release.position).toBe(4);
  });
});

describe("reorderMenu", () => {
  it("stamps ascending position on children so the order survives a resolve", () => {
    const doc = YAML.parseDocument(`
actions:
  menu:
    cmd: echo d
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
      c:
        cmd: echo c
`);
    reorderMenu(doc, "menu", ["c", "a", "b"]);
    const r = YAML.parse(String(doc));
    expect(r.actions.menu.actions.c.position).toBe(1);
    expect(r.actions.menu.actions.a.position).toBe(2);
    expect(r.actions.menu.actions.b.position).toBe(3);
  });

  it("widens a scalar-shorthand child so position can attach", () => {
    const doc = YAML.parseDocument(`
actions:
  menu:
    actions:
      a: echo a
      b: echo b
`);
    reorderMenu(doc, "menu", ["b", "a"]);
    const r = YAML.parse(String(doc));
    expect(r.actions.menu.actions.b.cmd).toBe("echo b");
    expect(r.actions.menu.actions.b.position).toBe(1);
    expect(r.actions.menu.actions.a.position).toBe(2);
  });
});

describe("applyOpToDoc", () => {
  it("routes a nest op", () => {
    const doc = YAML.parseDocument(`
actions:
  a:
    cmd: echo a
  b:
    cmd: echo b
`);
    applyOpToDoc(doc, { kind: "nest", source: "a", target: "b" });
    const r = YAML.parse(String(doc));
    expect(r.actions.b.actions.a.cmd).toBe("echo a");
  });
});

const MENU_ABC = `
actions:
  menu:
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
      c:
        cmd: echo c
`;

function reorderedPositions(doc: ReturnType<typeof parse>) {
  const r = YAML.parse(String(doc));
  return Object.fromEntries(
    Object.entries(r.actions.menu.actions).map(([k, v]) => [k, (v as { position: number }).position]),
  );
}

describe("applyOpToDoc: reorderMenu matches the drag preview (arrayMove)", () => {
  it("moves the dragged child one slot down onto its neighbor", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "b" }, ["a", "b", "c"]);
    expect(reorderedPositions(doc)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("moves the dragged child down to the end", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "c" }, ["a", "b", "c"]);
    expect(reorderedPositions(doc)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("moves the dragged child up before the item it lands on", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "c", over: "a" }, ["a", "b", "c"]);
    expect(reorderedPositions(doc)).toEqual({ c: 1, a: 2, b: 3 });
  });

  it("computes indices against the displayed order, not YAML key order", () => {
    const doc = parse(`
actions:
  menu:
    actions:
      c:
        cmd: echo c
      a:
        cmd: echo a
      b:
        cmd: echo b
`);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "b" }, ["a", "b", "c"]);
    expect(reorderedPositions(doc)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("is a no-op when over is missing, equals the dragged child, or no order is supplied", () => {
    const doc = parse(MENU_ABC);
    const before = String(doc);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "missing" }, ["a", "b", "c"]);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "a" }, ["a", "b", "c"]);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "b" });
    expect(String(doc)).toBe(before);
  });
});

describe("applyOpToDoc: position-aware reorderMenu (drop-indicator model)", () => {
  it("inserts the dragged child before the over child (top third)", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(
      doc,
      { kind: "reorderMenu", parent: "menu", child: "c", over: "b", position: "before" },
      ["a", "b", "c"],
    );
    expect(reorderedPositions(doc)).toEqual({ a: 1, c: 2, b: 3 });
  });

  it("inserts the dragged child after the over child (bottom third)", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(
      doc,
      { kind: "reorderMenu", parent: "menu", child: "a", over: "b", position: "after" },
      ["a", "b", "c"],
    );
    expect(reorderedPositions(doc)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("before its own immediate predecessor's neighbor lands it at the front", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(
      doc,
      { kind: "reorderMenu", parent: "menu", child: "c", over: "a", position: "before" },
      ["a", "b", "c"],
    );
    expect(reorderedPositions(doc)).toEqual({ c: 1, a: 2, b: 3 });
  });

  it("after the last child lands it at the end", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(
      doc,
      { kind: "reorderMenu", parent: "menu", child: "a", over: "c", position: "after" },
      ["a", "b", "c"],
    );
    expect(reorderedPositions(doc)).toEqual({ b: 1, c: 2, a: 3 });
  });
});

describe("name collisions abort instead of overwriting", () => {
  it("nestEntry: target menu already has a child with the source name", () => {
    const doc = parse(`
actions:
  build:
    cmd: echo loose build
  menu:
    cmd: echo default
    actions:
      build:
        cmd: echo nested build
`);
    const before = String(doc);
    expect(() => nestEntry(doc, "build", "menu")).toThrow(/already exists/);
    expect(String(doc)).toBe(before);
  });

  it("extractToTop: a top-level action with the child's name exists", () => {
    const doc = parse(`
actions:
  build:
    cmd: echo top-level build
  menu:
    actions:
      build:
        cmd: echo nested build
      other:
        cmd: echo other
`);
    const before = String(doc);
    expect(() => extractToTop(doc, "menu", "build")).toThrow(/already exists/);
    expect(String(doc)).toBe(before);
  });

  it("extractOnto: the target already has a child with that name", () => {
    const doc = parse(`
actions:
  target:
    actions:
      deploy:
        cmd: echo target deploy
      keep:
        cmd: echo keep
  src:
    actions:
      deploy:
        cmd: echo src deploy
      other:
        cmd: echo other
`);
    const before = String(doc);
    expect(() => extractOnto(doc, "src", "deploy", "target")).toThrow(/already exists/);
    expect(String(doc)).toBe(before);
  });

  it("extractOnto: child named like the target nests under it, keeping the target cmd", () => {
    const doc = parse(`
actions:
  deploy:
    cmd: echo top deploy
  tools:
    actions:
      deploy:
        cmd: echo tools deploy
      other:
        cmd: echo other
`);
    extractOnto(doc, "tools", "deploy", "deploy");
    const r = YAML.parse(String(doc));
    expect(r.actions.deploy.cmd).toBe("echo top deploy");
    expect(r.actions.deploy.actions.deploy.cmd).toBe("echo tools deploy");
    expect(r.actions.tools.actions.other.cmd).toBe("echo other");
    expect(r.actions.other).toBeUndefined();
  });

  it("collapseMenu: keeps a one-item menu when promoting would clobber a top-level entry", () => {
    const doc = parse(`
actions:
  a:
    cmd: echo top a
  menu:
    actions:
      a:
        cmd: echo nested a
      b:
        cmd: echo b
`);
    extractToTop(doc, "menu", "b");
    const r = YAML.parse(String(doc));
    expect(r.actions.b.cmd).toBe("echo b");
    expect(r.actions.a.cmd).toBe("echo top a");
    expect(r.actions.menu.actions.a.cmd).toBe("echo nested a");
  });
});

const doc3 = () =>
  YAML.parseDocument(`actions:
  Build:
    cmd: b
    actions:
      iOS:
        cmd: i
        actions:
          Clean: { cmd: c }
          Release: { cmd: r }
      Tools:
        actions:
          Doctor: { cmd: d }
`);

describe("path-aware structural ops (depth >= 3)", () => {
  it("extractToTop lifts a leaf out of a deep menu to top level", () => {
    const doc = doc3();
    extractToTop(doc, "Build:iOS", "Clean");
    expect(String(doc)).toMatch(/^ {2}Clean:/m);
  });

  it("extractToTop of a menu node keeps its nested actions intact", () => {
    const doc = doc3();
    extractToTop(doc, "Build", "iOS");
    const root = doc.getIn(["actions", "iOS", "actions"]);
    expect(YAML.isMap(root)).toBe(true);
    expect((root as YAML.YAMLMap).has("Clean")).toBe(true);
    expect((root as YAML.YAMLMap).has("Release")).toBe(true);
  });

  it("nestEntry moves a whole subtree under a deep target (preserve)", () => {
    const doc = doc3();
    nestEntry(doc, "Build:Tools", "Build:iOS");
    const tools = doc.getIn(["actions", "Build", "actions", "iOS", "actions", "Tools", "actions"]);
    expect(YAML.isMap(tools)).toBe(true);
    expect((tools as YAML.YAMLMap).has("Doctor")).toBe(true);
  });

  it("extractOnto moves a deep child out one level to its grandparent", () => {
    const doc = doc3();
    extractOnto(doc, "Build:iOS", "Release", "Build");
    const buildActions = doc.getIn(["actions", "Build", "actions"]) as YAML.YAMLMap;
    expect(buildActions.has("Release")).toBe(true);
    const iosActions = doc.getIn(["actions", "Build", "actions", "iOS", "actions"]) as YAML.YAMLMap;
    expect(iosActions.has("Release")).toBe(false);
  });
});

describe("collapseMenu: no auto-promote for one-child pure menus", () => {
  it("collapseMenu keeps a one-child pure menu (no auto-promote)", () => {
    const doc = YAML.parseDocument(`actions:
  Menu:
    actions:
      Only: { cmd: x }
      Other: { cmd: y }
`);
    extractToTop(doc, "Menu", "Other"); // leaves Menu with one child, no cmd
    const menu = doc.getIn(["actions", "Menu"]);
    expect(YAML.isMap(menu)).toBe(true);                 // Menu still exists as a menu
    expect((doc.getIn(["actions", "Only"]) as unknown) ?? null).toBeNull(); // NOT promoted to top
  });

  it("collapseMenu still demotes a cmd-only menu to a plain button", () => {
    const doc = YAML.parseDocument(`actions:
  Menu:
    cmd: run
    actions:
      Only: { cmd: x }
`);
    extractToTop(doc, "Menu", "Only");
    const menu = doc.getIn(["actions", "Menu"]) as YAML.YAMLMap;
    expect(menu.has("actions")).toBe(false);             // collapsed to plain button
  });

  it("collapseMenu removes a no-cmd menu left with zero children", () => {
    const doc = YAML.parseDocument(`actions:
  Menu:
    actions:
      Only: { cmd: x }
`);
    extractToTop(doc, "Menu", "Only");           // Menu now has no cmd and 0 children
    expect(doc.getIn(["actions", "Menu"]) ?? null).toBeNull();   // removed
    expect(YAML.isMap(doc.getIn(["actions"]))).toBe(true);
  });

  it("collapseMenu keeps a no-cmd menu that still has children", () => {
    const doc = YAML.parseDocument(`actions:
  Menu:
    actions:
      A: { cmd: a }
      B: { cmd: b }
`);
    extractToTop(doc, "Menu", "A");              // one child remains
    expect(YAML.isMap(doc.getIn(["actions", "Menu"]))).toBe(true); // kept
  });
});

describe("ungroupMenu", () => {
  it("dissolves a pure menu into its parent level (node removed)", () => {
    const doc = YAML.parseDocument(`actions:
  Build:
    cmd: b
    actions:
      Tools:
        actions:
          Doctor: { cmd: d }
          Cache: { cmd: c }
      iOS: { cmd: i }
`);
    ungroupMenu(doc, "Build:Tools");
    const ba = doc.getIn(["actions", "Build", "actions"]) as YAML.YAMLMap;
    expect(ba.has("Doctor")).toBe(true);
    expect(ba.has("Cache")).toBe(true);
    expect(ba.has("iOS")).toBe(true);
    expect(ba.has("Tools")).toBe(false);
  });

  it("keeps a node with a cmd as a leaf (its actions removed)", () => {
    const doc = YAML.parseDocument(`actions:
  Build:
    actions:
      iOS:
        cmd: i
        actions:
          Clean: { cmd: c }
`);
    ungroupMenu(doc, "Build:iOS");
    const ba = doc.getIn(["actions", "Build", "actions"]) as YAML.YAMLMap;
    expect(ba.has("Clean")).toBe(true);
    const ios = ba.get("iOS", true) as unknown as YAML.YAMLMap;
    expect(YAML.isMap(ios)).toBe(true);
    expect(ios.has("actions")).toBe(false);
  });

  it("throws on a name collision in the destination", () => {
    const doc = YAML.parseDocument(`actions:
  Build:
    actions:
      Clean: { cmd: top }
      iOS:
        actions:
          Clean: { cmd: nested }
`);
    expect(() => ungroupMenu(doc, "Build:iOS")).toThrow();
  });
});
