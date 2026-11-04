// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LpmCommand, LpmCommandLists } from "../../lpmCommands";
import { CommandEditor } from "./CommandEditor";
import { draftOf, type Draft } from "./commandsModel";
import type { SkillFiles } from "./skillFile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./SkillPromptEditor", () => ({
  SkillPromptEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Prompt" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const skill = (over: Partial<LpmCommand> = {}): LpmCommand => ({
  name: "mine",
  scope: "project",
  folder: null,
  body: "Do it.",
  description: "",
  argumentHint: "",
  ...over,
});

const FILES: SkillFiles = { reachOf: () => "here", open: () => {} };

const listsWith = (c: LpmCommand, inRepo = true): LpmCommandLists => ({
  project: { folders: [], commands: [c], inRepo },
  global: { folders: [], commands: [] },
  projectError: null,
});

describe("the Keep out of Git switch", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function show(draft: Draft, lists: LpmCommandLists) {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <CommandEditor
          draft={draft}
          lists={lists}
          projectLabel="app"
          files={FILES}
          saving={false}
          onChange={onChange}
          onSave={() => {}}
          onDelete={() => {}}
        />,
      ),
    );
    return onChange;
  }

  const toggle = () =>
    [...host.querySelectorAll<HTMLElement>('[role="switch"]')].find((el) => el.textContent?.includes("Keep out of Git"));

  it("shows in the form for a project's skill and changes the draft", () => {
    const c = skill();
    const onChange = show(draftOf(c), listsWith(c));
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    act(() => toggle()!.click());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ keepOutOfGit: true }));
  });

  it("leaves the form outside a repo", () => {
    const c = skill();
    show(draftOf(c), listsWith(c, false));
    expect(toggle()).toBeUndefined();
  });

  it("leaves the form for a global skill", () => {
    const c = skill();
    show({ ...draftOf(c), scope: "global" }, listsWith(c));
    expect(toggle()).toBeUndefined();
  });

  it("warns before a committed skill is taken out, and enables Save", () => {
    const c = skill({ tracked: true });
    show({ ...draftOf(c), keepOutOfGit: true }, listsWith(c));
    expect(host.textContent).toContain("Already committed");
    const save = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(save?.disabled).toBe(false);
  });

  it("is on for a skill already kept out, without a warning", () => {
    const c = skill({ keptOutOfGit: true });
    show(draftOf(c), listsWith(c));
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).not.toContain("Already committed");
  });
});

describe("a problem with the draft", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function show(draft: Draft, lists: LpmCommandLists) {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <CommandEditor
          draft={draft}
          lists={lists}
          projectLabel="app"
          files={FILES}
          saving={false}
          onChange={onChange}
          onSave={() => {}}
          onDelete={() => {}}
        />,
      ),
    );
    return onChange;
  }

  const save = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const issue = (id: string) => host.querySelector(`#${id}`);

  it("shows under the name, offers a name that would do, and keeps the path in the footer", () => {
    const c = skill();
    const onChange = show({ ...draftOf(c), name: "Fix-Ticket" }, listsWith(c));
    expect(issue("lpm-command-name-issue")?.textContent).toContain("Lowercase letters");
    expect(host.querySelector("#lpm-command-name")?.getAttribute("aria-invalid")).toBe("true");
    expect(host.textContent).toContain("/SKILL.md");
    expect(host.textContent).toContain("Unsaved");
    expect(save().disabled).toBe(true);
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Use fix-ticket")!.click());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "fix-ticket" }));
  });

  it("offers a free name beside one already taken", () => {
    const c = skill();
    const taken = skill({ name: "ship" });
    const lists: LpmCommandLists = {
      project: { folders: [], commands: [c, taken], inRepo: true },
      global: { folders: [], commands: [] },
      projectError: null,
    };
    show({ ...draftOf(c), name: "ship" }, lists);
    expect(issue("lpm-command-name-issue")?.textContent).toContain("/ship already exists");
    expect(issue("lpm-command-name-issue")?.textContent).toContain("Use ship-2");
  });

  it("shows under the prompt when there's none", () => {
    const c = skill();
    show({ ...draftOf(c), body: "  " }, listsWith(c));
    expect(issue("lpm-command-body-issue")?.textContent).toBe("Write the prompt.");
    expect(issue("lpm-command-name-issue")).toBeNull();
  });

  it("says nothing before there's a change", () => {
    const c = skill();
    show(draftOf(c), listsWith(c));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).not.toContain("Unsaved");
  });
});
