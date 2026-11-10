import { describe, expect, it } from "vitest";
import { commandName, tabCommandDetails, tabCommandMark, terminalStripLabel } from "./tabCommand";
import type { TerminalInstance } from "./paneTree";
import type { TerminalCommandState } from "./store/terminalCommands";

const shell: TerminalInstance = { id: "t1", label: "Terminal 1" };
const running = (command: string, named = true): TerminalCommandState => ({
  running: { command, since: 0, named },
});
const ended = (command: string, code: number, ms: number): TerminalCommandState => ({
  last: { command, code, ms, at: ms },
});

describe("commandName", () => {
  it("keeps the program and what it's asked to do", () => {
    expect(commandName("pnpm test")).toBe("pnpm test");
    expect(commandName("npm run dev")).toBe("npm run dev");
    expect(commandName("docker compose up -d")).toBe("docker compose up");
  });

  it("leaves out env assignments, flags and what follows them", () => {
    expect(commandName("NODE_ENV=production pnpm build")).toBe("pnpm build");
    expect(commandName("IS_SANDBOX=1 claude --dangerously-skip-permissions")).toBe("claude");
    expect(commandName("curl -H 'Authorization: Bearer abc' https://x")).toBe("curl");
    expect(commandName("git commit -m 'wip'")).toBe("git commit");
  });

  it("stops at pipes and keeps names short", () => {
    expect(commandName("cat log.txt | grep error")).toBe("cat log.txt");
    expect(commandName("./scripts/deploy.sh production")).toBe("deploy.sh production");
    expect(commandName("python manage.py runserver")).toBe("python manage.py");
    expect(commandName("a-very-long-program-name-indeed")).toBe("a-very-long-program-nam…");
  });

  it("names nothing for an empty or unnamed line", () => {
    expect(commandName("")).toBe("");
    expect(commandName("FOO=1")).toBe("");
  });
});

describe("terminalStripLabel", () => {
  it("names a shell after a command that has run a moment", () => {
    expect(terminalStripLabel(shell, running("pnpm test"))).toBe("pnpm test");
    expect(terminalStripLabel(shell, running("pnpm test", false))).toBe("Terminal 1");
    expect(terminalStripLabel(shell, ended("pnpm test", 0, 5000))).toBe("Terminal 1");
  });

  it("keeps names that say more than the command", () => {
    expect(terminalStripLabel({ ...shell, label: "server", sessionTitleSource: "manual" }, running("pnpm dev"))).toBe(
      "server",
    );
    expect(terminalStripLabel({ ...shell, label: "Run Tests", actionName: "test" }, running("pnpm test"))).toBe(
      "Run Tests",
    );
    expect(terminalStripLabel(shell, running("claude --resume abc"))).toBe("Terminal 1");
  });
});

describe("tabCommandMark", () => {
  it("shows a command running, then how it ended", () => {
    expect(tabCommandMark(shell, running("pnpm test"))).toBe("running");
    expect(tabCommandMark(shell, ended("pnpm test", 0, 5000))).toBe("passed");
    expect(tabCommandMark(shell, ended("pnpm lint", 1, 3000))).toBe("failed");
  });

  it("stays quiet for quick commands, Ctrl-C and agents", () => {
    expect(tabCommandMark(shell, ended("ls", 0, 40))).toBeNull();
    expect(tabCommandMark(shell, ended("pnpm dev", 130, 60_000))).toBeNull();
    expect(tabCommandMark(shell, running("codex"))).toBeNull();
    expect(tabCommandMark({ ...shell, startCmd: "claude" }, ended("make", 2, 9000))).toBeNull();
  });

  it("marks an action's own command too", () => {
    expect(tabCommandMark({ ...shell, actionName: "test", startCmd: "pnpm test" }, ended("pnpm test", 1, 4000))).toBe(
      "failed",
    );
  });

  it("gives the hover card the command behind the mark", () => {
    expect(tabCommandDetails(shell, ended("ls", 0, 40))).toBeUndefined();
    expect(tabCommandDetails(shell, ended("pnpm lint", 1, 3000))?.last?.command).toBe("pnpm lint");
  });
});
