import { describe, expect, it } from "vitest";
import { isShellAtPrompt } from "./shellCommand";

describe("isShellAtPrompt", () => {
  it("tells a shell at its prompt from a running program", () => {
    expect(isShellAtPrompt("-zsh")).toBe(true);
    expect(isShellAtPrompt("login")).toBe(true);
    expect(isShellAtPrompt("/bin/bash -l")).toBe(true);
    expect(isShellAtPrompt("C:\\Program Files\\Git\\usr\\bin\\bash.exe --login -i")).toBe(true);
    expect(isShellAtPrompt("vim notes.md")).toBe(false);
    expect(isShellAtPrompt("node /usr/local/bin/claude")).toBe(false);
    expect(isShellAtPrompt("")).toBe(false);
  });
});
