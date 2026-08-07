import { describe, expect, it } from "vitest";
import { markdownToSpeech } from "./markdownToSpeech";

describe("markdownToSpeech", () => {
  it("strips headings, emphasis and link targets", () => {
    const out = markdownToSpeech(
      "### Armenia real-estate signals — 7 August 2026\n\n" +
        "- **Demand is accelerating:** Q2 recorded 69,664 transactions (+15.4% YoY). " +
        "[Cadastre Committee](https://cadastre.am/x.pdf)",
    );
    expect(out).toContain("Armenia real-estate signals");
    expect(out).toContain("Demand is accelerating:");
    expect(out).toContain("Cadastre Committee");
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).not.toContain("https");
  });

  it("skips code fences and rules, keeps image alt text", () => {
    const out = markdownToSpeech(
      "See the ![diagram](chart.png) below.\n\n```bash\nnpm run build\n```\n\n---\n\nDone.",
    );
    expect(out).toContain("See the diagram below.");
    expect(out).not.toContain("npm");
    expect(out).toContain("Done.");
  });

  it("reads table rows as cells and drops the separator", () => {
    const out = markdownToSpeech("| # | Title |\n|---|-------|\n| 6 | MCP for LLMs |");
    expect(out).toContain("Title");
    expect(out).toContain("6, MCP for LLMs");
    expect(out).not.toContain("|");
    expect(out).not.toContain("---");
  });

  it("drops decorative symbols and emoji", () => {
    const out = markdownToSpeech("🚀 Shipped ✅ verified. Progress: ████░░ 50%");
    expect(out).toContain("Shipped");
    expect(out).toContain("verified.");
    expect(out).toContain("50%");
    expect(out).not.toMatch(/[🚀✅█░]/u);
  });
});
