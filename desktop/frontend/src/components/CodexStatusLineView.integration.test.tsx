// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  GetCodexStatuslineState: vi.fn(),
  ApplyCodexStatusline: vi.fn(),
}));

vi.mock("../../bridge/commands", () => commands);
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../hooks/useTerminalTheme", () => ({
  useTerminalTheme: () => ({ themeStyle: undefined }),
}));
vi.mock("../hooks/useTerminalFontSize", () => ({
  useTerminalFontSize: () => ({ fontSize: 12 }),
}));

const { CodexStatusLineView } = await import("./CodexStatusLineView");

const defaultState = {
  items: ["model-with-reasoning", "current-dir"],
  configured: false,
  useColors: true,
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
  commands.ApplyCodexStatusline.mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderView() {
  await act(async () => {
    root.render(<CodexStatusLineView onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function presetButton(label: string): HTMLButtonElement {
  const labelElement = [
    ...container.querySelectorAll<HTMLSpanElement>(
      'button[role="radio"] span',
    ),
  ].find((candidate) => candidate.textContent === label);
  const button = labelElement?.closest<HTMLButtonElement>(
    'button[role="radio"]',
  );
  if (!button) throw new Error(`${label} preset button not found`);
  return button;
}

function colorToggle(): HTMLButtonElement {
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[role="switch"]',
  );
  if (!toggle) throw new Error("Use theme colors toggle not found");
  return toggle;
}

describe("CodexStatusLineView", () => {
  it("keeps editing disabled until the saved configuration loads", async () => {
    let resolveState!: (value: unknown) => void;
    commands.GetCodexStatuslineState.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );

    await renderView();

    const presets = [
      ...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ];
    expect(presets).toHaveLength(5);
    expect(presets.every((button) => button.disabled)).toBe(true);
    expect(colorToggle().disabled).toBe(true);
    expect(container.textContent).toContain("Loading preview…");

    await act(async () => {
      resolveState({
        items: ["project-name", "future-field"],
        configured: true,
        useColors: false,
      });
      await Promise.resolve();
    });

    expect(presetButton("Project").disabled).toBe(false);
    expect(colorToggle().disabled).toBe(false);
    expect(colorToggle().getAttribute("aria-checked")).toBe("false");
    expect(
      container.querySelector('button[aria-label="Move future-field"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Saved to config.toml");
  });

  it("debounces a preset selection and saves its ordered fields", async () => {
    vi.useFakeTimers();
    commands.GetCodexStatuslineState.mockResolvedValue(defaultState);

    await renderView();
    await act(async () => presetButton("Project").click());

    expect(container.textContent).toContain("Saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(259);
    });
    expect(commands.ApplyCodexStatusline).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(commands.ApplyCodexStatusline).toHaveBeenCalledOnce();
    expect(commands.ApplyCodexStatusline).toHaveBeenCalledWith(
      [
        "project-name",
        "git-branch",
        "branch-changes",
        "context-remaining",
      ],
      true,
    );
    expect(container.textContent).toContain("Saved to config.toml");
  });

  it("only saves the latest change made during the debounce window", async () => {
    vi.useFakeTimers();
    commands.GetCodexStatuslineState.mockResolvedValue(defaultState);

    await renderView();
    await act(async () => presetButton("Project").click());
    await act(async () => presetButton("Usage").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
      await Promise.resolve();
    });

    expect(commands.ApplyCodexStatusline).toHaveBeenCalledOnce();
    expect(commands.ApplyCodexStatusline).toHaveBeenCalledWith(
      [
        "model-with-reasoning",
        "context-remaining",
        "five-hour-limit",
        "weekly-limit",
        "fast-mode",
      ],
      true,
    );
  });

  it("flushes the latest pending change when leaving the editor", async () => {
    vi.useFakeTimers();
    commands.GetCodexStatuslineState.mockResolvedValue(defaultState);

    await renderView();
    await act(async () => presetButton("Project").click());
    await act(async () => {
      root.render(<div />);
      await Promise.resolve();
    });

    expect(commands.ApplyCodexStatusline).toHaveBeenCalledOnce();
    expect(commands.ApplyCodexStatusline).toHaveBeenCalledWith(
      [
        "project-name",
        "git-branch",
        "branch-changes",
        "context-remaining",
      ],
      true,
    );
  });

  it("saves the color preference with the current item order", async () => {
    vi.useFakeTimers();
    commands.GetCodexStatuslineState.mockResolvedValue({
      ...defaultState,
      configured: true,
    });

    await renderView();
    await act(async () => colorToggle().click());
    expect(colorToggle().getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
      await Promise.resolve();
    });

    expect(commands.ApplyCodexStatusline).toHaveBeenCalledWith(
      defaultState.items,
      false,
    );
  });

  it("keeps the local preview and reports an apply failure", async () => {
    vi.useFakeTimers();
    commands.GetCodexStatuslineState.mockResolvedValue(defaultState);
    commands.ApplyCodexStatusline.mockRejectedValue(new Error("write failed"));

    await renderView();
    await act(async () => presetButton("Off").click());
    expect(container.textContent).toContain("Status line hidden");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Couldn’t save this change");
    expect(container.textContent).toContain("Preview only");
    expect(container.textContent).toContain("Status line hidden");
  });
});
