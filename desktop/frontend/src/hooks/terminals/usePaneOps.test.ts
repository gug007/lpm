import { describe, expect, it } from "vitest";
import {
  applyManualTerminalRename,
  makeTerminal,
  terminalDisplayLabel,
} from "../../paneTree";

describe("applyManualTerminalRename", () => {
  it("protects a rename made before an agent SessionStart arrives", () => {
    const renamed = applyManualTerminalRename(
      makeTerminal("t1", "Claude", { startCmd: "claude" }),
      "Auth refactor",
    );

    expect(renamed).toMatchObject({
      label: "Auth refactor",
      sessionTitleSource: "manual",
    });
    expect(renamed.sessionTitle).toBeUndefined();
    expect(renamed.sessionTitleId).toBeUndefined();
    expect(terminalDisplayLabel(renamed)).toBe("Auth refactor");
  });

  it("clears an existing vendor title and preserves an unedited emoji", () => {
    const renamed = applyManualTerminalRename(
      makeTerminal("t1", "Claude", {
        sessionTitle: "Vendor title",
        sessionTitleId: "session-1",
        sessionTitleSource: "vendor",
        emoji: "🧠",
      }),
      "My title",
    );

    expect(renamed).toMatchObject({
      label: "My title",
      emoji: "🧠",
      sessionTitleSource: "manual",
    });
    expect(renamed.sessionTitle).toBeUndefined();
    expect(renamed.sessionTitleId).toBeUndefined();
  });

  it("can clear the emoji while recording the manual title override", () => {
    const renamed = applyManualTerminalRename(
      makeTerminal("t1", "Claude", { emoji: "🧠" }),
      "My title",
      "",
    );
    expect(renamed.emoji).toBeUndefined();
    expect(renamed.sessionTitleSource).toBe("manual");
  });
});
