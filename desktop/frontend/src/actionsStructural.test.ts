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
