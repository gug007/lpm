// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusLinePresetPicker } from "./StatusLinePresetPicker";

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

async function renderPicker(
  selected: Parameters<typeof StatusLinePresetPicker>[0]["selected"],
  onSelect = vi.fn(),
) {
  await act(async () => {
    root.render(
      <StatusLinePresetPicker
        selected={selected}
        hasCustom
        disabled={false}
        onSelect={onSelect}
      />,
    );
  });
  return onSelect;
}

describe("StatusLinePresetPicker", () => {
  it("supports arrow-key selection across the visible choices", async () => {
    const onSelect = await renderPicker("current");
    const presets = [
      ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ];

    presets[0].focus();
    await act(async () => {
      presets[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(onSelect).toHaveBeenCalledWith("meters");
    expect(document.activeElement).toBe(presets[1]);
  });

  it("maps the visible preset names to their stable template ids", async () => {
    const onSelect = await renderPicker("minimal");
    const presets = [
      ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ];
    const preset = (label: string) =>
      presets.find((button) => button.textContent?.includes(label));

    expect(presets).toHaveLength(5);
    expect(preset("Minimalistic")?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      preset("Clean")?.click();
      preset("Minimalistic")?.click();
      preset("Modern")?.click();
    });

    expect(onSelect).toHaveBeenNthCalledWith(1, "meters");
    expect(onSelect).toHaveBeenNthCalledWith(2, "minimal");
    expect(onSelect).toHaveBeenNthCalledWith(3, "vibrant");
    expect(preset("Modern")?.textContent).toContain("📁");
    expect(preset("Modern")?.textContent).toContain("✳️");
    expect(preset("Modern")?.textContent).toContain("💰");
    for (const label of ["Clean", "Minimalistic", "Modern"]) {
      expect(preset(label)?.textContent).toContain("$4.20");
    }
  });

  it("keeps the hidden legacy Context layout distinct", async () => {
    await renderPicker("context");
    const presets = [
      ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ];

    expect(
      presets.every((preset) => preset.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    expect(presets[0].tabIndex).toBe(0);
  });
});
