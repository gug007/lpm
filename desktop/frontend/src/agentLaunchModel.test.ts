import { describe, expect, it } from "vitest";
import { pinLaunchCommand } from "./agentLaunchModel";

describe("pinLaunchCommand", () => {
  it("pins Claude's model and level right after its name", () => {
    expect(
      pinLaunchCommand("claude --permission-mode auto", { model: "fable", effort: "xhigh" }),
    ).toBe("claude --model fable --effort xhigh --permission-mode auto");
  });

  it("replaces flags already on the command", () => {
    expect(
      pinLaunchCommand("claude --model opus --effort=low --permission-mode auto", {
        model: "fable",
        effort: "max",
      }),
    ).toBe("claude --model fable --effort max --permission-mode auto");
  });

  it("leaves a half the pick doesn't set alone", () => {
    expect(pinLaunchCommand("claude --effort high", { model: "sonnet", effort: "" })).toBe(
      "claude --model sonnet --effort high",
    );
  });

  it("uses Codex's own flags", () => {
    expect(
      pinLaunchCommand("codex -m gpt-5.5 -c model_reasoning_effort=low --yolo", {
        model: "gpt-6-astra",
        effort: "ultra",
      }),
    ).toBe("codex -m gpt-6-astra -c model_reasoning_effort=ultra --yolo");
  });

  it("finds a path-qualified CLI after other commands", () => {
    expect(
      pinLaunchCommand("cd web && /usr/local/bin/claude", { model: "opus", effort: "" }),
    ).toBe("cd web && /usr/local/bin/claude --model opus");
  });

  it("returns a command that doesn't run the CLI unchanged", () => {
    expect(pinLaunchCommand("npm run dev", { model: "opus", effort: "" })).toBe("npm run dev");
  });

  it("returns the command unchanged without a pick", () => {
    expect(pinLaunchCommand("claude --model opus", undefined)).toBe("claude --model opus");
  });

  it("returns the command unchanged for an empty pick", () => {
    expect(pinLaunchCommand("claude --model opus", { model: "", effort: "" })).toBe(
      "claude --model opus",
    );
  });
});
