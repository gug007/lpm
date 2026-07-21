import { describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({
  GetClaudeStatuslineState: vi.fn(),
  ApplyClaudeStatusline: vi.fn(),
  ApplyClaudeStatuslineCustom: vi.fn(),
  ClaudeStatuslinePresetSpec: vi.fn(),
  PreviewClaudeStatusline: vi.fn(),
  GenerateClaudeStatusline: vi.fn(),
  CancelAIGenerate: vi.fn(),
  CheckAICLIs: vi.fn(),
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));

import {
  statuslineCustomBaseSpec,
  statuslineShowsEditor,
  statuslineSelectionLabel,
} from "./ClaudeStatusLineView";
import type { CustomSpec } from "./statusLineTypes";

describe("statuslineShowsEditor", () => {
  it("shows the editor for every spec-backed selection", () => {
    expect(statuslineShowsEditor("vibrant")).toBe(true);
    expect(statuslineShowsEditor("minimal")).toBe(true);
    expect(statuslineShowsEditor("context")).toBe(true);
    expect(statuslineShowsEditor("meters")).toBe(true);
    expect(statuslineShowsEditor("custom")).toBe(true);
  });

  it("hides the editor for selections with no spec", () => {
    expect(statuslineShowsEditor("current")).toBe(false);
    expect(statuslineShowsEditor("ai")).toBe(false);
    expect(statuslineShowsEditor("bogus")).toBe(false);
  });
});

describe("statuslineSelectionLabel", () => {
  it("reads Off only when the untouched current line has no saved custom", () => {
    expect(statuslineSelectionLabel("current", false)).toBe("Off");
    expect(statuslineSelectionLabel("current", true)).toBe("My status line");
  });

  it("labels known selections and falls back to the current label", () => {
    expect(statuslineSelectionLabel("vibrant", false)).toBe("Custom");
    expect(statuslineSelectionLabel("minimal", false)).toBe("Minimal");
    expect(statuslineSelectionLabel("context", false)).toBe("Context");
    expect(statuslineSelectionLabel("meters", false)).toBe("Usage & cost");
    expect(statuslineSelectionLabel("nope", false)).toBe("My status line");
  });
});

describe("statuslineCustomBaseSpec", () => {
  const editorSpec = { separator: "editor" } as CustomSpec;
  const savedSpec = { separator: "saved" } as CustomSpec;

  it("restores the saved custom design when leaving a preset", () => {
    expect(statuslineCustomBaseSpec("vibrant", editorSpec, savedSpec)).toBe(
      savedSpec,
    );
    expect(statuslineCustomBaseSpec("meters", editorSpec, savedSpec)).toBe(
      savedSpec,
    );
  });

  it("keeps the active editor design while already customizing", () => {
    expect(statuslineCustomBaseSpec("custom", editorSpec, savedSpec)).toBe(
      editorSpec,
    );
  });
});
