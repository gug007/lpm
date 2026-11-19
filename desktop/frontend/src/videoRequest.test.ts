import { describe, expect, it } from "vitest";
import { buildVideoRequest } from "./videoRequest";

describe("buildVideoRequest", () => {
  it("calls the skill with the prompt as written", () => {
    expect(buildVideoRequest("claude", "How does checkout apply a coupon?")).toBe(
      "/explaincast How does checkout apply a coupon?",
    );
  });

  it("uses the skill mention for every agent but Claude Code", () => {
    expect(buildVideoRequest("codex", "Show the signup flow")).toBe("$explaincast Show the signup flow");
    expect(buildVideoRequest(null, "Show the signup flow")).toMatch(/^\$explaincast /);
  });

  it("keeps a prompt of several lines whole", () => {
    expect(buildVideoRequest("claude", "  Show checkout.\nThen the refund.  ")).toBe(
      "/explaincast Show checkout.\nThen the refund.",
    );
  });

  it("leaves a prompt that already calls the skill alone", () => {
    expect(buildVideoRequest("claude", "/explaincast Explain retries")).toBe("/explaincast Explain retries");
    expect(buildVideoRequest("codex", "$explaincast Explain retries")).toBe("$explaincast Explain retries");
    expect(buildVideoRequest("claude", "/explaincasting is fun")).toBe("/explaincast /explaincasting is fun");
  });
});
