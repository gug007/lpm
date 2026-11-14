// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { dictationShortcutField } from "./shortcutTarget";

function pane(focused: boolean): { root: HTMLElement; terminal: HTMLTextAreaElement; editor: HTMLElement } {
  const root = document.createElement("div");
  if (focused) root.setAttribute("data-focused-pane", "");
  const xterm = document.createElement("div");
  xterm.className = "xterm";
  const terminal = document.createElement("textarea");
  xterm.append(terminal);
  const box = document.createElement("div");
  box.setAttribute("data-composer-box", "");
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  box.append(editor);
  root.append(xterm, box);
  document.body.append(root);
  return { root, terminal, editor };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dictationShortcutField", () => {
  it("dictates into the text field that has focus", () => {
    const input = document.createElement("input");
    document.body.append(input);
    expect(dictationShortcutField(input)).toBe(input);
  });

  it("sends a terminal's dictation to the input under that pane, not the terminal", () => {
    pane(false);
    const focused = pane(true);
    expect(dictationShortcutField(focused.terminal)).toBe(focused.editor);
  });

  it("falls back to the focused pane's input from anywhere else", () => {
    const focused = pane(true);
    expect(dictationShortcutField(document.body)).toBe(focused.editor);
  });

  it("finds nothing when the focused pane has no input", () => {
    const focused = pane(true);
    focused.root.querySelector("[data-composer-box]")!.remove();
    expect(dictationShortcutField(focused.terminal)).toBeNull();
  });
});
