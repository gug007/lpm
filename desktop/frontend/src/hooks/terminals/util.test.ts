import { describe, expect, it } from "vitest";
import { configLaunchCmds } from "./util";

describe("configLaunchCmds", () => {
  it("keeps both commands for a resumable launch", () => {
    expect(
      configLaunchCmds({
        startCmd: "claude --session-id abc",
        resumeCmd: "claude --resume abc",
      }),
    ).toEqual({ startCmd: "claude --session-id abc", resumeCmd: "claude --resume abc" });
  });

  it("keeps an agent's startCmd before it has a resume command", () => {
    // Codex only learns its session id after launch; without the startCmd the
    // composer can't tell the tab runs Codex and offers no slash commands.
    expect(
      configLaunchCmds({ startCmd: `codex -c 'model_reasoning_effort="ultra"'`, resumeCmd: "" }),
    ).toEqual({ startCmd: `codex -c 'model_reasoning_effort="ultra"'` });
    expect(configLaunchCmds({ startCmd: "CODEX_HOME=/tmp/w codex", resumeCmd: "" })).toEqual({
      startCmd: "CODEX_HOME=/tmp/w codex",
    });
  });

  it("keeps nothing for other commands, so a restart doesn't re-run them", () => {
    expect(configLaunchCmds({ startCmd: "npm run dev", resumeCmd: "" })).toEqual({});
    expect(configLaunchCmds({ startCmd: "", resumeCmd: "" })).toEqual({});
  });
});
