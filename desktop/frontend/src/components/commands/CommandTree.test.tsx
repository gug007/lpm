// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndContext } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandKey,
  NO_FOLDS,
  type LpmCommand,
  type LpmCommandLists,
  type OtherSkill,
  type SkillFolds,
} from "../../lpmCommands";
import { isMac } from "../../platform";
import { CommandTree } from "./CommandTree";
import type { SkillRowActions } from "./commandsModel";
import type { SkillMenuActions } from "./skillTreeContext";

const foldStore = vi.hoisted(() => ({ folds: null as SkillFolds | null, setSkillFold: vi.fn() }));

vi.mock("../../store/skillFolds", () => ({
  useSkillFolds: () => foldStore.folds,
  setSkillFold: foldStore.setSkillFold,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skill = (name: string, over: Partial<LpmCommand> = {}): LpmCommand => ({
  name,
  scope: "project",
  folder: null,
  description: "",
  body: "Do it.",
  argumentHint: "",
  ...over,
});

const SKILLS = [
  skill("app-store-release", { description: "Release the latest build" }),
  skill("lesson", { description: "Make a narrated lesson", body: "Then restore the data directory." }),
  skill("short", { description: "A short video" }),
  skill("short-race", { description: "Race two models", runs: 4, lastRunAt: Date.now() - 2 * 3_600_000 }),
];

const lists: LpmCommandLists = {
  project: { folders: [], commands: SKILLS, inRepo: true },
  global: { folders: [], commands: [] },
  projectError: null,
};

let host: HTMLDivElement;
let root: Root;
let onSelect: ReturnType<typeof vi.fn<(c: LpmCommand) => void>>;
let menu: SkillMenuActions;

const rowActions: SkillRowActions = {
  onSelectOther: vi.fn(),
  onConvert: vi.fn(),
  onOpenInAgentSetup: vi.fn(),
  onMoveOther: vi.fn(),
  foldersOf: () => [],
};

function Harness({ list = lists }: { list?: LpmCommandLists }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  return (
    <DndContext>
      <CommandTree
        lists={list}
        projectName="web"
        projectLabel="lpm"
        visible
        query={query}
        selectedKey={null}
        focused
        sort="name"
        picked={picked}
        unsavedKey={commandKey(SKILLS[2])}
        menu={menu}
        onQuery={setQuery}
        onSort={() => {}}
        onPicked={setPicked}
        onSelect={onSelect}
        actions={rowActions}
        onNew={() => {}}
        onCreateFolder={() => {}}
        onRenameFolder={() => {}}
        onDeleteFolder={() => {}}
      />
    </DndContext>
  );
}

const search = () => host.querySelector<HTMLInputElement>('input[aria-label="Search skills"]')!;
const row = (name: string) => host.querySelector<HTMLElement>(`[data-skill-row="${commandKey(skill(name))}"]`)!;

function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search(), value);
    search().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

function click(target: Element, init: MouseEventInit = {}) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  });
}

const toggleKey = isMac ? { metaKey: true } : { ctrlKey: true };

describe("CommandTree", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onSelect = vi.fn<(c: LpmCommand) => void>();
    foldStore.folds = NO_FOLDS;
    foldStore.setSkillFold.mockReset();
    menu = {
      lists,
      canOpen: () => true,
      canReveal: () => true,
      copyName: vi.fn(),
      duplicate: vi.fn(),
      move: vi.fn(),
      copyTo: vi.fn(),
      keepOut: vi.fn(),
      reveal: vi.fn(),
      open: vi.fn(),
      convert: vi.fn(),
      remove: vi.fn(),
    };
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("marks what a search matched, counts it, and quotes a match in the prompt", () => {
    type("store");
    expect(host.textContent).toContain("2 skills");
    expect([...row("app-store-release").querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["store"]);
    expect(row("lesson").textContent).toContain("in prompt:");
    expect(row("lesson").querySelector("mark")?.textContent).toBe("store");
    expect(host.querySelector('[data-skill-row$=":short"]')).toBeNull();
  });

  it("opens the first result on Enter and moves through results with the arrows", () => {
    type("s");
    press(search(), "Enter");
    expect(onSelect).toHaveBeenLastCalledWith(SKILLS[0]);
    press(search(), "ArrowDown");
    press(search(), "Enter");
    expect(onSelect).toHaveBeenLastCalledWith(SKILLS[1]);
    press(search(), "ArrowUp");
    press(search(), "ArrowUp");
    press(search(), "Enter");
    expect(onSelect).toHaveBeenLastCalledWith(SKILLS[0]);
  });

  it("clears the search on Escape", () => {
    type("short");
    press(search(), "Escape");
    expect(search().value).toBe("");
  });

  it("takes the keyboard to the search on its shortcut", () => {
    press(document.body, "f", isMac ? { metaKey: true } : { ctrlKey: true, shiftKey: true });
    expect(document.activeElement).toBe(search());
  });

  it("shows how often a skill ran and which one has unsaved changes", () => {
    expect(row("short-race").textContent).toContain("2h · 4×");
    expect(row("short").querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
    expect(row("lesson").querySelector('[aria-label="Unsaved changes"]')).toBeNull();
  });

  it("picks skills with a modifier click and acts on them together", () => {
    click(row("lesson"), toggleKey);
    expect(onSelect).not.toHaveBeenCalled();
    click(row("short-race"), { shiftKey: true });
    const bar = host.querySelector('[role="toolbar"]');
    expect(bar?.textContent).toContain("3 picked");
    act(() => [...bar!.querySelectorAll("button")].find((b) => b.textContent === "Delete")!.click());
    expect(menu.remove).toHaveBeenCalledWith([SKILLS[1], SKILLS[2], SKILLS[3]]);
    act(() => [...bar!.querySelectorAll("button")].find((b) => b.textContent?.includes("Keep out of Git"))!.click());
    expect(menu.keepOut).toHaveBeenCalledWith([SKILLS[1], SKILLS[2], SKILLS[3]], true);
  });

  it("lets go of the picks on a plain click or Escape", () => {
    click(row("lesson"), toggleKey);
    click(row("short"), toggleKey);
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull();
    press(row("short"), "Escape");
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    click(row("lesson"), toggleKey);
    click(row("short"), toggleKey);
    click(row("app-store-release"));
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(SKILLS[0]);
  });

  it("offers every action on a skill's right-click menu", () => {
    act(() => {
      row("lesson").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const item = (label: string) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
    for (const label of ["Copy /lesson", "Duplicate", "Move to", "Keep out of Git", "Open SKILL.md", "Convert to other skill", "Delete…"]) {
      expect(item(label), label).toBeTruthy();
    }
    act(() => item("Duplicate")!.click());
    expect(menu.duplicate).toHaveBeenCalledWith(SKILLS[1]);
  });

  describe("folds", () => {
    const other: OtherSkill = { name: "pdf", description: "", preview: "", agents: [], path: "/skills/pdf" };
    const filed: LpmCommandLists = {
      project: {
        folders: ["Work", "Work/Reviews"],
        commands: [skill("lesson", { folder: "Work" }), skill("short", { folder: "Work/Reviews" })],
        others: [other],
        inRepo: true,
      },
      global: { folders: ["Work"], commands: [skill("deploy", { scope: "global", folder: "Work" })] },
      projectError: null,
    };
    const closing = (...closed: string[]): SkillFolds => ({ ...NO_FOLDS, project: { closed, othersOpen: false } });
    const heading = (label: string, list = "lpm") =>
      [...host.querySelectorAll<HTMLElement>("[aria-expanded]")].find(
        (b) =>
          b.textContent?.startsWith(label) && b.closest("section")?.getAttribute("aria-label")?.toLowerCase().includes(list),
      )!;
    const show = (folds: SkillFolds) => {
      foldStore.folds = folds;
      act(() => root.render(<Harness list={filed} />));
    };
    const filedRow = (name: string, folder: string) =>
      host.querySelector(`[data-skill-row="${commandKey(skill(name, { folder }))}"]`);

    it("shows a folder closed when the folds say so, and what's inside stays out", () => {
      show(NO_FOLDS);
      expect(filedRow("lesson", "Work")).not.toBeNull();
      show(closing("Work"));
      expect(heading("Work").getAttribute("aria-expanded")).toBe("false");
      expect(filedRow("lesson", "Work")).toBeNull();
      expect(heading("Reviews")).toBeUndefined();
    });

    it("closes only the list the folds name, whatever the other list calls its folder", () => {
      show(closing("Work"));
      expect(heading("Work", "global").getAttribute("aria-expanded")).toBe("true");
    });

    it("asks to close an open folder and to open a closed one", () => {
      show(NO_FOLDS);
      click(heading("Work"));
      expect(foldStore.setSkillFold).toHaveBeenLastCalledWith("web", "project", "Work", false);
      show(closing("Work"));
      click(heading("Work"));
      expect(foldStore.setSkillFold).toHaveBeenLastCalledWith("web", "project", "Work", true);
    });

    it("folds the Other skills group as the list's own, with no folder named", () => {
      show(NO_FOLDS);
      click(heading("Other skills"));
      expect(foldStore.setSkillFold).toHaveBeenLastCalledWith("web", "project", null, true);
      show({ ...NO_FOLDS, project: { closed: [], othersOpen: true } });
      expect(heading("Other skills").getAttribute("aria-expanded")).toBe("true");
      click(heading("Other skills"));
      expect(foldStore.setSkillFold).toHaveBeenLastCalledWith("web", "project", null, false);
    });

    it("shows what a search finds inside a closed folder without opening it", () => {
      show(closing("Work"));
      type("lesson");
      expect(filedRow("lesson", "Work")).not.toBeNull();
      expect(foldStore.setSkillFold).not.toHaveBeenCalled();
    });
  });
});
