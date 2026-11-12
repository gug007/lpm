import { describe, expect, it } from "vitest";
import { actionFailurePrompt } from "./actionFailurePrompt";

describe("actionFailurePrompt", () => {
  it("names the action and its command, the exit status, and the output's end", () => {
    expect(
      actionFailurePrompt({
        label: "Migrate",
        cmd: "npm run migrate",
        error: "exit status 1: relation already exists",
        lines: ["\x1b[31mError: relation \"users\" already exists\x1b[0m", "", ""],
      }),
    ).toBe(
      [
        "Running `Migrate` (`npm run migrate`) in this project failed with exit status 1. Its last output:",
        "",
        "```",
        'Error: relation "users" already exists',
        "```",
        "",
        "Find the cause and fix it.",
      ].join("\n"),
    );
  });

  it("names a command run once and keeps the whole error when nothing was printed", () => {
    expect(actionFailurePrompt({ label: "make test", cmd: "make test", error: "signal: 9", lines: [] })).toBe(
      "Running `make test` in this project failed with signal: 9, without printing anything. Find the cause and fix it.",
    );
  });
});
