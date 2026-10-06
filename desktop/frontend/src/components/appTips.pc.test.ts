import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Tips = typeof import("./appTips");
type Words = typeof import("../machineWords");

const g = globalThis as { window?: { __LPM_PLATFORM__?: string } };
let tips: Tips;
let words: Words;

beforeAll(async () => {
  g.window = { __LPM_PLATFORM__: "windows" };
  vi.resetModules();
  tips = await import("./appTips");
  words = await import("../machineWords");
});

afterAll(() => {
  delete g.window;
});

describe("app copy on Windows", () => {
  const kbds = (id: string) =>
    tips.APP_TIPS.find((t) => t.id === id)!.segments.flatMap((s) => (typeof s === "string" ? [] : [s.kbd]));

  it("spells shortcuts out in their Ctrl forms", () => {
    expect(kbds("toggle-input")).toEqual(["Ctrl+Shift+I"]);
    expect(kbds("newline")).toEqual(["Shift+Enter"]);
    expect(kbds("split")).toEqual(["Ctrl+Shift+D", "Ctrl+Alt+Shift+D"]);
    expect(kbds("zoom")).toEqual(["Ctrl++", "Ctrl+-"]);
    expect(kbds("switch-project")).toEqual(["Ctrl+1", "Ctrl+9"]);
  });

  it("drops the dictation tip", () => {
    expect(tips.APP_TIPS.some((t) => t.id === "mic-dictate")).toBe(false);
  });

  it("names the machine and its file manager for the platform", () => {
    expect(words.MACHINE.thisMachine).toBe("this computer");
    expect(words.revealLabel()).toBe("Show in File Explorer");
  });
});
