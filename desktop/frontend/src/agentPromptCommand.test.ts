import { describe, expect, it } from "vitest";
import { agentPromptCommand } from "./agentPromptCommand";

describe("agentPromptCommand", () => {
  it("leaves macOS and Linux launches as they were", () => {
    expect(agentPromptCommand("claude", "/init", false)).toBe("claude /init");
  });

  it("keeps Git Bash from rewriting a slash command on Windows", () => {
    expect(agentPromptCommand("claude", "/review the diff", true)).toBe(
      "MSYS2_ARG_CONV_EXCL=/review claude '/review the diff'",
    );
  });

  it("leaves plain prompts and paths alone on Windows", () => {
    expect(agentPromptCommand("claude", "fix the bug", true)).toBe("claude 'fix the bug'");
    expect(agentPromptCommand("claude", "/c/repo/notes.md", true)).toBe("claude /c/repo/notes.md");
  });
});
