import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

const KEY = "lpm.zoneLayers";
const zone = { name: "deploy", layers: [{ name: "a" }, { name: "b" }] };

async function load() {
  return import("./zoneLayers");
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveOpenLayer", () => {
  it("is null for a zone without layers", async () => {
    const { resolveOpenLayer } = await load();
    expect(resolveOpenLayer({}, "a")).toBeNull();
    expect(resolveOpenLayer({ layers: [] }, undefined)).toBeNull();
  });

  it("falls back to the first layer when nothing is stored", async () => {
    const { resolveOpenLayer } = await load();
    expect(resolveOpenLayer(zone, undefined)).toBe("a");
  });

  it("falls back to the first layer when the stored one is gone", async () => {
    const { resolveOpenLayer } = await load();
    expect(resolveOpenLayer(zone, "removed")).toBe("a");
  });

  it("returns the stored layer when it exists", async () => {
    const { resolveOpenLayer } = await load();
    expect(resolveOpenLayer(zone, "b")).toBe("b");
  });
});

describe("openListKey", () => {
  it("is the zone name for a zone without layers", async () => {
    const { openListKey } = await load();
    expect(openListKey("p", { name: "deploy" })).toBe("deploy");
  });

  it("follows setOpen per project and zone", async () => {
    const { openListKey, useZoneLayers } = await load();
    expect(openListKey("p", zone)).toBe("deploy/a");
    useZoneLayers.getState().setOpen("p", "deploy", "b");
    expect(openListKey("p", zone)).toBe("deploy/b");
    expect(openListKey("other", zone)).toBe("deploy/a");
  });
});

describe("persistence", () => {
  it("writes the open map as JSON on setOpen", async () => {
    const { useZoneLayers } = await load();
    useZoneLayers.getState().setOpen("p", "deploy", "b");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ "p\u0000deploy": "b" });
  });

  it("reads the stored map at store creation", async () => {
    localStorage.setItem(KEY, JSON.stringify({ "p\u0000deploy": "b" }));
    const { openListKey } = await load();
    expect(openListKey("p", zone)).toBe("deploy/b");
  });

  it("ignores a corrupt stored value", async () => {
    localStorage.setItem(KEY, "{nope");
    const { openListKey } = await load();
    expect(openListKey("p", zone)).toBe("deploy/a");
  });

  it("still updates state when localStorage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    });
    const { openListKey, useZoneLayers } = await load();
    expect(() => useZoneLayers.getState().setOpen("p", "deploy", "b")).not.toThrow();
    expect(openListKey("p", zone)).toBe("deploy/b");
  });

  it("works without localStorage", async () => {
    vi.stubGlobal("localStorage", undefined);
    const { openListKey, useZoneLayers } = await load();
    useZoneLayers.getState().setOpen("p", "deploy", "b");
    expect(openListKey("p", zone)).toBe("deploy/b");
  });
});
