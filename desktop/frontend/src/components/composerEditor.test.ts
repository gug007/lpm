// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

// terminal-utils pulls in the Tauri bridge runtime, whose window-drag init reads
// window.__TAURI_INTERNALS__ at load — absent under happy-dom. composerEditor only
// needs ansiColors from it, so stub that and keep the bridge out of the test.
vi.mock("./terminal-utils", () => ({
  ansiColors: { brightBlue: "#5c9dff" },
}));

import { caretCharOffset, lineBeforeCaret } from "./composerEditor";
import { MENTION_TRIGGER } from "../mentions";

const ZWSP = "​";
const SLASH_TRIGGER = /^\s*\/([a-z0-9:_-]*)$/i;

function editor(): HTMLElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.appendChild(root);
  return root;
}

function chip(n: number): HTMLElement {
  const el = document.createElement("span");
  el.dataset.img = String(n);
  el.contentEditable = "false";
  el.innerHTML = `<span data-img-label>Image ${n}</span>`;
  return el;
}

function br(): HTMLElement {
  return document.createElement("br");
}

// Seat a collapsed caret at (node, offset) and mirror the live selection.
function caretAt(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("lineBeforeCaret", () => {
  it("returns '@' for [chip][zwsp]<br>'@' — mention trigger fires on the new line", () => {
    const root = editor();
    const at = document.createTextNode("@");
    root.append(chip(1), document.createTextNode(ZWSP), br(), at);
    caretAt(at, 1);

    const line = lineBeforeCaret(root);
    expect(line).toBe("@");
    const m = MENTION_TRIGGER.exec(line!);
    expect(m?.[1]).toBe("");
  });

  it("ends the line with '￼@f' for an @ typed right after a chip on the same line", () => {
    const root = editor();
    const text = document.createTextNode("@f");
    root.append(chip(1), document.createTextNode(ZWSP), text);
    caretAt(text, 2);

    const line = lineBeforeCaret(root);
    expect(line).toBe("￼@f");
    const m = MENTION_TRIGGER.exec(line!);
    expect(m?.[1]).toBe("f");
  });

  it("does not trigger a mention on a plain 'me@host'", () => {
    const root = editor();
    const text = document.createTextNode("me@host");
    root.append(text);
    caretAt(text, "me@host".length);

    const line = lineBeforeCaret(root);
    expect(line).toBe("me@host");
    expect(MENTION_TRIGGER.exec(line!)).toBeNull();
  });

  it("returns only the caret's line across a <br>, with the fragment before the caret", () => {
    const root = editor();
    const line2 = document.createTextNode("@fo");
    root.append(document.createTextNode("hello"), br(), line2);
    caretAt(line2, 3);

    const line = lineBeforeCaret(root);
    expect(line).toBe("@fo");
    expect(MENTION_TRIGGER.exec(line!)?.[1]).toBe("fo");
  });

  it("gives a bare '/sta' on a second line (slash menu can open)", () => {
    const root = editor();
    const line2 = document.createTextNode("/sta");
    root.append(document.createTextNode("hello"), br(), line2);
    caretAt(line2, 4);

    const line = lineBeforeCaret(root);
    expect(line).toBe("/sta");
    expect(SLASH_TRIGGER.exec(line!)?.[1]).toBe("sta");
  });

  it("suppresses the slash menu when a chip precedes '/sta' on the same line", () => {
    const root = editor();
    const line2 = document.createTextNode("/sta");
    root.append(document.createTextNode("hello"), br(), chip(1), line2);
    caretAt(line2, 4);

    const line = lineBeforeCaret(root);
    expect(line).toBe("￼/sta");
    expect(SLASH_TRIGGER.exec(line!)).toBeNull();
  });

  it("returns only the prefix before a mid-text caret", () => {
    const root = editor();
    const text = document.createTextNode("hello world");
    root.append(text);
    caretAt(text, 5);

    expect(lineBeforeCaret(root)).toBe("hello");
  });

  it("strips the ZWSP anchor and stray residue from the line", () => {
    const root = editor();
    const text = document.createTextNode(`${ZWSP}@x`);
    root.append(chip(1), text);
    caretAt(text, text.nodeValue!.length);

    expect(lineBeforeCaret(root)).toBe("￼@x");
  });

  it("descends a data-cmd span inline", () => {
    const root = editor();
    const span = document.createElement("span");
    span.dataset.cmd = "";
    const inner = document.createTextNode("/build");
    span.append(inner);
    root.append(span);
    caretAt(inner, 6);

    expect(lineBeforeCaret(root)).toBe("/build");
  });

  it("stops at a caret seated at the end of a block container, ignoring later siblings", () => {
    const root = editor();
    const block = document.createElement("div");
    block.append(document.createTextNode("@x"));
    root.append(block, document.createTextNode("after"));
    caretAt(block, block.childNodes.length);

    expect(lineBeforeCaret(root)).toBe("@x");
  });

  it("returns null when the selection is not collapsed inside the field", () => {
    const root = editor();
    root.append(document.createTextNode("hi"));
    window.getSelection()!.removeAllRanges();
    expect(lineBeforeCaret(root)).toBeNull();
  });
});

describe("caretCharOffset (unchanged raw-char pairing)", () => {
  it("counts chip label text and the ZWSP anchor as raw characters", () => {
    const root = editor();
    const text = document.createTextNode(`${ZWSP}ab`);
    root.append(chip(1), text);
    caretAt(text, text.nodeValue!.length);

    // "Image 1" (7) + ZWSP (1) + "ab" (2) = 10 raw chars up to the caret.
    expect(caretCharOffset(root)).toBe("Image 1".length + 1 + 2);
  });
});
