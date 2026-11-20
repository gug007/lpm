import { describe, expect, it } from "vitest";
import {
  configuredHotkeyCombos,
  hotkeyDefs,
  normalizeHotkeys,
  resolveHotkey,
} from "./hotkeys";

describe("hotkeyDefs", () => {
  it("steps tabs and panes with PageDown / PageUp off macOS, where Ctrl+Alt+arrows switch workspaces", () => {
    expect(Object.fromEntries(hotkeyDefs(false).map((d) => [d.id, d.default]))).toEqual({
      tabSwitchNext: "cmd+pagedown",
      tabSwitchPrev: "cmd+pageup",
      paneFocusNext: "cmd+shift+pagedown",
      paneFocusPrev: "cmd+shift+pageup",
      renameProject: "cmd+r",
      deleteProject: "cmd+shift+backspace",
    });
  });

  it("gives Dictate ⌥⌘V on macOS only, where VoiceToText runs", () => {
    expect(hotkeyDefs(true).find((d) => d.id === "dictate")?.default).toBe("cmd+alt+v");
    expect(hotkeyDefs(false).some((d) => d.id === "dictate")).toBe(false);
  });
});

describe("normalizeHotkeys", () => {
  it("returns a dense default map for missing/empty input", () => {
    expect(normalizeHotkeys(undefined)).toEqual({
      tabSwitchNext: "cmd+alt+arrowright",
      tabSwitchPrev: "cmd+alt+arrowleft",
      paneFocusNext: "cmd+alt+arrowdown",
      paneFocusPrev: "cmd+alt+arrowup",
      renameProject: "cmd+r",
      deleteProject: "cmd+shift+backspace",
      dictate: "cmd+alt+v",
    });
  });

  it("keeps valid entries and defaults invalid ones", () => {
    expect(normalizeHotkeys({ tabSwitchNext: "cmd+shift+]", tabSwitchPrev: "" })).toEqual({
      tabSwitchNext: "cmd+shift+]",
      tabSwitchPrev: "cmd+alt+arrowleft",
      paneFocusNext: "cmd+alt+arrowdown",
      paneFocusPrev: "cmd+alt+arrowup",
      renameProject: "cmd+r",
      deleteProject: "cmd+shift+backspace",
      dictate: "cmd+alt+v",
    });
  });
});

describe("resolveHotkey", () => {
  it("falls back to the registry default when unset", () => {
    expect(resolveHotkey(undefined, "tabSwitchNext")).toBe("cmd+alt+arrowright");
    expect(resolveHotkey({ tabSwitchNext: "" }, "tabSwitchNext")).toBe("cmd+alt+arrowright");
  });

  it("returns a configured value", () => {
    expect(resolveHotkey({ tabSwitchNext: "cmd+shift+]" }, "tabSwitchNext")).toBe("cmd+shift+]");
  });
});

describe("configuredHotkeyCombos", () => {
  it("collects the canonical combos of all configurable hotkeys", () => {
    expect(configuredHotkeyCombos(undefined)).toEqual(
      new Set([
        "cmd+alt+arrowright",
        "cmd+alt+arrowleft",
        "cmd+alt+arrowdown",
        "cmd+alt+arrowup",
        "cmd+r",
        "cmd+shift+backspace",
        "cmd+alt+v",
      ]),
    );
  });

  it("excludes the row being edited", () => {
    expect(configuredHotkeyCombos(undefined, "tabSwitchNext")).toEqual(
      new Set(["cmd+alt+arrowleft", "cmd+alt+arrowdown", "cmd+alt+arrowup", "cmd+r", "cmd+shift+backspace", "cmd+alt+v"]),
    );
  });
});
