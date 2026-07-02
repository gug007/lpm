import { describe, expect, it } from "vitest";
import { buildGeneratorRunCommand } from "./generatorRun";

describe("buildGeneratorRunCommand", () => {
  it("runs the raw command for a command generator", () => {
    const out = buildGeneratorRunCommand(
      { type: "command", command: "npm create vite@latest ." },
      "claude",
    );
    expect(out).toEqual({ label: "Setup", cmd: "npm create vite@latest ." });
  });

  it("launches the selected CLI with the quoted prompt for an ai generator", () => {
    const out = buildGeneratorRunCommand({ type: "ai", cli: "codex", prompt: "build me an app" }, "claude");
    expect(out).toEqual({ label: "Agent", cmd: "codex 'build me an app'" });
  });

  it("falls back to the default CLI when the generator has none", () => {
    const out = buildGeneratorRunCommand({ type: "ai", prompt: "hi" }, "gemini");
    expect(out.cmd).toBe("gemini hi");
  });

  it("launches the bare CLI when the prompt is empty", () => {
    const out = buildGeneratorRunCommand({ type: "ai", cli: "claude", prompt: "  " }, "claude");
    expect(out.cmd).toBe("claude");
  });
});
