import { describe, expect, it } from "vitest";
import { computerRows, runsHere, type MentionComputer } from "./computerMentions";
import { mentionGroup, rankMentions } from "./mentions";
import { projectMentionItems } from "./hooks/useMentions";
import { prefixRoot } from "./peer/markers";
import type { ProjectInfo } from "./types";

const tail = " (on another computer; reach it with lpm exec --on and lpm cp)";

const place = (name: string, label: string, path: string) => ({
  label,
  path: `${name}:${path}`,
  insert: `${name}:${path}${tail}`,
});

const mini: MentionComputer = {
  name: "Mac mini",
  slug: "c2a0e3b1",
  access: "commands · copy from it",
  places: [place("Mac mini", "storefront", "~/storefront"), place("Mac mini", "Home folder", "~")],
};

const box: MentionComputer = {
  name: "build-box",
  slug: "0badf00d",
  access: "off · turn on in Connections",
  places: [place("build-box", "Home folder", "~")],
};

const project = (over: Partial<ProjectInfo>) =>
  ({ name: "web", root: "/Users/me/web", isRemote: false, ...over }) as ProjectInfo;

describe("computerRows", () => {
  it("folds each computer's places behind one row that says what it allows", () => {
    const { groups, places } = computerRows([mini, box]);
    expect(groups.map((g) => [g.kind, g.label, g.insert, g.detail])).toEqual([
      ["computer", "Mac mini", "mac mini", "commands · copy from it ›"],
      ["computer", "build-box", "build-box", "off · turn on in Connections ›"],
    ]);
    expect(groups[0].children).toEqual(places.slice(0, 2));
    expect(places[0]).toEqual({
      kind: "computer",
      label: "storefront",
      insert: `Mac mini:~/storefront${tail}`,
      detail: "Mac mini:~/storefront",
      search: "Mac mini:~/storefront",
    });
    expect(places.map((p) => p.label)).toEqual(["storefront", "Home folder", "Home folder"]);
  });

  it("leaves out a computer with no places", () => {
    expect(computerRows([{ ...box, places: [] }])).toEqual({ groups: [], places: [] });
  });

  it("follows Projects in the bare menu", () => {
    const projects = mentionGroup("project", "Projects", "project", projectMentionItems([project({})]))!;
    const { groups } = computerRows([mini]);
    const changed = { kind: "changed" as const, label: "a.ts", insert: "a.ts" };
    expect(rankMentions([changed, projects, ...groups], "").map((r) => r.label)).toEqual([
      "Projects",
      "Mac mini",
      "a.ts",
    ]);
  });

  it("is searched by place, path and computer name, not by the sentence it inserts", () => {
    const { places } = computerRows([mini, box]);
    const found = (frag: string) => rankMentions(places, frag).map((p) => p.detail);
    expect(found("store")).toEqual(["Mac mini:~/storefront"]);
    expect(found("mini")).toEqual(["Mac mini:~/storefront", "Mac mini:~"]);
    expect(found("home")).toEqual(["Mac mini:~", "build-box:~"]);
    expect(found("exec")).toEqual([]);
  });
});

describe("runsHere", () => {
  it("is true only for a project whose agents run on this computer", () => {
    expect(runsHere(project({}))).toBe(true);
    expect(runsHere(project({ isRemote: true }))).toBe(false);
    expect(runsHere(project({ root: prefixRoot("c2a0e3b1", "/Users/them/web") }))).toBe(false);
    expect(runsHere(undefined)).toBe(false);
  });
});

describe("projectMentionItems", () => {
  it("offers projects here and leaves out other computers' projects", () => {
    const items = projectMentionItems([
      project({}),
      project({ name: "web-2", root: "/Users/me/web-2", parentName: "web" }),
      project({ name: "peer-c2a0e3b1-shop", root: prefixRoot("c2a0e3b1", "/Users/them/shop") }),
    ]);
    expect(items.map((i) => [i.kind, i.insert])).toEqual([
      ["project", "/Users/me/web"],
      ["duplicate", "/Users/me/web-2"],
    ]);
  });
});
