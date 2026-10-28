// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RailView } from "../../store/filesView";
import { FilesViewSwitch } from "./FilesViewSwitch";

let container: HTMLDivElement;
let root: Root;

function render(view: RailView, count: number | null = null) {
  const onChange = vi.fn();
  act(() => root.render(<FilesViewSwitch view={view} count={count} onChange={onChange} />));
  return onChange;
}

const segment = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Files view"] button')].find((button) =>
    button.textContent?.startsWith(text),
  )!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("FilesViewSwitch", () => {
  it("marks the view shown and asks for the one picked", () => {
    const onChange = render("files");
    expect(segment("Files").getAttribute("aria-pressed")).toBe("true");
    expect(segment("Changes").getAttribute("aria-pressed")).toBe("false");
    act(() => segment("Changes").click());
    expect(onChange).toHaveBeenCalledWith("changes");
    act(() => segment("Search").click());
    expect(onChange).toHaveBeenLastCalledWith("search");
    render("search");
    expect(segment("Search").getAttribute("aria-pressed")).toBe("true");
  });

  it("counts the uncommitted files on the Changes segment", () => {
    render("files", 2);
    expect(segment("Changes").textContent).toBe("Changes2");
    render("files", 0);
    expect(segment("Changes").textContent).toBe("Changes");
  });
});
