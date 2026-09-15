// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarDuplicateSkeletonRow } from "./SidebarDuplicateSkeletonRow";

let container: HTMLElement;
let root: Root;

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("../hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => motion.reduce,
}));

function render(props: Partial<Parameters<typeof SidebarDuplicateSkeletonRow>[0]> = {}) {
  act(() => {
    root.render(
      <SidebarDuplicateSkeletonRow
        parentLabel="glimpse2"
        label=""
        worktree={false}
        indented={false}
        {...props}
      />,
    );
  });
}

const row = () => container.querySelector("[role=status]") as HTMLElement;
const bar = () => row().querySelector("span > span.h-3") as HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  motion.reduce = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SidebarDuplicateSkeletonRow", () => {
  it("sizes the name bar from the label the copy was given", () => {
    render({ label: "reviewer" });
    expect(bar().style.width).toBe("8ch");
  });

  it("sizes an unlabelled copy after its parent's name plus a suffix", () => {
    render();
    expect(bar().style.width).toBe("10ch");
  });

  it("clamps the bar to the width a name can take", () => {
    render({ label: "a-very-long-label-that-would-overflow-the-row" });
    expect(bar().style.width).toBe("22ch");
    render({ label: "ab" });
    expect(bar().style.width).toBe("6ch");
  });

  it("names what is being made and where", () => {
    render({ worktree: true });
    expect(row().getAttribute("aria-label")).toBe("Creating worktree of glimpse2");
    render();
    expect(row().getAttribute("aria-label")).toBe("Creating duplicate of glimpse2");
  });

  it("steps in under a folder and stops pulsing under reduced motion", () => {
    render({ indented: true });
    expect(row().className).toContain("pl-[27px]");
    expect(row().className).toContain("animate-pulse");
    motion.reduce = true;
    render({ indented: true });
    expect(row().className).not.toContain("animate-pulse");
  });
});
