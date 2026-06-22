import { describe, expect, it } from "vitest";
import { MENTION_TRIGGER, rankMentions, type MentionItem } from "./mentions";

const frag = (line: string): string | null => {
  const m = MENTION_TRIGGER.exec(line);
  return m ? m[1] : null;
};

describe("MENTION_TRIGGER", () => {
  it("matches a bare @ and an @ after whitespace", () => {
    expect(frag("@")).toBe("");
    expect(frag("see @co")).toBe("co");
    expect(frag("  @foo/bar")).toBe("foo/bar");
  });

  it("takes the last @ on the line", () => {
    expect(frag("@a @b")).toBe("b");
  });

  it("does not trigger on an @ glued to preceding text (emails, versions)", () => {
    expect(frag("me@host")).toBeNull();
    expect(frag("pkg@1.2")).toBeNull();
  });

  it("closes once the fragment ends in a space", () => {
    expect(frag("@a b")).toBeNull();
  });
});

describe("rankMentions", () => {
  const projects: MentionItem[] = [
    { kind: "project", label: "lpm", insert: "/Users/me/lpm", detail: "/Users/me/lpm" },
    { kind: "duplicate", label: "lpm-2", insert: "/Users/me/lpm-2", detail: "/Users/me/lpm-2" },
  ];
  const files: MentionItem[] = [
    { kind: "file", label: "src/Composer.tsx", insert: "src/Composer.tsx" },
    { kind: "dir", label: "src/components", insert: "src/components" },
  ];

  it("returns projects ahead of files for an empty fragment", () => {
    const out = rankMentions(projects, files, "");
    expect(out.map((m) => m.label)).toEqual([
      "lpm",
      "lpm-2",
      "src/Composer.tsx",
      "src/components",
    ]);
  });

  it("ranks a basename-prefix hit above a mere path substring", () => {
    const out = rankMentions(projects, files, "comp");
    expect(out[0].label).toBe("src/Composer.tsx");
  });

  it("filters out non-matches", () => {
    const out = rankMentions(projects, files, "lpm");
    expect(out.map((m) => m.label)).toEqual(["lpm", "lpm-2"]);
  });
});
