// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settings";
import { useSidebarProjectKeys } from "./useSidebarProjectKeys";

let container: HTMLDivElement;
let root: Root;
let row: HTMLButtonElement;
let xterm: HTMLDivElement;
let terminal: HTMLTextAreaElement;
let composer: HTMLDivElement;
let input: HTMLInputElement;
let fieldKeys: string[];

function Harness(props: {
  selected: string | null;
  menuTarget?: string | null;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const { renameShortcut, deleteShortcut } = useSidebarProjectKeys({ menuTarget: null, ...props });
  return <span>{`${renameShortcut} ${deleteShortcut}`}</span>;
}

function press(target: Element, key: string, modifiers: { metaKey?: boolean; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent("keydown", { key, ...modifiers, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function pointerDown(target: Element) {
  target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

function render(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onRename = vi.fn();
  const onDelete = vi.fn();
  act(() => root.render(<Harness selected="api" onRename={onRename} onDelete={onDelete} {...props} />));
  return { onRename, onDelete };
}

function openModal() {
  const modal = document.createElement("div");
  modal.setAttribute("data-modal-overlay", "");
  document.body.appendChild(modal);
  return modal;
}

beforeEach(() => {
  useSettingsStore.setState({ hotkeys: undefined });
  container = document.createElement("div");
  row = document.createElement("button");
  row.setAttribute("data-project-row", "api-copy");
  row.appendChild(document.createElement("span"));
  xterm = document.createElement("div");
  xterm.className = "xterm";
  terminal = document.createElement("textarea");
  xterm.appendChild(terminal);
  composer = document.createElement("div");
  composer.setAttribute("data-text-scope", "");
  composer.contentEditable = "true";
  input = document.createElement("input");
  fieldKeys = [];
  for (const field of [terminal, composer, input] as HTMLElement[]) {
    field.addEventListener("keydown", (e) => fieldKeys.push(e.key));
  }
  document.body.append(container, row, xterm, composer, input);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  for (const el of [container, row, xterm, composer, input]) el.remove();
  document.querySelectorAll("[data-modal-overlay]").forEach((el) => el.remove());
});

describe("rename hotkey", () => {
  it("renames the selected project from the terminal and labels itself", () => {
    const { onRename } = render();

    const event = press(terminal, "r", { metaKey: true });

    expect(onRename).toHaveBeenCalledWith("api");
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toBe("⌘R ⌘⇧⌫");
  });

  it("prefers the row whose menu is open", () => {
    const { onRename } = render({ menuTarget: "web" });
    press(document.body, "r", { metaKey: true });
    expect(onRename).toHaveBeenCalledWith("web");
  });

  it("leaves the key alone with nothing selected", () => {
    const { onRename } = render({ selected: null });
    expect(press(document.body, "r", { metaKey: true }).defaultPrevented).toBe(false);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("stands down while a modal is open", () => {
    const { onRename } = render();
    expect(press(openModal(), "r", { metaKey: true }).defaultPrevented).toBe(false);
    expect(onRename).not.toHaveBeenCalled();
  });

  it("follows a customized binding", () => {
    useSettingsStore.setState({ hotkeys: { renameProject: "cmd+shift+y" } });
    const { onRename } = render();

    press(document.body, "r", { metaKey: true });
    press(document.body, "y", { metaKey: true, shiftKey: true });

    expect(onRename).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("⌘⇧Y ⌘⇧⌫");
  });
});

describe("delete hotkey", () => {
  const chord = { metaKey: true, shiftKey: true };

  it("deletes the selected project from any field before it sees the key", () => {
    const { onDelete } = render();

    const events = [terminal, composer, input].map((field) => press(field, "Backspace", chord));

    expect(onDelete).toHaveBeenCalledTimes(3);
    expect(onDelete).toHaveBeenCalledWith("api");
    expect(events.every((e) => e.defaultPrevented)).toBe(true);
    expect(fieldKeys).toEqual([]);
  });

  it("leaves ⌘⌫ to text editing", () => {
    const { onDelete } = render();

    const events = [terminal, composer, input].map((field) =>
      press(field, "Backspace", { metaKey: true }),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(events.some((e) => e.defaultPrevented)).toBe(false);
    expect(fieldKeys).toEqual(["Backspace", "Backspace", "Backspace"]);
  });

  it("prefers the row whose menu is open", () => {
    const { onDelete } = render({ menuTarget: "web" });
    press(document.body, "Backspace", chord);
    expect(onDelete).toHaveBeenCalledWith("web");
  });

  it("stands down with nothing selected or a modal open", () => {
    const { onDelete } = render({ selected: null });
    expect(press(terminal, "Backspace", chord).defaultPrevented).toBe(false);

    act(() => root.render(<Harness selected="api" onRename={vi.fn()} onDelete={onDelete} />));
    expect(press(openModal(), "Backspace", chord).defaultPrevented).toBe(false);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("follows a customized binding", () => {
    useSettingsStore.setState({ hotkeys: { deleteProject: "cmd+alt+backspace" } });
    const { onDelete } = render();

    press(terminal, "Backspace", chord);
    const custom = new KeyboardEvent("keydown", {
      key: "Backspace",
      metaKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    terminal.dispatchEvent(custom);

    expect(onDelete).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("⌘R ⌘⌥⌫");
  });
});

describe("plain delete after a click", () => {
  it("deletes the row just clicked before the terminal sees the key", () => {
    const { onDelete } = render();

    pointerDown(row.firstElementChild!);
    const event = press(terminal, "Backspace");

    expect(onDelete).toHaveBeenCalledWith("api-copy");
    expect(event.defaultPrevented).toBe(true);
    expect(fieldKeys).toEqual([]);
  });

  it("accepts forward delete too", () => {
    const { onDelete } = render();
    pointerDown(row);
    press(terminal, "Delete");
    expect(onDelete).toHaveBeenCalledWith("api-copy");
  });

  it("is a normal key without a click on a row", () => {
    const { onDelete } = render();

    press(terminal, "Backspace");
    pointerDown(terminal);
    press(terminal, "Backspace");

    expect(onDelete).not.toHaveBeenCalled();
    expect(fieldKeys).toEqual(["Backspace", "Backspace"]);
  });

  it("disarms after any other key or once it has fired", () => {
    const { onDelete } = render();

    pointerDown(row);
    press(terminal, "a");
    press(terminal, "Backspace");
    expect(onDelete).not.toHaveBeenCalled();

    pointerDown(row);
    press(terminal, "Backspace");
    press(terminal, "Backspace");
    expect(onDelete).toHaveBeenCalledOnce();
    expect(fieldKeys).toEqual(["a", "Backspace", "Backspace"]);
  });

  it("disarms when the window loses focus", () => {
    const { onDelete } = render();

    pointerDown(row);
    window.dispatchEvent(new Event("blur"));
    press(terminal, "Backspace");

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("leaves the key to a text field that holds the cursor after the click", () => {
    const { onDelete } = render();

    pointerDown(row);
    const inComposer = press(composer, "Backspace");
    pointerDown(row);
    const inInput = press(input, "Delete");

    expect(onDelete).not.toHaveBeenCalled();
    expect(inComposer.defaultPrevented).toBe(false);
    expect(inInput.defaultPrevented).toBe(false);
    expect(fieldKeys).toEqual(["Backspace", "Delete"]);
  });

  it("acts on the open menu's row without a click", () => {
    const { onDelete } = render({ menuTarget: "web" });
    press(document.body, "Backspace");
    expect(onDelete).toHaveBeenCalledWith("web");
  });

  it("stands down while a modal is open", () => {
    const { onDelete } = render();
    const modal = openModal();

    pointerDown(row);
    const event = press(modal, "Backspace");

    expect(onDelete).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
