// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomSpec } from "./statusLineTypes";

const commands = vi.hoisted(() => ({
  GetClaudeStatuslineState: vi.fn(),
  ApplyClaudeStatusline: vi.fn(),
  ApplyClaudeStatuslineCustom: vi.fn(),
  ClaudeStatuslinePresetSpec: vi.fn(),
  PreviewClaudeStatusline: vi.fn(),
}));

vi.mock("../../bridge/commands", () => commands);
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../hooks/useTerminalTheme", () => ({
  useTerminalTheme: () => ({ themeStyle: undefined }),
}));
vi.mock("../hooks/useTerminalFontSize", () => ({
  useTerminalFontSize: () => ({ fontSize: 12 }),
}));

const { ClaudeStatusLineView } = await import("./ClaudeStatusLineView");

const savedSpec: CustomSpec = {
  segments: [{ id: "folder", color: "cyan", text: "" }],
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
  commands.ApplyClaudeStatusline.mockResolvedValue(undefined);
  commands.ApplyClaudeStatuslineCustom.mockResolvedValue(undefined);
  commands.ClaudeStatuslinePresetSpec.mockResolvedValue(savedSpec);
  commands.PreviewClaudeStatusline.mockResolvedValue("");
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderView() {
  await act(async () => {
    root.render(<ClaudeStatusLineView onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function customPresetButton(): HTMLButtonElement {
  return presetButton("Custom");
}

function presetButton(label: string): HTMLButtonElement {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
  ].find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`${label} preset button not found`);
  return button;
}

function separatorInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Custom separator"]',
  );
  if (!input) throw new Error("Custom separator input not found");
  return input;
}

function typeSeparator(value: string) {
  const input = separatorInput();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ClaudeStatusLineView state safety", () => {
  it("keeps every preset disabled until the saved state is loaded", async () => {
    let resolveState!: (value: unknown) => void;
    commands.GetClaudeStatuslineState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );

    await renderView();
    const presets = [
      ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ];
    expect(presets).toHaveLength(5);
    expect(
      presets.some((button) => button.textContent?.includes("Minimalistic")),
    ).toBe(true);
    expect(
      presets.some((button) => button.textContent?.includes("Modern")),
    ).toBe(true);
    expect(
      presets.some((button) => button.textContent?.includes("Context")),
    ).toBe(false);
    expect(container.textContent).not.toContain("Vibrant");
    expect(presets.every((button) => button.disabled)).toBe(true);
    expect(container.textContent).toContain("Loading preview…");
    expect(container.textContent).not.toContain("Live");
    customPresetButton().click();
    expect(commands.ApplyClaudeStatuslineCustom).not.toHaveBeenCalled();

    await act(async () => {
      resolveState({
        selected: "current",
        hasCustom: true,
        custom: savedSpec,
        aiDescription: "",
      });
      await Promise.resolve();
    });

    expect(customPresetButton().disabled).toBe(false);
  });

  it("marks the preview unavailable when preview generation fails", async () => {
    vi.useFakeTimers();
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "current",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.PreviewClaudeStatusline.mockRejectedValue(
      new Error("preview failed"),
    );

    await renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain("Preview unavailable");
    expect(container.textContent).not.toContain(
      "Changes sync automatically to Claude Code.",
    );
  });

  it("restores the saved custom design after previewing another preset", async () => {
    const presetSpec: CustomSpec = {
      ...savedSpec,
      separator: "preset",
      segments: [{ id: "model", color: "yellow", text: "" }],
    };
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "vibrant",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue(presetSpec);

    await renderView();
    await act(async () => {
      await Promise.resolve();
    });
    expect(presetButton("Modern").getAttribute("aria-checked")).toBe("true");
    await act(async () => customPresetButton().click());

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenCalledWith(
      savedSpec,
    );
    expect(commands.ApplyClaudeStatuslineCustom).not.toHaveBeenCalledWith(
      presetSpec,
    );
  });

  it("applies the Modern preset using the stable vibrant template id", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue({
      ...savedSpec,
      separator: "modern",
    });

    await renderView();
    await act(async () => {
      presetButton("Modern").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatusline).toHaveBeenCalledWith("vibrant");
    expect(commands.ClaudeStatuslinePresetSpec).toHaveBeenCalledWith("vibrant");
    expect(separatorInput().value).toBe("modern");
  });

  it("keeps a previously selected Minimalistic preset editable", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "minimal",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue({
      ...savedSpec,
      separator: "~",
    });

    await renderView();
    await act(async () => {
      await Promise.resolve();
    });

    expect(commands.ClaudeStatuslinePresetSpec).toHaveBeenCalledWith("minimal");
    expect(separatorInput().value).toBe("~");
    expect(presetButton("Clean")).toBeTruthy();
    expect(presetButton("Minimalistic").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(customPresetButton().getAttribute("aria-checked")).toBe("false");

    await act(async () => customPresetButton().click());

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenCalledWith(
      savedSpec,
    );
  });

  it("keeps preset customization disabled until its editor spec loads", async () => {
    let resolvePreset!: (value: CustomSpec) => void;
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockReturnValue(
      new Promise((resolve) => {
        resolvePreset = resolve;
      }),
    );

    await renderView();
    await act(async () => presetButton("Clean").click());

    const randomize = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Randomize"),
    );
    expect(randomize?.disabled).toBe(true);

    await act(async () => {
      resolvePreset({ ...savedSpec, separator: "~" });
      await Promise.resolve();
    });

    expect(randomize?.disabled).toBe(false);
    expect(separatorInput().value).toBe("~");
  });

  it("does not refresh stale state between a preset change and a custom edit", async () => {
    vi.useFakeTimers();
    let resolvePresetApply!: () => void;
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ApplyClaudeStatusline.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePresetApply = resolve;
      }),
    );

    await renderView();
    await act(async () => {
      presetButton("Clean").click();
      await Promise.resolve();
    });

    await act(async () => {
      const input = separatorInput();
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "|");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      resolvePresetApply();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commands.GetClaudeStatuslineState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenCalledWith({
      ...savedSpec,
      separator: "|",
    });
    expect(commands.GetClaudeStatuslineState).toHaveBeenCalledTimes(2);
  });

  it("finishes the last change after leaving the status-line screen", async () => {
    let resolvePresetApply!: () => void;
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ApplyClaudeStatusline.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePresetApply = resolve;
      }),
    );

    await renderView();
    await act(async () => {
      presetButton("Clean").click();
      presetButton("Modern").click();
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatusline).toHaveBeenCalledTimes(1);
    expect(commands.ApplyClaudeStatusline).toHaveBeenCalledWith("meters");

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      resolvePresetApply();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatusline).toHaveBeenCalledTimes(2);
    expect(commands.ApplyClaudeStatusline).toHaveBeenLastCalledWith("vibrant");
  });

  it("saves a pending item edit when leaving right after it", async () => {
    vi.useFakeTimers();
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });

    await renderView();
    await act(async () => {
      typeSeparator("|");
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenCalledWith({
      ...savedSpec,
      separator: "|",
    });
  });

  it("warns before a layout edit replaces the saved Custom line and can undo it", async () => {
    vi.useFakeTimers();
    commands.GetClaudeStatuslineState.mockResolvedValueOnce({
      selected: "meters",
      hasCustom: true,
      custom: savedSpec,
      hasSavedCustom: true,
      aiDescription: "",
    });
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: { ...savedSpec, separator: "|" },
      hasSavedCustom: true,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue({
      ...savedSpec,
      separator: "~",
    });

    await renderView();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Changing an item turns Clean into your Custom line",
    );

    await act(async () => {
      typeSeparator("|");
    });
    expect(container.textContent).toContain(
      "Now editing your Custom line, made from Clean",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
      await Promise.resolve();
    });

    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "meters",
      hasCustom: true,
      custom: savedSpec,
      hasSavedCustom: true,
      aiDescription: "",
    });
    const restore = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Restore my Custom line",
    );
    await act(async () => {
      restore?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenLastCalledWith(
      savedSpec,
    );
    expect(commands.ApplyClaudeStatusline).toHaveBeenLastCalledWith("meters");
    expect(presetButton("Clean").getAttribute("aria-checked")).toBe("true");
  });

  it("doesn't warn about replacing a Custom line that was never saved", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "meters",
      hasCustom: true,
      custom: savedSpec,
      hasSavedCustom: false,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue({
      ...savedSpec,
      separator: "~",
    });

    await renderView();
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("into your Custom line");
  });

  it("ignores a click on the layout that is already selected", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });

    await renderView();
    await act(async () => customPresetButton().click());

    expect(commands.ApplyClaudeStatuslineCustom).not.toHaveBeenCalled();
  });

  it("shows each layout's real line on its card", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.PreviewClaudeStatusline.mockImplementation(
      async (selection: { kind: string; id?: string }) =>
        selection.kind === "template" ? `line for ${selection.id}` : "",
    );

    await renderView();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(presetButton("Clean").textContent).toContain("line for meters");
    expect(presetButton("Modern").textContent).toContain("line for vibrant");
  });

  it("points at the item that needs fixing", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: {
        ...savedSpec,
        segments: [{ id: "folder", color: "cyan", text: "", label: " repo" }],
      },
      aiDescription: "",
    });

    await renderView();
    const alert = [...container.querySelectorAll('[role="alert"]')].find(
      (element) => element.textContent?.includes("Folder:"),
    );
    expect(alert?.textContent).toContain("Remove spaces around the label.");
    expect(container.querySelector('[data-invalid="true"]')).not.toBeNull();
  });

  it("restores the saved custom design when applying a preset fails", async () => {
    let rejectApply!: (reason: Error) => void;
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: savedSpec,
      aiDescription: "",
    });
    commands.ClaudeStatuslinePresetSpec.mockResolvedValue({
      ...savedSpec,
      separator: "~",
    });
    commands.ApplyClaudeStatusline.mockReturnValue(
      new Promise((_, reject) => {
        rejectApply = reject;
      }),
    );

    await renderView();
    await act(async () => {
      presetButton("Clean").click();
      await Promise.resolve();
    });
    expect(separatorInput().value).toBe("~");

    await act(async () => {
      rejectApply(new Error("apply failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(customPresetButton().getAttribute("aria-checked")).toBe("true");
    expect(separatorInput().value).toBe("·");
  });
});
