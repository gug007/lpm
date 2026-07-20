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
vi.mock("./AiRefineBar", () => ({ AiRefineBar: () => null }));

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
    expect(presets).toHaveLength(3);
    expect(container.textContent).not.toContain("Vibrant");
    expect(presets.every((button) => button.disabled)).toBe(true);
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
    await act(async () => customPresetButton().click());

    expect(commands.ApplyClaudeStatuslineCustom).toHaveBeenCalledWith(
      savedSpec,
    );
    expect(commands.ApplyClaudeStatuslineCustom).not.toHaveBeenCalledWith(
      presetSpec,
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
    await act(async () => presetButton("Usage & cost").click());

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
      presetButton("Usage & cost").click();
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
