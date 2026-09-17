import { describe, expect, it } from "vitest";
import { iconForFile } from "./fileIcons";
import { SETI_DEFAULT, SETI_DEFS } from "./setiIconData";

const glyphOf = (id: string) => SETI_DEFS[id][0];

describe("iconForFile", () => {
  it("maps common extensions through the theme's language ids", () => {
    expect(iconForFile("Init.js")).toEqual({
      glyph: glyphOf("_javascript"),
      dark: "#cbcb41",
      light: "#b7b73b",
    });
    expect(iconForFile("App.tsx").glyph).toBe(glyphOf("_react"));
    expect(iconForFile("main.rs").glyph).toBe(glyphOf("_rust"));
  });

  it("prefers a whole file name, then the longest dotted suffix", () => {
    expect(iconForFile("README.md").glyph).toBe(glyphOf("_info"));
    expect(iconForFile("tsconfig.json").glyph).toBe(glyphOf("_tsconfig"));
    expect(iconForFile("Dockerfile").glyph).toBe(glyphOf("_docker"));
    expect(iconForFile("app.test.js")).toEqual(iconForFile("lib.test.js"));
    expect(iconForFile("types.d.ts").glyph).toBe(glyphOf("_typescript"));
  });

  it("handles dotfiles and env variants", () => {
    expect(iconForFile(".gitignore").glyph).toBe(glyphOf("_git"));
    expect(iconForFile(".env.local")).toEqual(iconForFile(".env"));
  });

  it("falls back to the generic file icon, and dims what the theme ignores", () => {
    expect(iconForFile("notes.weirdext").glyph).toBe(glyphOf(SETI_DEFAULT));
    expect(iconForFile("CHANGELOG-notes").glyph).toBe(glyphOf(SETI_DEFAULT));
    expect(iconForFile(".DS_Store").glyph).toBe(glyphOf("_ignored"));
  });

  it("ignores case", () => {
    expect(iconForFile("INIT.JS")).toEqual(iconForFile("init.js"));
  });
});
