import { describe, expect, it } from "vitest";
import { fencedBlock, withoutPatch } from "../mentionGitCapture";
import {
  chipFailed,
  commitInfo,
  diffFiles,
  findChips,
  parseBlock,
  REACH_NOTE,
  threadInfo,
  type ChipSpec,
} from "./composerChips";

const DIFF = [
  "diff --git a/src/auth/redirect.ts b/src/auth/redirect.ts",
  "--- a/src/auth/redirect.ts",
  "+++ b/src/auth/redirect.ts",
  "@@ -1,2 +1,3 @@",
  "-const a = 1;",
  "+const a = 2;",
  "+const b = 3;",
  "diff --git a/src/auth/returnTo.ts b/src/auth/returnTo.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/auth/returnTo.ts",
  "+export const returnTo = '/';",
].join("\n");

const SHOWN = [
  "commit a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0",
  "Author: Ada",
  "Date: 2026-11-27",
  "",
  "Fix redirect loop",
  "",
  "Keep returnTo through the callback.",
  "",
  " src/auth/redirect.ts | 3 ++-",
  " 1 file changed, 2 insertions(+), 1 deletion(-)",
  "",
  DIFF.split("\n").slice(0, 7).join("\n"),
].join("\n");

const none = () => ({ projects: new Map<string, ChipSpec>(), saved: new Map<string, ChipSpec>() });

function kinds(value: string, ctx = none()) {
  return findChips(value, ctx).map((m) => ({ kind: m.spec.kind, label: m.spec.label, detail: m.spec.detail, text: value.slice(m.start, m.end) }));
}

describe("findChips", () => {
  it("finds every captured block by its heading, wherever it starts", () => {
    const blocks = [
      fencedBlock("terminal output", "✗ 2 tests failed\nTests 2 failed"),
      fencedBlock("api service logs", "GET /api 500"),
      fencedBlock("Uncommitted changes (2 files)", DIFF, "diff"),
      fencedBlock("Commit a1b2c3d4e5f6", SHOWN, "diff"),
      fencedBlock("Pull request #181", "#181 Keep the return path\nhttps://github.com/acme/atlas/pull/181\n\nBody\n\nDiscussion:\n- ada commented: ok\n- bob approved"),
      fencedBlock("Issue #182", "#182 Mention picker cuts paths\nhttps://github.com/acme/atlas/issues/182"),
    ];
    const value = `Look at ${blocks.join(" and ")} please`;
    expect(kinds(value)).toEqual([
      { kind: "terminal", label: "terminal", detail: "2 lines", text: blocks[0] },
      { kind: "service", label: "api", detail: "logs · 1 line", text: blocks[1] },
      { kind: "diff", label: "Uncommitted changes", detail: "2 files", text: blocks[2] },
      { kind: "commit", label: "a1b2c3d", detail: "Fix redirect loop", text: blocks[3] },
      { kind: "pr", label: "#181", detail: "2 comments", text: blocks[4] },
      { kind: "issue", label: "#182", detail: "Mention picker cuts paths", text: blocks[5] },
    ]);
  });

  it("keeps a block whose body holds backticks whole", () => {
    const block = fencedBlock("terminal output", "run ```code``` here");
    expect(kinds(`${block}after`).map((k) => k.text)).toEqual([block]);
  });

  it("finds a block whose heading ends a long unbroken line", () => {
    const block = fencedBlock("api service logs", "GET /api 500");
    expect(kinds(`${"x".repeat(50_000)} ${block}`)).toEqual([
      { kind: "service", label: "api", detail: "logs · 1 line", text: block },
    ]);
    expect(kinds(`${"x".repeat(50_000)}:\n\`\`\`\nbody\n\`\`\`\n`)).toEqual([]);
  });

  it("leaves a fenced block with any other heading as text", () => {
    expect(kinds(fencedBlock("My notes", "hello"))).toEqual([]);
  });

  it("finds a folder on another computer by its reach note", () => {
    const place = `studio:/Users/you/Projects/IA-UI-Atlas${REACH_NOTE}`;
    expect(kinds(`compare with ${place}`)).toEqual([
      { kind: "computer", label: "IA-UI-Atlas", detail: "on studio", text: place },
    ]);
  });

  it("prefers what the composer remembered inserting", () => {
    const logs = fencedBlock("terminal output", "hi");
    const saved = new Map<string, ChipSpec>([[logs, { kind: "terminal", label: "api tab", source: { terminalId: "t2" } }]]);
    expect(findChips(logs, { projects: new Map(), saved })[0].spec.label).toBe("api tab");
  });
});

describe("chipFailed", () => {
  const logs = (body: string) => fencedBlock("web service logs", body);
  const spec: ChipSpec = { kind: "service", label: "web" };

  it("flags captured output with an error, not a warning or a clean run", () => {
    expect(chipFailed(logs("GET / 200\nTypeError: boom"), spec)).toBe(true);
    expect(chipFailed(logs("✗ keeps returnTo"), { kind: "terminal", label: "terminal" })).toBe(true);
    expect(chipFailed(logs("warn: slow query\nTests 40 passed, 0 failed"), spec)).toBe(false);
  });

  it("never flags other kinds", () => {
    expect(chipFailed(fencedBlock("Issue #1", "#1 Fix the error page"), { kind: "issue", label: "#1" })).toBe(false);
  });
});

describe("block parts", () => {
  it("reads a block back into heading, language and body", () => {
    expect(parseBlock(fencedBlock("Commit abc1234", "x\ny", "diff"))).toEqual({ heading: "Commit abc1234", lang: "diff", body: "x\ny" });
  });

  it("counts a diff's lines per file", () => {
    expect(diffFiles(DIFF)).toEqual([
      { path: "src/auth/redirect.ts", status: "modified", added: 2, removed: 1 },
      { path: "src/auth/returnTo.ts", status: "added", added: 1, removed: 0 },
    ]);
  });

  it("reads a commit's message and drops its patch", () => {
    const info = commitInfo(SHOWN);
    expect(info).toMatchObject({ author: "Ada", date: "2026-11-27", subject: "Fix redirect loop", hasDiff: true });
    expect(info.message).toBe("Fix redirect loop\n\nKeep returnTo through the callback.");
    expect(withoutPatch(SHOWN)).not.toContain("diff --git");
    expect(commitInfo(withoutPatch(SHOWN)).hasDiff).toBe(false);
  });

  it("reads a thread's title, link and comment count", () => {
    expect(threadInfo("#181 Keep it\nhttps://x/pull/181\n\nBody text\n\nDiscussion:\n- a: one\n- b: two")).toEqual({
      number: 181,
      title: "Keep it",
      url: "https://x/pull/181",
      excerpt: "Body text",
      comments: 2,
    });
  });
});
