import { describe, expect, it } from "vitest";
import { languageForPath, type LanguageSpec } from "./monacoLanguage";

const languages: LanguageSpec[] = [
  { id: "typescript", extensions: [".ts", ".tsx", ".d.ts"] },
  { id: "javascript", extensions: [".js", ".mjs"] },
  { id: "dockerfile", extensions: [".dockerfile"], filenames: ["Dockerfile"] },
  { id: "markdown", extensions: [".md"] },
  { id: "plaintext", extensions: [".txt"] },
];

describe("languageForPath", () => {
  it("matches by extension, case-insensitively", () => {
    expect(languageForPath("src/App.TSX", languages)).toBe("typescript");
    expect(languageForPath("lib/index.mjs", languages)).toBe("javascript");
  });

  it("prefers an exact filename over any extension", () => {
    expect(languageForPath("docker/Dockerfile", languages)).toBe("dockerfile");
    expect(languageForPath("build.dockerfile", languages)).toBe("dockerfile");
  });

  it("falls back to plain text and ignores a bare dotfile", () => {
    expect(languageForPath("LICENSE", languages)).toBe("plaintext");
    expect(languageForPath(".ts", languages)).toBe("plaintext");
    expect(languageForPath("notes.md", languages)).toBe("markdown");
  });
});
