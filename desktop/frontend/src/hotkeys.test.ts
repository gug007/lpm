import { describe, expect, it } from "vitest";
import {
  configuredHotkeyCombos,
  normalizeHotkeys,
  resolveHotkey,
} from "./hotkeys";

describe("normalizeHotkeys", () => {
  it("returns a dense default map for missing/empty input", () => {
    expect(normalizeHotkeys(undefined)).toEqual({
      tabSwitchNext: "cmd+alt+arrowright",
      tabSwitchPrev: "cmd+alt+arrowleft",
    });
  });

  it("keeps valid entries and defaults invalid ones", () => {
    expect(normalizeHotkeys({ tabSwitchNext: "cmd+shift+]", tabSwitchPrev: "" })).toEqual({
      tabSwitchNext: "cmd+shift+]",
      tabSwitchPrev: "cmd+alt+arrowleft",
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
      new Set(["cmd+alt+arrowright", "cmd+alt+arrowleft"]),
    );
  });

  it("excludes the row being edited", () => {
    expect(configuredHotkeyCombos(undefined, "tabSwitchNext")).toEqual(
      new Set(["cmd+alt+arrowleft"]),
    );
  });
});
