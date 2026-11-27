// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { memoryPillAt, memoryPillRect } from "./composerMemoryPill";

function part(text: string, box: [number, number, number, number]): HTMLElement {
  const span = document.createElement("span");
  span.dataset.cmd = "";
  span.dataset.memchip = "auth-refactor";
  span.textContent = text;
  span.getBoundingClientRect = () => new DOMRect(...box);
  return span;
}

function field(...nodes: Node[]): HTMLElement {
  const root = document.createElement("div");
  root.append(...nodes);
  return root;
}

describe("memoryPillAt", () => {
  it("resolves both halves to the pill's first span", () => {
    const cmd = part("/lpm-memory ", [10, 20, 100, 18]);
    const id = part("auth-refactor", [110, 20, 90, 18]);
    field(cmd, id, document.createTextNode(" continue"));

    expect(memoryPillAt(cmd)).toBe(cmd);
    expect(memoryPillAt(id)).toBe(cmd);
  });

  it("finds nothing outside a pill", () => {
    const plain = document.createElement("span");
    field(plain);

    expect(memoryPillAt(plain)).toBeNull();
  });
});

describe("memoryPillRect", () => {
  it("covers both halves on one line", () => {
    const cmd = part("/lpm-memory ", [10, 20, 100, 18]);
    const id = part("auth-refactor", [110, 20, 90, 18]);
    field(cmd, id);

    const rect = memoryPillRect(cmd);
    expect([rect.left, rect.top, rect.right, rect.bottom]).toEqual([10, 20, 200, 38]);
  });

  it("covers both halves when the pill wraps at its gap", () => {
    const cmd = part("/lpm-memory ", [10, 20, 100, 18]);
    const id = part("auth-refactor", [4, 40, 90, 18]);
    field(cmd, id);

    const rect = memoryPillRect(cmd);
    expect([rect.left, rect.top, rect.right, rect.bottom]).toEqual([4, 20, 110, 58]);
  });

  it("is the span's own box when nothing follows it", () => {
    const cmd = part("/lpm-memory ", [10, 20, 100, 18]);
    field(cmd, document.createTextNode("auth-refactor"));

    expect(memoryPillRect(cmd).width).toBe(100);
  });
});
