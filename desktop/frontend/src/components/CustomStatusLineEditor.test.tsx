// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomStatusLineEditor } from "./CustomStatusLineEditor";
import type { CustomSpec } from "./statusLineTypes";

const baseSpec: CustomSpec = {
  segments: [
    { id: "folder", color: "cyan", text: "" },
    { id: "model", color: "yellow", text: "" },
  ],
  separator: "·",
  meterStyle: "percent",
  meterWidth: 7,
  icons: true,
  gitStatus: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderEditor(spec: CustomSpec, onChange = vi.fn()) {
  await act(async () => {
    root.render(
      <CustomStatusLineEditor
        spec={spec}
        onChange={onChange}
        disabled={false}
      />,
    );
  });
  return onChange;
}

describe("CustomStatusLineEditor", () => {
  it("opens the first item settings and lets another item be selected", async () => {
    await renderEditor(baseSpec);
    expect(container.textContent).toContain("Folder settings");
    const modelButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ].find((button) => button.textContent?.includes("Model"));
    expect(modelButton).toBeDefined();
    await act(async () => modelButton?.click());
    expect(container.textContent).toContain("Model settings");
  });

  it("updates and resets the selected item icon", async () => {
    const onChange = await renderEditor(baseSpec);
    const modelButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ].find((button) => button.textContent?.includes("Model"));
    await act(async () => modelButton?.click());

    const iconInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Model icon"]',
    );
    expect(iconInput).not.toBeNull();
    await act(async () => {
      if (!iconInput) return;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(iconInput, "🤖");
      iconInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseSpec,
      segments: [baseSpec.segments[0], { ...baseSpec.segments[1], icon: "🤖" }],
    });

    const overridden = {
      ...baseSpec,
      segments: [{ ...baseSpec.segments[0], icon: "⌂" }, baseSpec.segments[1]],
    };
    await renderEditor(overridden, onChange);
    const folderButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ].find((button) => button.textContent?.includes("Folder"));
    await act(async () => folderButton?.click());
    const resetButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Reset");
    await act(async () => resetButton?.click());
    expect(onChange).toHaveBeenLastCalledWith({
      ...overridden,
      segments: [
        { ...overridden.segments[0], icon: undefined },
        overridden.segments[1],
      ],
    });
  });

  it("appends a custom text item from the library", async () => {
    const onChange = await renderEditor(baseSpec);
    const addTextButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Add a label or symbol"));
    expect(addTextButton).toBeDefined();
    await act(async () => addTextButton?.click());
    expect(onChange).toHaveBeenCalledWith({
      ...baseSpec,
      segments: [
        ...baseSpec.segments,
        { id: "text", color: "default", text: "" },
      ],
    });
  });

  it("prevents removing the final item", async () => {
    await renderEditor({ ...baseSpec, segments: [baseSpec.segments[0]] });
    const removeButtons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Remove Folder"]',
      ),
    ];
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((button) => button.disabled)).toBe(true);
  });

  it("offers a one-step undo after randomizing", async () => {
    const onChange = await renderEditor(baseSpec);
    const matchingRandomizeButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Randomize");
    expect(matchingRandomizeButton).toBeDefined();
    await act(async () => matchingRandomizeButton?.click());
    const undoButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Undo");
    expect(undoButton).toBeDefined();
    await act(async () => undoButton?.click());
    expect(onChange).toHaveBeenLastCalledWith(baseSpec);
  });
});
