// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterSlashCommands, type SlashCommand } from "../slashCommands";
import { SlashCommandMenu } from "./SlashCommandMenu";

vi.mock("./composerEditor", () => ({ COMMAND_COLOR: "#83a5d6" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skill = (name: string, folder: string | null, description = ""): SlashCommand => ({
  name,
  description,
  argumentHint: "",
  source: "lpm",
  folder,
  scope: "project",
});

const agent = (name: string, description = "", argumentHint = ""): SlashCommand => ({
  name,
  description,
  argumentHint,
  source: "builtin",
});

const anchor = { top: 500, bottom: 520, left: 40 } as DOMRect;

let root: Root | null = null;

const mount = (node: ReactElement) => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root?.render(node));
};

const open = (
  commands: SlashCommand[],
  selectedIndex = 0,
  onManage: (() => void) | null = () => {},
  anchorRect = anchor,
) =>
  mount(
    <SlashCommandMenu
      commands={commands}
      selectedIndex={selectedIndex}
      anchorRect={anchorRect}
      onSelect={() => {}}
      onHoverIndex={() => {}}
      agentLabel="Claude Code"
      onManage={onManage ?? undefined}
    />,
  );

const text = () => document.body.textContent ?? "";
const rows = () => [...document.querySelectorAll('[role="option"]')].map((r) => r.textContent);

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("SlashCommandMenu", () => {
  it("heads the most used rows and counts the rest", () => {
    open(
      filterSlashCommands(
        [{ ...agent("effort"), recentRuns: 4, lastRunAt: 1 }, skill("lesson", "Lessons"), agent("clear")],
        "",
      ),
    );
    const order = ["Most used", "/effort", "All 2", "/clear", "/lesson"].map((s) => text().indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("shows no headings when nothing has run", () => {
    open(filterSlashCommands([agent("clear"), skill("lesson", null)], ""));
    expect(text()).not.toContain("Most used");
    expect(text()).not.toContain("All 2");
  });

  it("shows no headings while typing, even for a row run often", () => {
    open(filterSlashCommands([{ ...agent("effort"), recentRuns: 4, lastRunAt: 1 }, agent("clear")], "eff"));
    expect(text()).not.toContain("Most used");
  });

  it("tags a skill with its folder and leaves the agent's own untagged", () => {
    open([skill("lesson", "Lessons"), agent("clear")]);
    expect(rows()).toEqual(["/lessonLessons", "/clear"]);
  });

  it("spells out the selected row, with what it takes", () => {
    open([agent("clear"), agent("model", "Switch the AI model", "[model]")], 1);
    expect(text()).toContain("Claude Code");
    expect(text()).toContain("[model]");
    expect(text().split("Switch the AI model").length).toBe(3);
  });

  it("offers the prompt to edit on an lpm skill", () => {
    open([skill("lesson", null), agent("clear")]);
    expect(text()).toContain("⇥ edit prompt");
  });

  it("doesn't offer it on a row where Tab only inserts the name", () => {
    open([skill("lesson", null), agent("clear")], 1);
    expect(text()).toContain("↵ insert");
    expect(text()).not.toContain("⇥ edit prompt");
  });

  it("drops the footer for a guest, who has no skills to manage", () => {
    open([agent("clear")], 0, null);
    expect(text()).not.toContain("Manage skills");
  });

  it("stays inside a short window", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(300);
    open([agent("clear")], 0, () => {}, { top: 200, bottom: 220, left: 40 } as DOMRect);
    const box = document.querySelector<HTMLElement>('[role="listbox"]');
    expect(box?.style.maxHeight).toBe("186px");
  });
});
