// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEmptyRowSpace } from "./rowMenuTarget";

let row: HTMLDivElement;
const el = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  row = document.createElement("div");
  row.innerHTML = `
    <h1 id="title">web</h1>
    <div id="gap"><span id="tip">Press ⌘T</span></div>
    <button id="btn"><span id="label">Test</span></button>
    <div data-zone-frame=""><div id="zone-pad"></div></div>
    <input id="field" />
    <textarea id="area"></textarea>
    <select id="pick"><option>a</option></select>
    <a href="#" id="link"><span id="link-text">PR #4</span></a>
    <div contenteditable="true" id="editable"></div>
    <div role="button" id="fake-button"></div>
    <div data-row-menu="off"><div id="popover-pad"></div></div>`;
  document.body.appendChild(row);
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("isEmptyRowSpace", () => {
  it("is the row itself and plain content in it", () => {
    expect(isEmptyRowSpace(row, row)).toBe(true);
    for (const id of ["title", "gap", "tip"]) expect(isEmptyRowSpace(row, el(id)), id).toBe(true);
  });

  it("is never a control, a field, a link, a zone or an opted-out popover", () => {
    for (const id of ["btn", "label", "zone-pad", "field", "area", "pick", "link", "link-text", "editable", "fake-button", "popover-pad"]) {
      expect(isEmptyRowSpace(row, el(id)), id).toBe(false);
    }
  });

  it("is never outside the row, as in a portaled panel", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    expect(isEmptyRowSpace(row, panel)).toBe(false);
    expect(isEmptyRowSpace(row, null)).toBe(false);
  });

  it("ignores a control around the row", () => {
    const wrapper = document.createElement("a");
    document.body.appendChild(wrapper);
    wrapper.appendChild(row);
    expect(isEmptyRowSpace(row, el("title"))).toBe(true);
  });

  it("is not selected text, which the user may be copying", () => {
    window.getSelection()!.selectAllChildren(el("title"));
    expect(isEmptyRowSpace(row, el("title"))).toBe(false);
  });

  it("is not part-selected text either", () => {
    const text = el("title").firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    window.getSelection()!.addRange(range);
    expect(isEmptyRowSpace(row, el("title"))).toBe(false);
  });

  it("is not anywhere in a selection that spans the row", () => {
    window.getSelection()!.selectAllChildren(document.body);
    for (const target of [row, el("title"), el("gap"), el("tip")]) expect(isEmptyRowSpace(row, target), target.id).toBe(false);
  });

  it("is still there next to selected text", () => {
    window.getSelection()!.selectAllChildren(el("title"));
    for (const id of ["gap", "tip"]) expect(isEmptyRowSpace(row, el(id)), id).toBe(true);
  });

  it("is still there when the selection is elsewhere in the window", () => {
    const elsewhere = document.createElement("p");
    elsewhere.textContent = "copy me";
    document.body.appendChild(elsewhere);
    window.getSelection()!.selectAllChildren(elsewhere);
    for (const target of [row, el("title"), el("gap"), el("tip")]) expect(isEmptyRowSpace(row, target), target.id).toBe(true);
  });

  it("is back once the selection is gone, or when it is only a caret", () => {
    const selection = window.getSelection()!;
    selection.selectAllChildren(el("title"));
    selection.removeAllRanges();
    expect(isEmptyRowSpace(row, el("title"))).toBe(true);
    selection.collapse(el("title"), 0);
    expect(isEmptyRowSpace(row, el("title"))).toBe(true);
  });
});
