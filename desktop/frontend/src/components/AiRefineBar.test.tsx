// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  run: vi.fn(),
  onGenerated: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  GenerateClaudeStatusline: mocks.generate,
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
}));
vi.mock("../hooks/useAIPicker", () => ({
  useAIPicker: () => ({
    aiCLIs: { claude: true },
    anyAvailable: true,
    selectedCLI: "claude",
    selectedModel: "sonnet",
    selectedEffort: "high",
    selectedFast: true,
    selectAI: vi.fn(),
    selectEffort: vi.fn(),
    selectFast: vi.fn(),
  }),
}));
vi.mock("../hooks/useAIGeneration", () => ({
  useAIGeneration: () => ({
    generating: false,
    run: mocks.run,
    cancel: vi.fn(),
  }),
  isCanceledError: () => false,
}));
vi.mock("../types", () => ({
  aiEffectiveFast: () => true,
}));
vi.mock("./ui/AIPickerButton", () => ({
  AIPickerButton: ({
    onGenerate,
    label,
  }: {
    onGenerate: () => void;
    label: string;
  }) => <button onClick={onGenerate}>{label}</button>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { AiRefineBar } = await import("./AiRefineBar");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.generate.mockResolvedValue(undefined);
  mocks.run.mockImplementation(
    (task: (generationId: string) => Promise<unknown>) => task("generation-1"),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderBar() {
  await act(async () => {
    root.render(
      <AiRefineBar
        selection={{ kind: "custom" }}
        initialDescription=""
        disabled={false}
        onGenerated={mocks.onGenerated}
      />,
    );
  });
}

describe("AiRefineBar", () => {
  it("shows a compact multiline prompt without suggestion options", async () => {
    await renderBar();

    const textarea = container.querySelector("textarea");
    expect(textarea?.getAttribute("rows")).toBe("2");
    expect(container.textContent).toContain("⌘ Enter to refine");
    expect(container.textContent).not.toContain("Add Git info");
    expect(container.textContent).not.toContain("Make it compact");
    expect(container.textContent).not.toContain("Claude orange");
  });

  it("keeps Enter for new lines and submits with Command-Enter", async () => {
    await renderBar();
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) throw new Error("AI prompt textarea not found");

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setValue?.call(textarea, "  Add Git\nstatus  ");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(mocks.generate).not.toHaveBeenCalled();

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
        }),
      );
      await Promise.resolve();
    });

    expect(mocks.generate).toHaveBeenCalledWith(
      "claude",
      "sonnet",
      "high",
      true,
      { kind: "custom" },
      "Add Git\nstatus",
      "generation-1",
    );
    expect(mocks.onGenerated).toHaveBeenCalledOnce();
  });
});
