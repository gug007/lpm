// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LpmCommandLists } from "../../lpmCommands";
import { CommandPlaceSelect } from "./CommandPlaceSelect";
import type { CommandPlace } from "./commandsModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lists: LpmCommandLists = {
  project: { folders: ["Bugs"], commands: [] },
  global: { folders: ["Git"], commands: [] },
  projectError: null,
};

let container: HTMLDivElement;
let root: Root;
const spy = vi.fn();
const behind = vi.fn();

function Field({ start, value }: { start: CommandPlace; value: LpmCommandLists }) {
  const [place, setPlace] = useState(start);
  return (
    <div onKeyDown={behind}>
      <span id="label">Folder</span>
      <CommandPlaceSelect
        id="field"
        labelledBy="label"
        place={place}
        lists={value}
        projectLabel="web"
        onChange={(next) => {
          spy(next);
          setPlace(next);
        }}
      />
    </div>
  );
}

const show = (start: CommandPlace, value = lists) => act(() => root.render(<Field start={start} value={value} />));
const field = () => document.getElementById("field") as HTMLButtonElement;
const listbox = () => document.querySelector('[role="listbox"]');
const click = (el: Element) => act(() => (el as HTMLElement).click());
const press = (el: Element, key: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
const group = (name: string) => document.querySelector(`[role="group"][aria-label="${name}"]`)!;
const option = (within: Element, name: string) =>
  [...within.querySelectorAll('[role="option"]')].find((o) => o.textContent === name)!;
const typeFolder = (text: string) => {
  const input = document.querySelector('input[aria-label="Folder name"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
};

beforeEach(() => {
  spy.mockClear();
  behind.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CommandPlaceSelect", () => {
  it("names the list as well as the folder", () => {
    show({ scope: "global", folder: null });
    expect(field().textContent).toContain("No folder");
    expect(field().textContent).toContain("Global");
  });

  it("leaves the list out when there is only one", () => {
    show({ scope: "global", folder: null }, { ...lists, project: null });
    expect(field().textContent).not.toContain("Global");
  });

  it("groups the choices by list and moves a skill between them", () => {
    show({ scope: "project", folder: "Bugs" });
    click(field());
    const chosen = option(group("This project · web"), "Bugs");
    expect(chosen.getAttribute("aria-selected")).toBe("true");
    click(option(group("Global"), "No folder"));
    expect(spy).toHaveBeenCalledWith({ scope: "global", folder: null });
    expect(listbox()).toBeNull();
    expect(field().textContent).toContain("Global");
  });

  it("starts a new folder in the list it was asked for", () => {
    show({ scope: "project", folder: null });
    click(field());
    click(option(group("Global"), "New folder"));
    press(typeFolder("Docs"), "Enter");
    expect(spy).toHaveBeenCalledWith({ scope: "global", folder: "Docs" });
    expect(field().textContent).toContain("Docs");
    expect(listbox()).toBeNull();
  });

  it("lists a new folder as chosen until it is saved", () => {
    show({ scope: "project", folder: "Docs" });
    click(field());
    expect(option(group("This project · web"), "Docs").getAttribute("aria-selected")).toBe("true");
  });

  it("uses the existing folder when a new name only differs in case", () => {
    show({ scope: "project", folder: null });
    click(field());
    click(option(group("This project · web"), "New folder"));
    press(typeFolder("bugs"), "Enter");
    expect(spy).toHaveBeenCalledWith({ scope: "project", folder: "Bugs" });
  });

  it("Escape in the new folder field goes back to the list without choosing", () => {
    show({ scope: "project", folder: null });
    click(field());
    click(option(group("This project · web"), "New folder"));
    press(typeFolder("Docs"), "Escape");
    expect(spy).not.toHaveBeenCalled();
    expect(listbox()).not.toBeNull();
    expect(document.querySelector('input[aria-label="Folder name"]')).toBeNull();
  });

  it("works from the keyboard, the way a native select does", () => {
    show({ scope: "project", folder: null });
    press(field(), "ArrowDown");
    expect(listbox()).not.toBeNull();
    press(field(), "ArrowDown");
    press(field(), "Enter");
    expect(spy).toHaveBeenCalledWith({ scope: "project", folder: "Bugs" });
    expect(listbox()).toBeNull();
  });

  it("Enter on New folder opens the name field", () => {
    show({ scope: "project", folder: "Bugs" });
    click(field());
    press(field(), "ArrowDown");
    press(field(), "Enter");
    expect(document.querySelector('input[aria-label="Folder name"]')).not.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("Escape closes the list and stops there", () => {
    show({ scope: "project", folder: null });
    click(field());
    press(field(), "Escape");
    expect(listbox()).toBeNull();
    expect(behind).not.toHaveBeenCalled();
  });

  it("jumps to a folder by its first letter", () => {
    show({ scope: "project", folder: null });
    click(field());
    press(field(), "g");
    press(field(), "Enter");
    expect(spy).toHaveBeenCalledWith({ scope: "global", folder: "Git" });
  });

  it("offers the Other skills group for a skill not made in lpm", () => {
    const choose = vi.fn();
    const render = (current: boolean) =>
      act(() =>
        root.render(
          <div>
            <span id="label">Folder</span>
            <CommandPlaceSelect
              id="field"
              labelledBy="label"
              place={{ scope: "project", folder: null }}
              lists={lists}
              projectLabel="web"
              onlyScope="project"
              otherGroup={{ current, onChoose: choose }}
              onChange={spy}
            />
          </div>,
        ),
      );
    render(true);
    expect(field().textContent).toContain("Other skills");
    click(field());
    const picked = () => document.querySelector('[role="option"][aria-selected="true"]')?.textContent;
    expect(picked()).toContain("Other skills");
    click(field());

    render(false);
    expect(field().textContent).toContain("No folder");
    click(field());
    expect(picked()).toContain("No folder");
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("Other skills"))!;
    click(option);
    expect(choose).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
  });
});
