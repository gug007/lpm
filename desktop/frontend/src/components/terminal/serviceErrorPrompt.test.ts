import { describe, expect, it } from "vitest";
import { serviceErrorPrompt } from "./serviceErrorPrompt";

describe("serviceErrorPrompt", () => {
  it("quotes the latest distinct errors with their stacks and says how the service starts", () => {
    const log = [
      "ERROR first",
      "GET / 200 in 3ms",
      "ERROR second",
      "TypeError: boom",
      "    at handler (src/a.ts:1:1)",
      "GET / 200 in 3ms",
      "ERROR fourth",
    ].join("\n");
    expect(serviceErrorPrompt("web", "pnpm dev", log)).toBe(
      [
        "The `web` service in this project, started with `pnpm dev`, logged these errors, the latest last:",
        "",
        "```",
        "ERROR second",
        "",
        "TypeError: boom",
        "    at handler (src/a.ts:1:1)",
        "",
        "ERROR fourth",
        "```",
        "",
        "Find the cause in the code and fix it.",
      ].join("\n"),
    );
  });

  it("quotes a repeated error once, with how often it was logged", () => {
    const boom = ["TypeError: boom", "    at handler (src/a.ts:1:1)"];
    const log = [...boom, "GET / 200", ...boom, "ERROR other", "GET / 200", ...boom].join("\n");
    expect(serviceErrorPrompt("web", undefined, log)).toBe(
      [
        "The `web` service in this project logged these errors, the latest last:",
        "",
        "```",
        "ERROR other",
        "",
        "TypeError: boom",
        "    at handler (src/a.ts:1:1)",
        "(logged 3 times)",
        "```",
        "",
        "Find the cause in the code and fix it.",
      ].join("\n"),
    );
  });

  it("names a single error as such", () => {
    expect(serviceErrorPrompt("api", undefined, "Error: listen EADDRINUSE\nError: listen EADDRINUSE")).toContain(
      "The `api` service in this project logged this error 2 times:",
    );
  });
});
