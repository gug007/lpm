import { FAQ_ITEMS as TRACKER_FAQ } from "@/app/claude-code-codex-token-usage/_components/faq-data";

const SHARED = [
  "What do too fast, on pace and will last mean?",
  "How does the Claude Code 5-hour limit work?",
  "When does the Claude Code weekly limit reset?",
  "How do I check my Codex usage and rate limits?",
  "What can I do when I hit my Claude Code or Codex usage limit?",
];

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "How does the calculator work out when I'll run out?",
    answer:
      "It divides the share of your limit you've used by the share of the window that has passed. Above 1.15 you're going too fast, and it projects your current rate forward to the moment you'd reach 100%. If that comes before the reset, it shows how long you have left and how early you'd hit the limit. Below 0.85 your usage will last, and in the first 5% of a window there's no verdict yet.",
  },
  {
    question: "Does the calculator read my Claude or Codex account?",
    answer:
      "No. It only uses the numbers you set, and they stay on this page. To fill them in, run /usage in Claude Code or /status in Codex. The lpm desktop app reads the same percentages from Claude Code and Codex on your computer and keeps the pace up to date as you work.",
  },
  ...SHARED.map((question) => {
    const item = TRACKER_FAQ.find((faq) => faq.question === question);
    if (!item) throw new Error(`Missing shared FAQ: ${question}`);
    return item;
  }),
];
