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

  it("triggers on an @ right after an image chip (￼ boundary)", () => {
    expect(frag("￼@")).toBe("");
    expect(frag("￼@co")).toBe("co");
    expect(frag("see ￼@foo")).toBe("foo");
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
  const pool = [...projects, ...files];

  it("returns projects ahead of files for an empty fragment", () => {
    const out = rankMentions(pool, "");
    expect(out.map((m) => m.label)).toEqual([
      "lpm",
      "lpm-2",
      "src/Composer.tsx",
      "src/components",
    ]);
  });

  it("ranks a basename-prefix hit above a mere path substring", () => {
    const out = rankMentions(pool, "comp");
    expect(out[0].label).toBe("src/Composer.tsx");
  });

  it("filters out non-matches", () => {
    const out = rankMentions(pool, "lpm");
    expect(out.map((m) => m.label)).toEqual(["lpm", "lpm-2"]);
  });

  it("floats changed files above projects and plain files", () => {
    const changed: MentionItem = { kind: "changed", label: "src/App.tsx", insert: "src/App.tsx" };
    const out = rankMentions([...projects, changed, ...files], "");
    expect(out[0].label).toBe("src/App.tsx");
  });

  it("ranks a matching branch by name", () => {
    const branch: MentionItem = { kind: "branch", label: "feat/composer", insert: "feat/composer" };
    const out = rankMentions([...projects, branch, ...files], "feat");
    expect(out[0].label).toBe("feat/composer");
  });

  it("orders a service log below projects but above branches and files", () => {
    const branch: MentionItem = { kind: "branch", label: "main", insert: "main" };
    const log: MentionItem = { kind: "service-log", label: "web", insert: "web", paneIndex: 0 };
    const out = rankMentions([branch, ...files, log, ...projects], "");
    expect(out.map((m) => m.kind)).toEqual([
      "project",
      "duplicate",
      "service-log",
      "branch",
      "file",
      "dir",
    ]);
  });

  it("matches a service log by name", () => {
    const log: MentionItem = { kind: "service-log", label: "api", insert: "api", paneIndex: 1 };
    const out = rankMentions([...projects, log, ...files], "api");
    expect(out.map((m) => m.label)).toEqual(["api"]);
  });

  it("ranks the terminal's own output above service logs", () => {
    const svc: MentionItem = { kind: "service-log", label: "web", insert: "web", paneIndex: 0 };
    const term: MentionItem = { kind: "terminal-log", label: "claude", insert: "claude" };
    const out = rankMentions([svc, term], "");
    expect(out.map((m) => m.kind)).toEqual(["terminal-log", "service-log"]);
  });

  it("surfaces every terminal on @ter — own labeled 'terminal', siblings by tab name", () => {
    const own: MentionItem = { kind: "terminal-log", label: "terminal", insert: "terminal", terminalId: "a" };
    const t1: MentionItem = { kind: "terminal-log", label: "Terminal 1", insert: "Terminal 1", terminalId: "b" };
    const out = rankMentions([own, t1], "ter");
    expect(out.map((m) => m.label)).toEqual(["terminal", "Terminal 1"]);
  });
});
