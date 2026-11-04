// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtherSkill } from "../../lpmCommands";
import { CommandOtherRow } from "./CommandOtherRow";
import type { SkillRowActions } from "./commandsModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skill: OtherSkill = {
  name: "lint",
  description: "Checks the code",
  preview: "",
  agents: ["claude"],
  path: "/x/.claude/skills/lint/SKILL.md",
  folder: null,
};

let container: HTMLDivElement;
let root: Root;

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) ?? null;
const click = (text: string) => act(() => button(text)!.click());

function open(over: Partial<OtherSkill> = {}, folders = ["Docs", "Git"]) {
  const actions: SkillRowActions = {
    onSelectOther: vi.fn(),
    onConvert: vi.fn(),
    onOpenInAgentSetup: vi.fn(),
    onMoveOther: vi.fn(),
    foldersOf: () => folders,
  };
  act(() =>
    root.render(
      <DndContext>
        <CommandOtherRow scope="project" skill={{ ...skill, ...over }} selected={false} actions={actions} />
      </DndContext>,
    ),
  );
  act(() => {
    button("/lint")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  click("Move to folder");
  return actions;
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("CommandOtherRow", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("files the skill in a folder from its menu, without converting it", () => {
    const actions = open();
    click("Git");
    expect(actions.onMoveOther).toHaveBeenCalledWith("project", "lint", { folder: "Git", root: false });
    expect(actions.onConvert).not.toHaveBeenCalled();
    expect(button("Convert to lpm skill")).toBeNull();
  });

  it("moves it to the top of its list", () => {
    const actions = open();
    click("No folder");
    expect(actions.onMoveOther).toHaveBeenCalledWith("project", "lint", { folder: null, root: true });
    expect(actions.onConvert).not.toHaveBeenCalled();
  });

  it("brings it back to the Other skills group", () => {
    const actions = open({ atRoot: true });
    expect(button("No folder")?.disabled).toBe(true);
    click("Other skills");
    expect(actions.onMoveOther).toHaveBeenCalledWith("project", "lint", { folder: null, root: false });
  });

  it("marks where it is", () => {
    open({ folder: "Docs" });
    expect(button("Docs")?.disabled).toBe(true);
    expect(button("No folder")?.disabled).toBe(false);
    expect(button("Other skills")?.disabled).toBe(false);
  });

  it("starts a folder for it when its list has none", () => {
    const actions = open({}, []);
    click("New folder");
    type(document.querySelector("input")!, "Reviews");
    expect(actions.onMoveOther).toHaveBeenCalledWith("project", "lint", { folder: "Reviews", root: false });
  });
});
