import { CalendarClock, ChartColumn, Gauge } from "lucide-react";
import { AUTOMATIONS_PATH, TOKEN_USAGE_PATH } from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const AUTOMATIONS_AREA: FeatureArea = {
  id: "automations",
  title: "Schedule agents and see what they use",
  description:
    "Run agent prompts, commands, and actions on a schedule, and keep an eye on the tokens and plan limits your Claude Code and Codex sessions spend.",
  highlights: [
    {
      icon: CalendarClock,
      title: "Scheduled automations",
      body: "Run a Claude Code, Codex, Gemini CLI, or OpenCode prompt, a shell command, or a saved action every day, on chosen weekdays, on an interval, or at a random time in a window.",
      note: "Needs lpm running and the Mac awake to fire.",
      href: AUTOMATIONS_PATH,
      linkLabel: "Schedule Claude Code tasks",
    },
    {
      icon: ChartColumn,
      title: "Token usage stats",
      body: "Token totals per range, from Today to All time, split into input, cache, output, and reasoning, with an estimated cost at list prices and your busiest projects and sessions.",
      scope: "claude-codex",
      href: TOKEN_USAGE_PATH,
      linkLabel: "Token usage tracking",
    },
    {
      icon: Gauge,
      title: "Plan limit meters",
      body: "Watch your 5-hour and weekly plan windows fill up, see when each resets and whether you're ahead of pace, with a warning before you run out. A compact meter sits in the sidebar.",
      note: "Claude meters need a one-click opt-in and a subscription login.",
      scope: "claude-codex",
    },
  ],
  features: [
    {
      title: "Work in a fresh copy",
      body: "Let a job run on a fresh copy or a new Git worktree so your folder stays untouched. Each run's copy opens like any other project.",
    },
    {
      title: "Only when there's work",
      body: "Add a check, like “are there new commits?”, and the job runs only when it passes. A verify command, like your tests, marks each run passed or failed.",
    },
    {
      title: "Reply to a run",
      body: "Every run keeps its outcome and duration. Open one to read the agent's answer as a conversation and reply to keep it going.",
    },
    {
      title: "Run now, stop, or pause",
      body: "Start any job right away, stop a run in progress, or pause its schedule with a switch. A running job shows its output live, with an elapsed timer.",
      note: "Only one run of a job goes at a time; a run due during it is skipped.",
    },
    {
      title: "Week view and unread results",
      body: "See the week's schedule on a calendar board, with unread badges, a Running marker, and macOS banners when lpm is in the background.",
    },
    {
      title: "Agent, model, and access per job",
      body: "Pick the agent, model, and effort for each prompt job, and full or read-only access. Full access is the default, so choose read-only for review jobs.",
      note: "OpenCode jobs always run with full access.",
    },
    {
      title: "Many projects, or none",
      body: "One job can run across several projects, or on its own from your home folder.",
    },
  ],
};
