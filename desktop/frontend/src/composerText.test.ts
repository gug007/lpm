import { describe, expect, it } from "vitest";
import { composerAgentName, composerPlaceholder } from "./composerText";

describe("composerPlaceholder", () => {
  it("asks the agent before its first prompt and replies to it after", () => {
    expect(composerPlaceholder({ label: "Claude", agent: "Claude" })).toBe("Ask Claude…");
    expect(
      composerPlaceholder({ label: "Add a search box that filters the product list", agent: "Codex", started: true }),
    ).toBe("Reply to Codex…");
  });

  it("says a shell tab runs the line as a command", () => {
    expect(composerPlaceholder({ label: "Terminal 2", agent: null })).toBe("Run a command in Terminal 2…");
  });

  it("says the next prompt comes back as a video or an image", () => {
    expect(composerPlaceholder({ label: "Claude", agent: "Claude", started: true, answer: "video" })).toBe(
      "Ask Claude for a video…",
    );
    expect(composerPlaceholder({ label: "Codex", agent: "Codex", answer: "image" })).toBe("Ask Codex for an image…");
    expect(composerPlaceholder({ label: "storefront", answer: "image" })).toBe("Ask for an image…");
  });

  it("keeps the neutral wording when the composer can't tell what runs there", () => {
    expect(composerPlaceholder({ label: "storefront" })).toBe("Send to storefront…");
  });
});

describe("composerAgentName", () => {
  it("names the agent from the tab's launch command", () => {
    expect(composerAgentName("claude --session-id 1234", undefined)).toBe("Claude");
    expect(composerAgentName("/opt/homebrew/bin/codex resume abc", undefined)).toBe("Codex");
  });

  it("falls back to the agent that reported status for a plain shell", () => {
    expect(composerAgentName(undefined, "codex")).toBe("Codex");
    expect(composerAgentName("npm run dev", "cursor")).toBe("Cursor");
  });

  it("is null for a shell with no agent in it", () => {
    expect(composerAgentName(undefined, undefined)).toBeNull();
    expect(composerAgentName("npm run dev", "unknown")).toBeNull();
  });
});
