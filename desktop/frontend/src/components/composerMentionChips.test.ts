// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("./terminal-utils", () => ({
  ansiColors: { brightBlue: "#5c9dff" },
}));

import { serializeEditor, setEditorContent } from "./composerEditor";
import { chipMentions, projectMentionChips } from "./composerMentionChips";
import type { ProjectInfo } from "../types";

const ROOT = "/Users/you/Projects/IA-UI-Atlas";
const COPY = `${ROOT}-k3f9xa`;

function project(name: string, root: string, extra: Partial<ProjectInfo> = {}): ProjectInfo {
  return { name, root, ...extra } as ProjectInfo;
}

const projects = [
  project("IA-UI-Atlas", ROOT, { label: "atlas" }),
  project("IA-UI-Atlas-k3f9xa", COPY, { parentName: "IA-UI-Atlas" }),
];

function field(text: string): HTMLElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.appendChild(root);
  setEditorContent(root, text);
  return root;
}

function chips(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-mention]")).map((c) => ({
    text: c.dataset.mention,
    label: c.querySelector("[data-img-label]")?.textContent,
    title: c.title,
  }));
}

describe("projectMentionChips", () => {
  it("names a project by its label and a copy as its original's copy", () => {
    const lookup = projectMentionChips(projects);
    expect(lookup.get(`@${ROOT}`)).toEqual({ kind: "project", label: "atlas", title: ROOT });
    expect(lookup.get(`@${COPY}`)).toEqual({
      kind: "duplicate",
      label: "atlas-k3f9xa",
      title: `Copy of atlas · ${COPY}`,
    });
  });
});

describe("chipMentions", () => {
  const lookup = projectMentionChips(projects);

  it("shows each mention as a chip and keeps the text it sends", () => {
    const text = `Port the fix from @${ROOT} to @${COPY} now`;
    const root = field(text);
    expect(chipMentions(root, lookup)).toBe(true);
    expect(chips(root).map((c) => c.label)).toEqual(["atlas", "atlas-k3f9xa"]);
    expect(serializeEditor(root)).toBe(text);
  });

  it("chips a mention at the end of the field and before punctuation", () => {
    const root = field(`see @${ROOT}, then @${COPY}.`);
    chipMentions(root, lookup);
    expect(chips(root).map((c) => c.text)).toEqual([`@${ROOT}`, `@${COPY}`]);
  });

  it("leaves a path inside the project, or a longer name, as text", () => {
    const root = field(`open @${ROOT}/src and @${ROOT}x and mail@${ROOT}`);
    expect(chipMentions(root, lookup)).toBe(false);
    expect(chips(root)).toEqual([]);
  });

  it("does nothing for an unknown root", () => {
    const root = field("look at @/Users/you/elsewhere");
    expect(chipMentions(root, lookup)).toBe(false);
  });

  it("is idempotent", () => {
    const root = field(`@${ROOT} `);
    chipMentions(root, lookup);
    expect(chipMentions(root, lookup)).toBe(false);
    expect(chips(root)).toHaveLength(1);
  });
});
