// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LpmCommand, LpmCommandLists } from "../../lpmCommands";
import { CommandEditor } from "./CommandEditor";
import { draftOf, type Draft } from "./commandsModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skill = (over: Partial<LpmCommand> = {}): LpmCommand => ({
  name: "mine",
  scope: "project",
  folder: null,
  body: "Do it.",
  description: "",
  argumentHint: "",
  ...over,
});

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
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save");
    expect(save?.disabled).toBe(false);
  });

  it("is on for a skill already kept out, without a warning", () => {
    const c = skill({ keptOutOfGit: true });
    show(draftOf(c), listsWith(c));
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).not.toContain("Already committed");
  });
});
