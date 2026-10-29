import { describe, expect, it } from "vitest";
import { parseAgentDialog, sameDialog } from "./agentDialog";
import { CLAUDE_ASK, CLAUDE_BASH, CLAUDE_WRITE, CODEX_COMMAND } from "./agentDialog.fixtures";

const COLS = 100;

describe("parseAgentDialog", () => {
  it("reads Claude Code's Bash permission prompt, a wrapped option label included", () => {
    expect(parseAgentDialog(CLAUDE_BASH, COLS)).toEqual({
      question: "Do you want to proceed?",
      details: ["Bash command", "Write test string to out.txt", "echo lpm-dialog-test > out.txt"],
      options: [
        { key: "1", label: "Yes", description: "", selected: true, typed: false },
        {
          key: "2",
          label:
            "Yes, and always allow access to /Users/dev/projects/acme-platform/services/billing-api/handlerbilling-api/handlers/stripe/webhooks/v2/inbound from this project",
          description: "",
          selected: false,
          typed: false,
        },
        {
          key: "3",
          label: "Yes, and switch to auto mode · auto mode handles these prompts for you",
          description: "",
          selected: false,
          typed: false,
        },
        { key: "4", label: "No", description: "", selected: false, typed: false },
      ],
    });
  });

  it("reads Claude Code's file prompt and drops the key hint from a label", () => {
    const dialog = parseAgentDialog(CLAUDE_WRITE, COLS)!;
    expect(dialog.question).toBe("Do you want to create notes.md?");
    expect(dialog.details).toEqual(["Create file", "notes.md", "1 hello"]);
    expect(dialog.options.map((o) => o.label)).toEqual([
      "Yes",
      "Yes, and switch to accept edits (auto-approve file edits and common file commands) for this session",
      "No",
    ]);
  });

  it("reads a question form, each option's description apart from its label", () => {
    const dialog = parseAgentDialog(CLAUDE_ASK, COLS)!;
    expect(dialog.question).toBe("Which color do you prefer?");
    expect(dialog.details).toEqual(["☐ Color"]);
    expect(dialog.options).toEqual([
      { key: "1", label: "Red", description: "Choose red", selected: true, typed: false },
      { key: "2", label: "Green", description: "Choose green", selected: false, typed: false },
      { key: "3", label: "Blue", description: "Choose blue", selected: false, typed: false },
      { key: "4", label: "Type something.", description: "", selected: false, typed: true },
      { key: "5", label: "Chat about this", description: "", selected: false, typed: true },
    ]);
  });

  it("reads Codex's command approval", () => {
    expect(parseAgentDialog(CODEX_COMMAND, COLS)).toEqual({
      question: "Would you like to run the following command?",
      details: [
        "Environment: local",
        "Reason: Allow the exact requested command to write out.txt?",
        "$ echo lpm-dialog-test > out.txt",
      ],
      options: [
        { key: "1", label: "Yes, proceed", description: "", selected: true, typed: false },
        {
          key: "2",
          label: "Yes, and don't ask again for commands that start with `echo lpm-dialog-test > out.txt`",
          description: "",
          selected: false,
          typed: false,
        },
        { key: "3", label: "No, and tell Codex what to do differently", description: "", selected: false, typed: false },
      ],
    });
  });

  it("finds nothing once the dialog is answered and the prompt is back", () => {
    const answered = [
      "⏺ Bash(echo lpm-dialog-test > out.txt)",
      "  ⎿  (No output)",
      "",
      "─".repeat(100),
      "❯ ",
      "─".repeat(100),
      "  ⏸ manual mode on · ? for shortcuts",
    ];
    expect(parseAgentDialog(answered, COLS)).toBeNull();
  });

  it("ignores a numbered list in the agent's reply, which has no selected row", () => {
    const reply = [
      "⏺ Two ways to do it:",
      "  1. Add an index",
      "  2. Cache the query",
      "",
      "✻ Brewed for 7s",
      "─".repeat(100),
      "❯ ",
      "─".repeat(100),
    ];
    expect(parseAgentDialog(reply, COLS)).toBeNull();
  });

  it("ignores options that skip a number or sit far above the bottom", () => {
    expect(parseAgentDialog(["Pick one?", "❯ 1. Yes", "  3. No"], COLS)).toBeNull();
    expect(parseAgentDialog(["Pick one?", "❯ 1. Yes", "  2. No", "a", "b", "c", "d"], COLS)).toBeNull();
  });
});

describe("sameDialog", () => {
  it("compares the question and choices", () => {
    const a = parseAgentDialog(CLAUDE_BASH, COLS);
    expect(sameDialog(a, parseAgentDialog(CLAUDE_BASH, COLS))).toBe(true);
    expect(sameDialog(a, parseAgentDialog(CLAUDE_WRITE, COLS))).toBe(false);
    expect(sameDialog(a, null)).toBe(false);
    expect(sameDialog(null, null)).toBe(true);
  });
});
