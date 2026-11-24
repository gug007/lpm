import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({ OpenIssues: vi.fn() }));

import { filterIssues, issueMentionItems, type OpenIssue } from "./issues";
import { mentionGroup, rankMentions } from "./mentions";

const issue = (number: number, title: string, labels: string[] = [], author = "dev"): OpenIssue => ({
  number,
  title,
  url: `https://github.com/o/r/issues/${number}`,
  author,
  labels,
  branch: `${number}-x`,
});

const issues = [
  issue(431, "Retry failed webhooks", ["bug", "billing"], "maria"),
  issue(428, "Document rate limits"),
  issue(43, "Search ignores code/blocks"),
];

describe("issue mentions", () => {
  const items = issueMentionItems(issues);

  it("finds an issue by number, with or without the #, and by title", () => {
    expect(rankMentions(items, "431").map((i) => i.insert)).toEqual(["431"]);
    expect(rankMentions(items, "#43").map((i) => i.insert)).toEqual(["431", "43"]);
    expect(rankMentions(items, "rate").map((i) => i.insert)).toEqual(["428"]);
    expect(rankMentions(items, "ignores").map((i) => i.insert)).toEqual(["43"]);
  });

  it("folds behind one row that says how many are open", () => {
    expect(mentionGroup("issue", "Issues", "open issue", items)?.detail).toBe("3 open issues ›");
  });
});

describe("filterIssues", () => {
  it("matches every word, in any order, anywhere on the issue", () => {
    expect(filterIssues(issues, "  ").length).toBe(3);
    expect(filterIssues(issues, "webhooks maria").map((i) => i.number)).toEqual([431]);
    expect(filterIssues(issues, "billing retry").map((i) => i.number)).toEqual([431]);
    expect(filterIssues(issues, "#428").map((i) => i.number)).toEqual([428]);
    expect(filterIssues(issues, "webhooks nobody")).toEqual([]);
  });
});
