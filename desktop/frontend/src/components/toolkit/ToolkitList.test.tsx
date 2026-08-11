// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolkitList } from "./ToolkitList";
import type { AgentCapability } from "../../toolkit";
import { orderForDisplay } from "../../toolkit";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // happy-dom has no layout, so the row's own scroll-into-view is a no-op here.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const cap = (over: Partial<AgentCapability> = {}): AgentCapability => ({
  id: over.name ?? "id",
  kind: "skill",
  name: "deploy",
  cli: "claude",
  scope: "user",
  path: "/h/.claude/skills/deploy/SKILL.md",
  description: "",
  detail: "",
  enabled: true,
  editable: true,
  shadowedBy: "",
  problem: "",
  bytes: 0,
  ...over,
});

function render(items: AgentCapability[], activeIndex: number, onActivate = vi.fn()) {
  act(() => {
    root.render(
      <ToolkitList
        items={items}
        activeIndex={activeIndex}
        onHover={vi.fn()}
        onActivate={onActivate}
      />,
    );
  });
  return Array.from(container.querySelectorAll("button"));
}

// The list renders in sections but the keyboard walks one flat index. If those
// two ever disagree, Enter opens the wrong capability — silently.
describe("ToolkitList index mapping", () => {
  const items = orderForDisplay([
    cap({ name: "playwright", kind: "mcp" }),
    cap({ name: "lpm-config", kind: "skill" }),
    cap({ name: "deploy", kind: "skill", shadowedBy: "/h/x/SKILL.md" }),
    cap({ name: "review", kind: "command" }),
  ]);

  it("orders rows so the broken one leads, then MCP, skills, commands", () => {
    const rows = render(items, 0);
    expect(rows.map((r) => r.textContent)).toHaveLength(4);
    expect(rows[0].textContent).toContain("deploy");
    expect(rows[1].textContent).toContain("playwright");
    expect(rows[2].textContent).toContain("lpm-config");
    expect(rows[3].textContent).toContain("review");
  });

  it("marks exactly the row at activeIndex, counting across section headers", () => {
    for (let i = 0; i < items.length; i += 1) {
      const rows = render(items, i);
      const marked = rows.filter((r) => r.getAttribute("aria-current") === "true");
      expect(marked).toHaveLength(1);
      expect(marked[0].textContent).toContain(items[i].name);
    }
  });

  it("activates the capability whose row was clicked", () => {
    const onActivate = vi.fn();
    const rows = render(items, 0, onActivate);
    act(() => {
      rows[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onActivate).toHaveBeenCalledWith(items[2]);
  });

  it("keeps a shadowed row's description visible next to its warning", () => {
    const rows = render(
      [cap({ name: "deploy", shadowedBy: "/h/x/SKILL.md", description: "Ship the thing" })],
      0,
    );
    expect(rows[0].textContent).toContain("Shadowed by");
    expect(rows[0].textContent).toContain("Ship the thing");
  });
});
