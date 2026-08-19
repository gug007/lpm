// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarGroupRow } from "./SidebarGroupRow";
import type { RollupSegment } from "./sidebarRollup";
import type { ProjectGroup } from "../types";

const GROUP: ProjectGroup = { id: "g1", name: "archive", members: [], collapsed: true };

const WAITING: RollupSegment[] = [
  { key: "needs-you", text: "1 needs you", className: "sidebar-waiting" },
];

let container: HTMLElement;
let root: Root;

function render(props: Partial<Parameters<typeof SidebarGroupRow>[0]> = {}) {
  act(() => {
    root.render(
      <SidebarGroupRow
        group={GROUP}
        collapsed
        count={8}
        segments={[]}
        containsSelected={false}
        selectMode={false}
        isContextTarget={false}
        onToggle={vi.fn()}
        onMore={vi.fn()}
        {...props}
      />,
    );
  });
  return container.querySelector("button") as HTMLButtonElement;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SidebarGroupRow", () => {
  it("stays one line and keeps its count when the fold hides nothing worth saying", () => {
    const header = render({ segments: [] });
    expect(header.className).toContain("h-9");
    expect(header.className).not.toContain("items-start");
    expect(header.textContent).toContain("8");
  });

  it("grows a second line and drops the count when the fold hides something", () => {
    const header = render({ segments: WAITING });
    expect(header.className).toContain("items-start");
    expect(header.className).not.toContain("h-9");
    expect(header.textContent).toContain("1 needs you");
    // The line says it better than the numeral does, so they never both show.
    expect(header.textContent).not.toContain("8");
  });

  it("stays one line while expanded, however busy its members are", () => {
    const header = render({ collapsed: false, segments: WAITING });
    expect(header.className).toContain("h-9");
    expect(header.textContent).not.toContain("needs you");
  });

  it("marks its expanded state for assistive tech", () => {
    expect(render({ collapsed: false }).getAttribute("aria-expanded")).toBe("true");
    expect(render({ collapsed: true }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a focus mark of its own, since the plate's glyph swap is hover-only", () => {
    expect(render().className).toContain("focus-visible:ring");
  });

  it("wears the active background when a fold hides the open project", () => {
    expect(render({ containsSelected: true }).className).toContain("bg-[var(--bg-active)]");
  });

  it("offers no menu in select mode", () => {
    render({ selectMode: true });
    expect(container.querySelectorAll("button")).toHaveLength(1);
    render({ selectMode: false });
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });
});
