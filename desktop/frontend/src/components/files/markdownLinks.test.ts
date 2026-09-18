import { describe, expect, it } from "vitest";
import { markdownTarget } from "./markdownLinks";
import { isMarkdownPath } from "./useFileView";

describe("isMarkdownPath", () => {
  it("matches .md and .markdown only", () => {
    expect(isMarkdownPath("AGENTS.md")).toBe(true);
    expect(isMarkdownPath("docs/guide.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("page.mdx")).toBe(false);
    expect(isMarkdownPath("README")).toBe(false);
  });
});

describe("markdownTarget", () => {
  it("sends anything with a scheme out of the app", () => {
    expect(markdownTarget("docs/a.md", "https://lpm.cx/x")).toEqual({
      kind: "external",
      url: "https://lpm.cx/x",
    });
    expect(markdownTarget("docs/a.md", "mailto:hi@example.com").kind).toBe("external");
    expect(markdownTarget("docs/a.md", "//cdn.example.com/i.png").kind).toBe("external");
  });

  it("resolves relative paths against the file's folder", () => {
    expect(markdownTarget("docs/a.md", "b.md")).toEqual({ kind: "file", path: "docs/b.md" });
    expect(markdownTarget("docs/a.md", "./img/x.png")).toEqual({
      kind: "file",
      path: "docs/img/x.png",
    });
    expect(markdownTarget("docs/a.md", "../README.md")).toEqual({
      kind: "file",
      path: "README.md",
    });
    expect(markdownTarget("README.md", "../../etc/passwd")).toEqual({
      kind: "file",
      path: "etc/passwd",
    });
  });

  it("reads a leading slash as the project root", () => {
    expect(markdownTarget("docs/a.md", "/cli/README.md")).toEqual({
      kind: "file",
      path: "cli/README.md",
    });
  });

  it("drops fragments and queries, and decodes escapes", () => {
    expect(markdownTarget("docs/a.md", "b.md#usage")).toEqual({ kind: "file", path: "docs/b.md" });
    expect(markdownTarget("docs/a.md", "my%20file.md?v=1")).toEqual({
      kind: "file",
      path: "docs/my file.md",
    });
    expect(markdownTarget("docs/a.md", "#usage")).toEqual({ kind: "anchor" });
  });
});
