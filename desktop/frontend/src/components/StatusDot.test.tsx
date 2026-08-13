// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { StatusDot, dotKind } from "./StatusDot";

function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(node));
  return container;
}

// The status light itself is always the last span — everything before it is the
// mark that says what kind of row this is.
function dot(container: HTMLDivElement): HTMLSpanElement {
  return [...container.querySelectorAll("span")].at(-1)!;
}

describe("dotKind", () => {
  it("reads the row's kind off the project", () => {
    expect(dotKind({})).toBe("project");
    expect(dotKind({ parentName: "lpm" })).toBe("copy");
    expect(dotKind({ parentName: "lpm", worktree: true })).toBe("worktree");
    // The flag without a parent is not something the backend sends, and the
    // absence of a parent is what makes a row a project of its own.
    expect(dotKind({ worktree: true })).toBe("project");
  });
});

describe("StatusDot", () => {
  it("is one dot for a project of its own", () => {
    const container = render(<StatusDot running />);
    expect(container.querySelectorAll("span")).toHaveLength(1);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("puts a faint twin behind a copy's dot", () => {
    const container = render(<StatusDot running kind="copy" />);
    const twin = container.querySelectorAll("span")[1];
    expect(twin.className).toContain("opacity-35");
    // The twin is not a status light: it never carries the stopped ring.
    expect(twin.className).not.toContain("border");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("puts a branch node and stem behind a worktree's dot", () => {
    const container = render(<StatusDot running kind="worktree" />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("path")).not.toBeNull();
    expect(svg.querySelector("circle")).not.toBeNull();
    // The branch stands for the link, not the state, so it stays muted.
    expect(svg.querySelector("path")!.getAttribute("stroke")).toBe("var(--text-muted)");
  });

  it("keeps every kind's own dot reading running or stopped", () => {
    for (const kind of ["project", "copy", "worktree"] as const) {
      expect(dot(render(<StatusDot running kind={kind} />)).className).toContain(
        "bg-[var(--accent-green)]",
      );
      expect(dot(render(<StatusDot running={false} kind={kind} />)).className).toContain(
        "border-[var(--text-muted)]",
      );
    }
  });

  it("takes no layout width for either mark, so the dots stay in one column", () => {
    for (const kind of ["copy", "worktree"] as const) {
      const wrapper = render(<StatusDot running kind={kind} />).firstElementChild!;
      expect(wrapper.className).toContain("h-2 w-2");
      // getAttribute, not .className: on the worktree's <svg> that property is
      // an SVGAnimatedString, not a string.
      expect(wrapper.firstElementChild!.getAttribute("class")).toContain("absolute");
    }
  });
});
