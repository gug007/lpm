// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("./terminal-utils", () => ({
  ansiColors: { brightBlue: "#5c9dff" },
}));

import { formatQuote, insertBlockAtCaret } from "./composerQuote";
import { serializeEditor } from "./composerEditor";

function field(text: string): HTMLDivElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  root.textContent = text;
  document.body.appendChild(root);
  return root;
}

describe("formatQuote", () => {
  it("puts each line behind a quote marker and leaves a blank line after", () => {
    expect(formatQuote("one\ntwo")).toBe("> one\n> two\n\n");
  });

  it("keeps inner blank lines inside the quote and drops the outer ones", () => {
    expect(formatQuote("\n\nfirst\n\nsecond\n\n")).toBe("> first\n>\n> second\n\n");
  });
});

describe("insertBlockAtCaret", () => {
  it("fills an empty field with the block", () => {
    const root = field("");
    insertBlockAtCaret(root, "> hi\n\n");
    expect(serializeEditor(root)).toBe("> hi\n\n");
  });

  it("starts the block on a new line after text", () => {
    const root = field("about this");
    insertBlockAtCaret(root, "> hi\n\n");
    expect(serializeEditor(root)).toBe("about this\n> hi\n\n");
  });
});
