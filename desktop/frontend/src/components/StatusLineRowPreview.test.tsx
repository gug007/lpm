// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  GetClaudeStatuslineState: vi.fn(),
  GetCodexStatuslineState: vi.fn(),
  PreviewClaudeStatusline: vi.fn(),
}));

vi.mock("../../bridge/commands", () => commands);
vi.mock("../hooks/useTerminalTheme", () => ({
  useTerminalTheme: () => ({ themeStyle: undefined }),
}));

const { StatusLineRowPreview } = await import("./StatusLineRowPreview");
const { notifyStatusLineChanged } = await import("./statusLineChanges");

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
  vi.clearAllMocks();
});

async function render(agent: "claude" | "codex") {
  await act(async () => {
    root.render(<StatusLineRowPreview agent={agent} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StatusLineRowPreview", () => {
  it("shows the Claude line for the saved Custom design", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "custom",
      hasCustom: true,
      custom: {
        segments: [
          { id: "folder", color: "default", text: "" },
          { id: "text", color: "default", text: " " },
        ],
        separator: "·",
        meterStyle: "bar",
        meterWidth: 7,
        icons: false,
        gitStatus: false,
      },
    });
    commands.PreviewClaudeStatusline.mockResolvedValue("my-project");

    await render("claude");

    expect(container.textContent).toContain("my-project");
    expect(commands.PreviewClaudeStatusline).toHaveBeenCalledWith({
      kind: "custom",
      spec: expect.objectContaining({
        segments: [{ id: "folder", color: "default", text: "" }],
      }),
    });
  });

  it("says when the Claude line is off without running a preview", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "current",
      hasCustom: false,
    });

    await render("claude");

    expect(container.textContent).toContain("Nothing shows under the prompt");
    expect(commands.PreviewClaudeStatusline).not.toHaveBeenCalled();
  });

  it("tells a failed preview apart from unreadable settings", async () => {
    commands.GetClaudeStatuslineState.mockResolvedValue({
      selected: "meters",
      hasCustom: true,
    });
    commands.PreviewClaudeStatusline.mockRejectedValue("preview failed");
    await render("claude");
    expect(container.textContent).toContain("Preview unavailable");

    await act(async () => root.unmount());
    root = createRoot(container);
    commands.GetCodexStatuslineState.mockRejectedValue("invalid Codex config");
    await render("codex");
    expect(container.textContent).toContain(
      "Couldn’t read your status line settings.",
    );
  });

  it("reloads when a status line change is saved", async () => {
    commands.GetCodexStatuslineState.mockResolvedValue({
      items: ["git-branch"],
      configured: true,
      useColors: true,
    });
    await render("codex");
    expect(container.textContent).toContain("feat/awesome-feature");

    commands.GetCodexStatuslineState.mockResolvedValue({
      items: [],
      configured: true,
      useColors: true,
    });
    await act(async () => {
      notifyStatusLineChanged("codex");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Nothing shows under the prompt");
  });

  it("draws the Codex items with their sample values", async () => {
    commands.GetCodexStatuslineState.mockResolvedValue({
      items: ["model-with-reasoning", "git-branch"],
      configured: true,
      useColors: true,
    });

    await render("codex");

    expect(container.textContent).toContain("gpt-5.2-codex medium");
    expect(container.textContent).toContain("feat/awesome-feature");
  });
});
