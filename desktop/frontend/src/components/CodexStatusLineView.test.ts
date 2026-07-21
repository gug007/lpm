import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({
  GetCodexStatuslineState: vi.fn(),
  ApplyCodexStatusline: vi.fn(),
}));

import { codexStatuslineSelectionLabel } from "./CodexStatusLineView";
import {
  CODEX_STATUS_LINE_PRESETS,
  codexStatusLinePresetId,
} from "./CodexStatusLinePresetPicker";
import {
  CODEX_DEFAULT_STATUS_LINE,
  canonicalCodexStatusLineId,
  codexStatusLineOption,
} from "./codexStatusLineOptions";
import {
  codexStatusLineColor,
  codexStatusLineColorScheme,
  type CodexStatusLineAccent,
} from "./codexStatusLineColors";

describe("codexStatuslineSelectionLabel", () => {
  it("distinguishes the installed default from an explicit off state", () => {
    expect(
      codexStatuslineSelectionLabel(CODEX_DEFAULT_STATUS_LINE, false),
    ).toBe("Codex default");
    expect(codexStatuslineSelectionLabel([], true)).toBe("Off");
  });

  it("labels known presets and custom item counts", () => {
    const project = CODEX_STATUS_LINE_PRESETS.find(
      (preset) => preset.id === "project",
    );
    expect(project).toBeDefined();
    expect(codexStatuslineSelectionLabel(project?.items ?? [], true)).toBe(
      "Project",
    );
    expect(codexStatuslineSelectionLabel(["model"], true)).toBe("1 item");
    expect(
      codexStatuslineSelectionLabel(["model", "git-branch"], true),
    ).toBe("2 items");
  });
});

describe("codexStatusLinePresetId", () => {
  it("matches every preset by its exact ordered item list", () => {
    for (const preset of CODEX_STATUS_LINE_PRESETS) {
      expect(codexStatusLinePresetId([...preset.items])).toBe(preset.id);
    }
  });

  it("does not treat reordered or extended layouts as a preset", () => {
    expect(
      codexStatusLinePresetId([...CODEX_DEFAULT_STATUS_LINE].reverse()),
    ).toBeNull();
    expect(
      codexStatusLinePresetId([...CODEX_DEFAULT_STATUS_LINE, "git-branch"]),
    ).toBeNull();
  });
});

describe("Codex status line item compatibility", () => {
  it("canonicalizes every legacy Codex item alias", () => {
    expect(canonicalCodexStatusLineId("model-name")).toBe("model");
    expect(canonicalCodexStatusLineId("project")).toBe("project-name");
    expect(canonicalCodexStatusLineId("project-root")).toBe("project-name");
    expect(canonicalCodexStatusLineId("status")).toBe("run-state");
    expect(canonicalCodexStatusLineId("approval")).toBe("approval-mode");
    expect(canonicalCodexStatusLineId("context-usage")).toBe("context-used");
    expect(canonicalCodexStatusLineId("session-id")).toBe("thread-id");
  });

  it("preserves unknown item IDs without rendering them as literal values", () => {
    expect(canonicalCodexStatusLineId("future-field")).toBe("future-field");
    expect(codexStatusLineOption("future-field")).toMatchObject({
      id: "future-field",
      label: "future-field",
      preview: "",
    });
  });
});

describe("Codex status line colors", () => {
  it("maps every field to Codex's semantic accent", () => {
    const expected: Record<CodexStatusLineAccent, string[]> = {
      model: ["model", "model-with-reasoning", "reasoning"],
      path: ["current-dir", "project-name"],
      branch: ["git-branch", "pull-request-number", "branch-changes"],
      state: ["run-state"],
      usage: [
        "context-remaining",
        "context-used",
        "context-window-size",
        "used-tokens",
        "total-input-tokens",
        "total-output-tokens",
      ],
      limit: ["five-hour-limit", "weekly-limit"],
      metadata: ["codex-version", "thread-id"],
      mode: ["fast-mode", "raw-output", "permissions", "approval-mode"],
      thread: ["thread-title", "workspace-headline"],
      progress: ["task-progress"],
    };

    for (const [accent, itemIds] of Object.entries(expected)) {
      for (const itemId of itemIds) {
        expect(codexStatusLineOption(itemId).accent).toBe(accent);
      }
    }
  });

  it("matches Codex's softened Catppuccin Mocha status colors", () => {
    const expected: Record<CodexStatusLineAccent, string> = {
      model: "#f6e2b7",
      path: "#abdfa7",
      branch: "#8fb3ef",
      state: "#c8a9ee",
      usage: "#f2b590",
      limit: "#e990a9",
      metadata: "#9499ae",
      mode: "#c8a9ee",
      thread: "#9cded3",
      progress: "#f2b590",
    };

    for (const [accent, color] of Object.entries(expected)) {
      expect(
        codexStatusLineColor(accent as CodexStatusLineAccent, "dark"),
      ).toBe(color);
    }
  });

  it("chooses Codex's adaptive palette from the terminal background", () => {
    expect(codexStatusLineColorScheme("#2b2b2b")).toBe("dark");
    expect(codexStatusLineColorScheme("#fafafa")).toBe("light");
    expect(codexStatusLineColorScheme("var(--terminal-bg)")).toBe("dark");
  });
});
