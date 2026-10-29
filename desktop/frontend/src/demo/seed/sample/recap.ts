import {
  recapDates,
  type RecapPeriod,
  type WeeklyRecap,
} from "../../../components/recap/weeklyRecapModel";
import { weekdayIndex } from "../../../components/stats/statsDates";
import { HOUR, MINUTE } from "./clock";

// Agent minutes, prompts and millions of tokens per day, Monday first; Sunday off.
const WEEK = [
  { minutes: 352, prompts: 38, tokens: 61 },
  { minutes: 418, prompts: 41, tokens: 74 },
  { minutes: 296, prompts: 33, tokens: 52 },
  { minutes: 389, prompts: 36, tokens: 68 },
  { minutes: 241, prompts: 29, tokens: 43 },
  { minutes: 184, prompts: 37, tokens: 32 },
  { minutes: 0, prompts: 0, tokens: 0 },
];

const PROJECTS = [
  { name: "saas-app", share: 0.41 },
  { name: "auth-service", share: 0.24 },
  { name: "docs-site", share: 0.16 },
  { name: "ml-pipeline", share: 0.12 },
  { name: "mobile-app", share: 0.07 },
];

// A month is the sample week on repeat, each day by its weekday.
export function sampleRecap(week: string, period: RecapPeriod = "week"): WeeklyRecap {
  const days = recapDates(week, period).map((date) => {
    const day = WEEK[weekdayIndex(date)];
    return {
      date,
      agentMs: day.minutes * MINUTE,
      prompts: day.prompts,
      tokens: day.tokens * 1_000_000,
    };
  });
  const total = days.reduce((sum, day) => sum + day.agentMs, 0);
  const weeks = days.length / 7;
  return {
    week,
    period,
    days,
    previousAgentMs: total - 7 * HOUR,
    sessions: Math.round(58 * weeks),
    projects: PROJECTS.map(({ name, share }) => ({ name, agentMs: Math.round(total * share) })),
    agents: [
      { name: "claude", agentMs: Math.round(total * 0.64) },
      { name: "codex", agentMs: Math.round(total * 0.36) },
    ],
    workedRepos: [
      "github.com/acme/auth-service",
      "github.com/acme/ml-pipeline",
      "github.com/acme/mobile-app",
      "github.com/acme/saas-app",
    ],
    linesAdded: Math.round(6_120 * weeks),
    linesRemoved: Math.round(2_407 * weeks),
  };
}
