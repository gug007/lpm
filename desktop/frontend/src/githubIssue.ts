// Links that open a new, filled-in issue or discussion on lpm's GitHub repo,
// for feedback and for asking for something lpm doesn't do yet.

import { SEND_TO_OPTIONS } from "./sendTo";

export const GITHUB_REPO = "gug007/lpm";
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

// encodeURIComponent leaves !'()*~ alone; GitHub's prefill is happier with
// every one of them escaped.
function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function newIssueUrl({
  title,
  body,
  labels = [],
}: {
  title: string;
  body: string;
  labels?: string[];
}): string {
  const query = [`title=${strictEncode(title)}`, `body=${strictEncode(body)}`];
  if (labels.length > 0) query.push(`labels=${strictEncode(labels.join(","))}`);
  return `${GITHUB_REPO_URL}/issues/new?${query.join("&")}`;
}

// Slugs of the repo's discussion categories.
export type DiscussionCategory = "ideas" | "q-a";

export function newDiscussionUrl({
  title,
  body,
  category,
}: {
  title: string;
  body: string;
  category: DiscussionCategory;
}): string {
  const query = [
    `category=${category}`,
    `title=${strictEncode(title)}`,
    `body=${strictEncode(body)}`,
  ];
  return `${GITHUB_REPO_URL}/discussions/new?${query.join("&")}`;
}

// An issue asking for one more place automations can send their results.
export function sendToRequestUrl(): string {
  const supported = SEND_TO_OPTIONS.map((o) => o.label).join(", ");
  return newIssueUrl({
    title: "Send to: ",
    body: [
      "**Where should automations be able to send their results?**",
      "<!-- Slack, Discord, email, a webhook, … -->",
      "",
      "**What would you use it for?**",
      "",
      "",
      "---",
      `Already supported: ${supported}`,
    ].join("\n"),
    labels: ["enhancement"],
  });
}
