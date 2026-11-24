// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installBackTab, nameBackTab } from "./backTab";

// What WebKitGTK 2.52 dispatches for Shift+Tab.
const BACK_TAB: KeyboardEventInit = { key: "Unidentified", code: "Tab", keyCode: 9, shiftKey: true };

function nameOf(init: KeyboardEventInit): string {
  const e = new KeyboardEvent("keydown", init);
  nameBackTab(e);
  return e.key;
}

describe("nameBackTab", () => {
  it("names Shift+Tab", () => {
    expect(nameOf(BACK_TAB)).toBe("Tab");
  });

  it("leaves every other key as the engine reports it", () => {
    expect(nameOf({ key: "Unidentified", keyCode: 0 })).toBe("Unidentified");
    expect(nameOf({ ...BACK_TAB, keyCode: 229 })).toBe("Unidentified");
    expect(nameOf({ key: "Process", keyCode: 9 })).toBe("Process");
  });
});

describe("installBackTab", () => {
  const listen = vi.spyOn(window, "addEventListener").mockImplementation(() => {});

  afterEach(() => listen.mockClear());

  it("names the key on its way down, press and release", () => {
    installBackTab(true);
    expect(listen.mock.calls).toEqual([
      ["keydown", nameBackTab, true],
      ["keyup", nameBackTab, true],
    ]);
  });

  it("does nothing off Linux", () => {
    installBackTab(false);
    expect(listen).not.toHaveBeenCalled();
  });
});
