import type { IssueText, OpenIssue } from "../../issues";
import type { CommandMap } from "../backend";
import type { SeedIssue } from "../seed/types";
import { projectAt } from "./state";

const url = (number: number) => `https://github.com/acme/saas-app/issues/${number}`;

// issue_branch.rs names them the same way.
export const issueBranch = (issue: { number: number; title: string }): string =>
  `${issue.number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

function open(issue: SeedIssue): OpenIssue {
  const { number, title, author, labels } = issue;
  return { number, title, author, labels, url: url(number), branch: issueBranch(issue) };
}

function read(issue: SeedIssue): IssueText {
  const { number, title, body, comments } = issue;
  const said = comments.map((c) => `- ${c.author}: ${c.body}`).join("\n");
  const thread = [body, said && `Comments:\n${said}`].filter(Boolean).join("\n\n");
  return {
    number,
    title,
    url: url(number),
    mention: `Issue #${number}:\n\`\`\`\n#${number} ${title}\n${url(number)}\n\n${thread}\n\`\`\`\n`,
    prompt: `Work on issue #${number}: ${title}\n${url(number)}\n\n${thread}`,
  };
}

export const issueCommands: CommandMap = {
  open_issues: ({ cwd }) => (projectAt(String(cwd))?.git.issues ?? []).map(open),
  read_issue: ({ cwd, number }) => {
    const issue = projectAt(String(cwd))?.git.issues?.find((i) => i.number === Number(number));
    if (!issue) throw new Error(`There's no issue #${number} in this repository`);
    return read(issue);
  },
  branch_issue: ({ cwd }) => projectAt(String(cwd))?.git.issue ?? null,
};
