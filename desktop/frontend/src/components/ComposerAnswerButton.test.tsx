// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerAnswerButton, type ComposerAnswerButtonProps } from "./ComposerAnswerButton";

vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<ComposerAnswerButtonProps> = {}) {
  act(() => root.render(<ComposerAnswerButton kind="image" on={false} onToggle={() => {}} offReason={null} agent={null} {...props} />));
  return host.querySelector("button")!;
}

describe("ComposerAnswerButton", () => {
  it("names the answer it asks for in the More menu, and folds the menu once picked", () => {
    const onToggle = vi.fn();
    const onPick = vi.fn();
    const row = render({ variant: "row", onToggle, onPick });
    expect(row.textContent).toBe("Generate image");
    act(() => row.click());
    expect(onPick).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("checks the picked row in the menu and presses the picked button", () => {
    const row = render({ variant: "row", on: true });
    expect(row.textContent).toBe("Generate image");
    expect(row.querySelectorAll("svg")).toHaveLength(2);
    expect(render({ variant: "row" }).querySelectorAll("svg")).toHaveLength(1);
    expect(render({ on: true }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says why it can't be used instead of acting", () => {
    const onToggle = vi.fn();
    const row = render({ variant: "row", offReason: "Not available in SSH projects", onToggle });
    expect(row.textContent).toContain("Not available in SSH projects");
    expect(row.disabled).toBe(true);
    const button = render({ offReason: "Not available in SSH projects", onToggle });
    act(() => button.click());
    expect(onToggle).not.toHaveBeenCalled();
  });
});
