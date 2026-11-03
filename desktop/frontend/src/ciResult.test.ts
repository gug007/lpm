import { describe, expect, it } from "vitest";
import { ciToast, type CiResult } from "./ciResult";

const result = (patch: Partial<CiResult> = {}): CiResult => ({
  project: "lpm",
  projectLabel: "lpm",
  branch: "main",
  sha: "fcb454f",
  title: "feat(cli): add remote command execution",
  url: "https://github.com/o/r/commit/fcb454f",
  passed: false,
  summary: "CI failed: Linux host, Vercel",
  ...patch,
});

describe("ciToast", () => {
  it("says what happened in the Mac's words, under the project and branch", () => {
    expect(ciToast(result())).toEqual({
      title: "CI failed: Linux host, Vercel",
      description: "fcb454f feat(cli): add remote command execution",
      tag: "lpm · main",
    });
  });

  it("names a connected computer", () => {
    expect(ciToast(result({ passed: true, summary: "CI passes again", machine: "Studio" })).tag).toBe(
      "lpm · main on Studio",
    );
  });
});
