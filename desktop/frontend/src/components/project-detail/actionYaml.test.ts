import { describe, expect, it } from "vitest";
import {
  pickUnmanaged,
  reorderById,
  unmanagedActionKeys,
  unmanagedFieldsChanged,
  yamlToActionInfo,
} from "./actionYaml";

describe("unmanagedActionKeys", () => {
  it("returns only unmanaged keys, sorted", () => {
    const payload = {
      label: "Dev",
      cmd: "npm run dev",
      type: "terminal",
      inputs: [{ name: "branch" }],
      env: { PORT: "3000" },
      depends_on: ["db"],
    };
    expect(unmanagedActionKeys(payload)).toEqual([
      "depends_on",
      "env",
      "inputs",
    ]);
  });

  it("is empty when every field is managed", () => {
    expect(
      unmanagedActionKeys({ label: "Dev", cmd: "x", port: 3000, position: 2 }),
    ).toEqual([]);
  });

  it("treats null/undefined as empty", () => {
    expect(unmanagedActionKeys(null)).toEqual([]);
    expect(unmanagedActionKeys(undefined)).toEqual([]);
  });
});

describe("pickUnmanaged", () => {
  it("keeps unmanaged fields and drops managed ones", () => {
    expect(
      pickUnmanaged({
        label: "Dev",
        cmd: "npm run dev",
        env: { PORT: "3000" },
        inputs: [{ name: "branch" }],
      }),
    ).toEqual({ env: { PORT: "3000" }, inputs: [{ name: "branch" }] });
  });
});

describe("unmanagedFieldsChanged", () => {
  it("is false when unmanaged fields match despite managed differences", () => {
    const a = { label: "Dev", cmd: "a", env: { PORT: "3000" } };
    const b = { label: "Prod", cmd: "b", type: "terminal", env: { PORT: "3000" } };
    expect(unmanagedFieldsChanged(a, b)).toBe(false);
  });

  it("is true when an unmanaged field differs", () => {
    const a = { cmd: "x", env: { PORT: "3000" } };
    const b = { cmd: "x", env: { PORT: "4000" } };
    expect(unmanagedFieldsChanged(a, b)).toBe(true);
  });

  it("is true when an unmanaged field is added or removed", () => {
    expect(unmanagedFieldsChanged({ cmd: "x" }, { cmd: "x", inputs: [] })).toBe(
      true,
    );
    expect(unmanagedFieldsChanged({ inputs: [] }, {})).toBe(true);
  });

  it("treats null base as no unmanaged fields", () => {
    expect(unmanagedFieldsChanged(null, {})).toBe(false);
    expect(unmanagedFieldsChanged(null, { env: {} })).toBe(true);
  });
});

describe("yamlToActionInfo port handling", () => {
  it("maps a single numeric port to a one-element array", () => {
    expect(yamlToActionInfo("label: Dev\ncmd: npm run dev\nport: 3000").port).toEqual([
      3000,
    ]);
  });

  it("maps a port list to an array", () => {
    expect(
      yamlToActionInfo("cmd: x\nport:\n  - 3000\n  - 3001\n").port,
    ).toEqual([3000, 3001]);
  });

  it("leaves port undefined when absent", () => {
    expect(yamlToActionInfo("cmd: x").port).toBeUndefined();
  });

  it("maps a valid portConflict policy and rejects an invalid one", () => {
    expect(yamlToActionInfo("cmd: x\nportConflict: free").portConflict).toBe(
      "free",
    );
    expect(
      yamlToActionInfo("cmd: x\nportConflict: nonsense").portConflict,
    ).toBeUndefined();
  });

  it("throws on a non-mapping document", () => {
    expect(() => yamlToActionInfo("- just\n- a\n- list")).toThrow();
  });
});

describe("reorderById", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("reorders to match the id order, preserving identity", () => {
    const out = reorderById(items, ["c", "a", "b"]);
    expect(out.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(out[0]).toBe(items[2]);
  });

  it("appends ids missing from the order in their original order", () => {
    expect(reorderById(items, ["b"]).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
