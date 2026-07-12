import { describe, expect, it } from "vitest";
import { servicePortMap, tabPort } from "./remoteTabs";

describe("servicePortMap", () => {
  it("maps service names to their first positive port", () => {
    const map = servicePortMap([
      { name: "dev", port: [9245] },
      { name: "web", port: [3000, 3001] },
    ]);
    expect(map).toEqual({ dev: 9245, web: 3000 });
  });

  it("skips services without a usable port", () => {
    expect(servicePortMap([{ name: "worker" }, { name: "zero", port: [0] }])).toEqual({});
  });

  it("handles undefined", () => {
    expect(servicePortMap(undefined)).toEqual({});
  });
});

describe("tabPort", () => {
  it("returns the port for a service-labeled terminal, else undefined", () => {
    const ports = { dev: 9245 };
    expect(tabPort("dev", ports)).toBe(9245);
    expect(tabPort("Claude", ports)).toBeUndefined();
  });
});
