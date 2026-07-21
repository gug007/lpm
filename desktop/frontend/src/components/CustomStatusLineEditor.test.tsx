// @vitest-environment happy-dom
import { act, useState } from "react";
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

async function renderEditor(
  spec: CustomSpec,
  onChange = vi.fn(),
  disabled = false,
) {
  await act(async () => {
    root.render(
      <CustomStatusLineEditor
        spec={spec}
        onChange={onChange}
        disabled={disabled}
      />,
    );
  });
  return onChange;
}

function editButton(label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="Edit ${label}"]`,
  );
  if (!button) throw new Error(`Edit ${label} button not found`);
  return button;
}

function addItemButton(label: string): HTMLButtonElement {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
  ].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(`Add ${label} —`),
  );
  if (!button) throw new Error(`Add ${label} button not found`);
  return button;
}

function settingsDialog(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>('[role="dialog"]');
}

describe("CustomStatusLineEditor", () => {
  it("opens settings from each item's Edit button", async () => {
    await renderEditor(baseSpec);
    const folderEdit = editButton("Folder");
    const modelEdit = editButton("Model");

    expect(settingsDialog()).toBeNull();
    expect(folderEdit.getAttribute("aria-expanded")).toBe("false");
    expect(folderEdit.textContent?.trim()).toBe("");
    expect(folderEdit.getAttribute("aria-haspopup")).toBe("dialog");

    await act(async () => folderEdit.click());

    expect(settingsDialog()?.textContent).toContain("Folder settings");
    expect(folderEdit.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Folder icon",
    );

    await act(async () => modelEdit.click());

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(settingsDialog()?.textContent).toContain("Model settings");
    expect(folderEdit.getAttribute("aria-expanded")).toBe("false");
    expect(modelEdit.getAttribute("aria-expanded")).toBe("true");
  });

  it("updates and resets the selected item icon", async () => {
    const onChange = await renderEditor(baseSpec);
    await act(async () => editButton("Model").click());

    const iconInput = document.querySelector<HTMLInputElement>(
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
    await act(async () => editButton("Folder").click());
    const resetButton = [
      ...settingsDialog()!.querySelectorAll<HTMLButtonElement>("button"),
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
    const addTextButton = addItemButton("Custom text");
    expect(addTextButton.title).toBe("Your own label or symbol");
    await act(async () => addTextButton.click());
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
    const quickRemoveButtons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Remove Folder"]',
      ),
    ];
    expect(quickRemoveButtons).toHaveLength(1);
    expect(quickRemoveButtons[0].disabled).toBe(true);

    await act(async () => editButton("Folder").click());

    const removeButtons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Remove Folder"]',
      ),
    ];
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((button) => button.disabled)).toBe(true);
  });

  it("dismisses settings with Escape and restores Edit focus", async () => {
    await renderEditor(baseSpec);
    const folderEdit = editButton("Folder");
    await act(async () => folderEdit.click());
    const iconInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Folder icon"]',
    );
    iconInput?.focus();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(settingsDialog()).toBeNull();
    expect(document.activeElement).toBe(folderEdit);
  });

  it("dismisses settings when clicking outside", async () => {
    await renderEditor(baseSpec);
    await act(async () => editButton("Folder").click());
    expect(settingsDialog()).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });

    expect(settingsDialog()).toBeNull();
  });

  it("dismisses settings when its Edit button scrolls offscreen", async () => {
    await renderEditor(baseSpec);
    const folderEdit = editButton("Folder");
    const rect = vi.spyOn(folderEdit, "getBoundingClientRect");
    rect.mockReturnValue({
      x: 20,
      y: 100,
      top: 100,
      right: 100,
      bottom: 128,
      left: 20,
      width: 80,
      height: 28,
      toJSON: () => ({}),
    });
    await act(async () => folderEdit.click());
    expect(settingsDialog()).not.toBeNull();

    rect.mockReturnValue({
      x: 20,
      y: -80,
      top: -80,
      right: 100,
      bottom: -52,
      left: 20,
      width: 80,
      height: 28,
      toJSON: () => ({}),
    });
    await act(async () => window.dispatchEvent(new Event("scroll")));

    expect(settingsDialog()).toBeNull();
  });

  it("does not leave settings open for an offscreen Edit button", async () => {
    await renderEditor(baseSpec);
    const folderEdit = editButton("Folder");
    vi.spyOn(folderEdit, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: -80,
      top: -80,
      right: 100,
      bottom: -52,
      left: 20,
      width: 80,
      height: 28,
      toJSON: () => ({}),
    });

    await act(async () => folderEdit.click());

    expect(settingsDialog()).toBeNull();
    expect(folderEdit.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps Edit unavailable while the editor is disabled", async () => {
    await renderEditor(baseSpec, vi.fn(), true);
    const folderEdit = editButton("Folder");

    expect(folderEdit.disabled).toBe(true);
    await act(async () => folderEdit.click());
    expect(settingsDialog()).toBeNull();
  });

  it("offers a one-step undo after removing an item", async () => {
    const onChange = await renderEditor(baseSpec);
    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Folder"]',
    );
    expect(removeButton).not.toBeNull();
    await act(async () => removeButton?.click());
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseSpec,
      segments: [baseSpec.segments[1]],
    });
    const undoButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Undo");
    expect(undoButton).toBeDefined();
    await act(async () => undoButton?.click());
    expect(onChange).toHaveBeenLastCalledWith(baseSpec);
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

  it("opens settings after appending custom text", async () => {
    function StatefulEditor() {
      const [spec, setSpec] = useState(baseSpec);
      return (
        <CustomStatusLineEditor
          spec={spec}
          onChange={setSpec}
          disabled={false}
        />
      );
    }

    await act(async () => root.render(<StatefulEditor />));
    const addTextButton = addItemButton("Custom text");

    await act(async () => addTextButton.click());

    expect(settingsDialog()?.textContent).toContain("Custom text settings");
    const textInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="e.g. shipping mode"]',
    );
    expect(textInput).not.toBeNull();
    expect(document.activeElement).toBe(textInput);
  });
});
