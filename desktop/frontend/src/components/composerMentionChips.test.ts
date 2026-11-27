// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("./terminal-utils", () => ({
  ansiColors: { brightBlue: "#5c9dff" },
}));

import { fencedBlock } from "../mentionGitCapture";
import { serializeEditor, setEditorContent } from "./composerEditor";
import { chipMentions, mentionOf, projectMentionChips } from "./composerMentionChips";
import type { ChipSpec } from "./composerChips";
import type { ProjectInfo } from "../types";

const ROOT = "/Users/you/Projects/IA-UI-Atlas";
const COPY = `${ROOT}-k3f9xa`;

function project(name: string, root: string, extra: Partial<ProjectInfo> = {}): ProjectInfo {
  return { name, root, ...extra } as ProjectInfo;
}

const projects = projectMentionChips([
  project("IA-UI-Atlas", ROOT, { label: "atlas" }),
  project("IA-UI-Atlas-k3f9xa", COPY, { parentName: "IA-UI-Atlas" }),
]);

function field(text: string): HTMLElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.appendChild(root);
  setEditorContent(root, text);
  return root;
}

function chips(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-mention]")).map((c) => ({
    kind: mentionOf(c)?.spec.kind,
    label: c.querySelector("[data-img-label]")?.textContent,
    text: c.dataset.mention,
  }));
}

const ctx = (saved = new Map<string, ChipSpec>()) => ({ projects, saved });

describe("projectMentionChips", () => {
  it("names a project by its label and a copy as its original's copy", () => {
    expect(projects.get(`@${ROOT}`)).toMatchObject({ kind: "project", label: "atlas", title: "Project" });
    expect(projects.get(`@${COPY}`)).toMatchObject({ kind: "duplicate", label: "atlas-k3f9xa", title: "Copy of atlas" });
  });
});

describe("chipMentions", () => {
  it("shows each mention as a chip and keeps the text it sends", () => {
    const text = `Port the fix from @${ROOT} to @${COPY} now`;
    const root = field(text);
    expect(chipMentions(root, ctx())).toBe(true);
    expect(chips(root).map((c) => c.label)).toEqual(["atlas", "atlas-k3f9xa"]);
    expect(serializeEditor(root)).toBe(text);
  });

  it("turns a captured block in the middle of a sentence into one chip", () => {
    const logs = fencedBlock("web service logs", "[web] ready\nTypeError: boom");
    const text = `The crash in ${logs} started after lunch`;
    const root = field(text);
    chipMentions(root, ctx());
    expect(chips(root)).toEqual([{ kind: "service", label: "web", text: logs }]);
    expect(serializeEditor(root)).toBe(text);
  });

  it("chips a remembered paste and leaves one shown as text alone", () => {
    const paste = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const saved = new Map<string, ChipSpec>([[paste, { kind: "paste", label: "Pasted text" }]]);
    const root = field(`Fix this:\n${paste}`);
    chipMentions(root, ctx(saved));
    expect(chips(root).map((c) => c.kind)).toEqual(["paste"]);

    saved.set(paste, { kind: "paste", label: "Pasted text", asText: true });
    const again = field(`Fix this:\n${paste}`);
    expect(chipMentions(again, ctx(saved))).toBe(false);
  });

  it("leaves a path inside the project, or a longer name, as text", () => {
    const root = field(`open @${ROOT}/src and @${ROOT}x and mail@${ROOT}`);
    expect(chipMentions(root, ctx())).toBe(false);
    expect(chips(root)).toEqual([]);
  });

  it("is idempotent", () => {
    const root = field(`@${ROOT} `);
    chipMentions(root, ctx());
    expect(chipMentions(root, ctx())).toBe(false);
    expect(chips(root)).toHaveLength(1);
  });
});
