import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { nestEntry } from "./actionsStructural";
import { mergeMenu } from "./actionsStructural";
import { extractToTop } from "./actionsStructural";
import { extractOnto } from "./actionsStructural";
import { reorderMenu } from "./actionsStructural";
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

describe("mergeMenu: split menu into a leaf", () => {
  it("default becomes a regular item alongside the children", () => {
    const doc = YAML.parseDocument(`
actions:
  target:
    cmd: echo target
  src:
    cmd: echo srcdefault
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
`);
    mergeMenu(doc, "src", "target");
    const r = YAML.parse(String(doc));
    expect(r.actions.src).toBeUndefined();
    expect(r.actions.target.cmd).toBe("echo target");
    expect(r.actions.target.actions.src.cmd).toBe("echo srcdefault");
    expect(r.actions.target.actions.a.cmd).toBe("echo a");
    expect(r.actions.target.actions.b.cmd).toBe("echo b");
  });
});

describe("mergeMenu: pure dropdown into a menu", () => {
  it("moves only its children, no self-leaf", () => {
    const doc = YAML.parseDocument(`
actions:
  target:
    actions:
      keep:
        cmd: echo keep
  src:
    actions:
      a:
        cmd: echo a
      b:
        cmd: echo b
`);
    mergeMenu(doc, "src", "target");
    const r = YAML.parse(String(doc));
    expect(r.actions.src).toBeUndefined();
    expect(r.actions.target.actions.keep.cmd).toBe("echo keep");
    expect(r.actions.target.actions.a.cmd).toBe("echo a");
    expect(r.actions.target.actions.b.cmd).toBe("echo b");
    expect(r.actions.target.actions.src).toBeUndefined();
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

describe("extractToTop: pure dropdown collapses to its single survivor", () => {
  it("replaces the parent with the remaining child at top level", () => {
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
    expect(r.actions.menu).toBeUndefined();
    expect(r.actions.b.cmd).toBe("echo b");
  });
});

describe("extractOnto: child onto a plain leaf -> new split menu", () => {
  it("moves the child under the target and collapses the source", () => {
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
    // src had 2 children, now 1 -> collapses to its survivor b
    expect(r.actions.src).toBeUndefined();
    expect(r.actions.b.cmd).toBe("echo b");
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
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "b" });
    expect(reorderedPositions(doc)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("moves the dragged child down to the end", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "c" });
    expect(reorderedPositions(doc)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("moves the dragged child up before the item it lands on", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "c", over: "a" });
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
    // No positions yet, so the resolver displays [a, b, c] by name.
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "b" });
    expect(reorderedPositions(doc)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("respects existing position fields when computing the base order", () => {
    const doc = parse(`
actions:
  menu:
    actions:
      a:
        cmd: echo a
        position: 2
      b:
        cmd: echo b
        position: 3
      c:
        cmd: echo c
        position: 1
`);
    // Displayed [c, a, b]; dragging b up onto c gives [b, c, a].
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "b", over: "c" });
    expect(reorderedPositions(doc)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("is a no-op when over is missing or equals the dragged child", () => {
    const doc = parse(MENU_ABC);
    const before = String(doc);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "missing" });
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "a", over: "a" });
    expect(String(doc)).toBe(before);
  });

  it("reads positions stamped by an earlier reorder on the same doc", () => {
    const doc = parse(MENU_ABC);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "c", over: "a" });
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "b", over: "c" });
    expect(reorderedPositions(doc)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("orders names by code point like the resolver, not by UTF-16 units", () => {
    const doc = parse(`
actions:
  menu:
    actions:
      "ﬁx":
        cmd: echo ligature
      "\u{1F600} deploy":
        cmd: echo emoji
      build:
        cmd: echo build
`);
    applyOpToDoc(doc, { kind: "reorderMenu", parent: "menu", child: "build", over: "ﬁx" });
    expect(reorderedPositions(doc)).toEqual({ "ﬁx": 1, build: 2, "\u{1F600} deploy": 3 });
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

  it("mergeMenu: a source child collides with a target child", () => {
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
    expect(() => mergeMenu(doc, "src", "target")).toThrow(/already exists/);
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
    expect(r.actions.tools).toBeUndefined();
    expect(r.actions.other.cmd).toBe("echo other");
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
