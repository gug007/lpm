import type { SeedIssue } from "../types";

export const SAAS_APP_ISSUES: SeedIssue[] = [
  {
    number: 431,
    title: "Retry failed webhooks",
    author: "maria",
    labels: ["bug", "billing"],
    body: "Stripe webhooks that time out are dropped, so a paid invoice can stay open.\n\nRetry with a backoff for a day, then mark the event failed.",
    comments: [{ author: "dev", body: "The handler is in src/lib/stripe-webhook.ts." }],
  },
  {
    number: 428,
    title: "Show the trial end date on the plan card",
    author: "sam",
    labels: ["billing"],
    body: "People ask support when their trial ends. The plan card knows; show it there.",
    comments: [],
  },
  {
    number: 419,
    title: "Invite links expire too soon",
    author: "maria",
    labels: ["teams"],
    body: "Team invites stop working after an hour. A week would be fine.",
    comments: [],
  },
];
