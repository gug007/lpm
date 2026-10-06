// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isBrowserAccelerator, keepsEngineContextMenu } from "./webviewGuards";

const key = (k: string, mods: Partial<Record<"ctrl" | "meta" | "shift" | "alt", boolean>> = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("keepsEngineContextMenu", () => {
  it("keeps the menu in text fields, for cut, copy and paste", () => {
    document.body.innerHTML = `<input id="t" type="text"><textarea id="a"></textarea><div id="e" contenteditable="true"><span id="s">x</span></div>`;
    for (const id of ["t", "a", "s"]) {
      expect(keepsEngineContextMenu({ target: document.getElementById(id), shiftKey: false }, false)).toBe(true);
    }
  });

  it("drops it on chrome and on non-text inputs", () => {
    document.body.innerHTML = `<div id="d">plain</div><input id="c" type="checkbox"><input id="x" type="text" disabled>`;
    for (const id of ["d", "c", "x"]) {
      expect(keepsEngineContextMenu({ target: document.getElementById(id), shiftKey: false }, false)).toBe(false);
    }
  });

  it("keeps it over selected text so Copy is there", () => {
    document.body.innerHTML = `<p id="p">some text</p><p id="q">other</p>`;
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p")!);
    window.getSelection()!.addRange(range);
    expect(keepsEngineContextMenu({ target: document.getElementById("p"), shiftKey: false }, false)).toBe(true);
    expect(keepsEngineContextMenu({ target: document.getElementById("q"), shiftKey: false }, false)).toBe(false);
  });

  it("lets Shift reach Inspect in a dev build only", () => {
    document.body.innerHTML = `<div id="d"></div>`;
    const target = document.getElementById("d");
    expect(keepsEngineContextMenu({ target, shiftKey: true }, true)).toBe(true);
    expect(keepsEngineContextMenu({ target, shiftKey: true }, false)).toBe(false);
  });
});

describe("isBrowserAccelerator", () => {
  it("catches reload, find, print and save", () => {
    for (const k of ["r", "R", "f", "g", "p", "s"]) {
      expect(isBrowserAccelerator(key(k, { ctrl: true }))).toBe(true);
    }
    expect(isBrowserAccelerator(key("R", { ctrl: true, shift: true }))).toBe(true);
    expect(isBrowserAccelerator(key("F5"))).toBe(true);
    expect(isBrowserAccelerator(key("F5", { ctrl: true }))).toBe(true);
    expect(isBrowserAccelerator(key("F3"))).toBe(true);
  });

  it("catches history navigation", () => {
    expect(isBrowserAccelerator(key("ArrowLeft", { alt: true }))).toBe(true);
    expect(isBrowserAccelerator(key("ArrowRight", { alt: true }))).toBe(true);
    expect(isBrowserAccelerator(key("BrowserBack"))).toBe(true);
  });

  it("leaves editing keys and AltGr chords alone", () => {
    for (const k of ["c", "v", "x", "z", "a"]) {
      expect(isBrowserAccelerator(key(k, { ctrl: true }))).toBe(false);
    }
    expect(isBrowserAccelerator(key("r", { ctrl: true, alt: true }))).toBe(false);
    expect(isBrowserAccelerator(key("ArrowLeft", { ctrl: true }))).toBe(false);
    expect(isBrowserAccelerator(key("r"))).toBe(false);
    expect(isBrowserAccelerator(key("F5", { alt: true }))).toBe(false);
  });
});
