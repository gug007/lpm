import { afterEach, describe, expect, it, vi } from "vitest";
import type { Platform } from "./platform";

const setTheme = vi.hoisted(() => vi.fn((_theme: "light" | "dark" | null) => Promise.resolve()));
vi.mock("@tauri-apps/api/app", () => ({ setTheme }));

const g = globalThis as { window?: unknown };

async function load(platform: Platform, desktopDark = false) {
  g.window = {
    __LPM_PLATFORM__: platform,
    matchMedia: () => ({ matches: desktopDark }),
  };
  vi.resetModules();
  return import("./windowTheme");
}

afterEach(() => {
  delete g.window;
  setTheme.mockClear();
});

describe("nativeTheme", () => {
  it("leaves macOS alone", async () => {
    const { nativeTheme } = await load("macos");
    expect(nativeTheme("dark", "macos", null)).toBeUndefined();
    expect(nativeTheme("system", "macos", true)).toBeUndefined();
  });

  it("hands a chosen theme to Linux and Windows as it is", async () => {
    const { nativeTheme } = await load("linux");
    expect(nativeTheme("dark", "windows", null)).toBe("dark");
    expect(nativeTheme("light", "linux", null)).toBe("light");
  });

  it("lets Windows follow the system on its own", async () => {
    const { nativeTheme } = await load("windows");
    expect(nativeTheme("system", "windows", null)).toBeNull();
  });

  it("puts back the desktop's own choice on Linux, and only after lpm made one", async () => {
    const { nativeTheme } = await load("linux");
    expect(nativeTheme("system", "linux", null)).toBeUndefined();
    expect(nativeTheme("system", "linux", true)).toBe("dark");
    expect(nativeTheme("system", "linux", false)).toBe("light");
  });
});

describe("syncNativeTheme", () => {
  it("never touches the macOS window", async () => {
    const { syncNativeTheme } = await load("macos");
    syncNativeTheme("dark");
    syncNativeTheme("system");
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("sets Windows once per change and lets System follow the OS", async () => {
    const { syncNativeTheme } = await load("windows");
    syncNativeTheme("dark");
    syncNativeTheme("dark");
    syncNativeTheme("system");
    expect(setTheme.mock.calls).toEqual([["dark"], [null]]);
  });

  it("leaves a Linux desktop's own theme alone until lpm picks one", async () => {
    const { syncNativeTheme } = await load("linux", true);
    syncNativeTheme("system");
    expect(setTheme).not.toHaveBeenCalled();
    syncNativeTheme("light");
    syncNativeTheme("system");
    expect(setTheme.mock.calls).toEqual([["light"], ["dark"]]);
  });
});
