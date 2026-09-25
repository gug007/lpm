export type ScenarioId = "fiveHour" | "weekly";

export type FlagIcon = "gauge" | "clock" | "sun";

export type Target = {
  kind: "limit" | "time";
  when: string;
  countdown: string;
  announce: string;
  skip: string;
  sentAt: string;
  clock: string;
};

export type Sent = { at: string; clock: string };

export type Flag = {
  key: "limit" | "evening" | "morning";
  label: string;
  title?: string;
  icon: FlagIcon;
  x: number;
  row: 0 | 1;
  target: Target;
};

export type Pick = { time: string; countdown: string; x: number };

export type Scenario = {
  chip: string;
  flags: Flag[];
  footerLimit?: { label: string; title: string; target: Target };
};

export const CLOCK = "Wed 2:14 PM";
export const NOW_LABEL = "2:14 PM";
export const PROJECT = "saas-app";
export const AGENT = "Claude";
export const PROMPT =
  "Finish the auth refactor: make the failing session tests pass, then run the full suite.";

export const NEAR_END = 0.46;
export const GAP_SHARE = 0.03;
export const NIGHT = { x0: 0.827, x1: 0.8831 };
export const LAST_USED_X = 0.23;

export const TICKS: { x: number; major: boolean; label?: string; wide?: boolean }[] = [
  { x: 0.0575, major: false },
  { x: 0.115, major: true, label: "1h", wide: true },
  { x: 0.1725, major: false },
  { x: 0.23, major: true, label: "2h", wide: true },
  { x: 0.2875, major: false },
  { x: 0.345, major: true, label: "3h" },
  { x: 0.4025, major: false },
  { x: 0.46, major: true, label: "4h", wide: true },
  { x: 0.5348, major: false },
  { x: 0.5932, major: true, label: "8 PM" },
  { x: 0.6517, major: false },
  { x: 0.7101, major: true, label: "10 PM", wide: true },
  { x: 0.7686, major: false },
  { x: 0.827, major: true, label: "Midnight" },
  { x: 0.8831, major: true },
  { x: 0.9416, major: false },
  { x: 1, major: true },
];

export const PICKS: Pick[] = [
  { time: "2:44 PM", countdown: "in 30m", x: 0.0575 },
  { time: "3:14 PM", countdown: "in 1h", x: 0.115 },
  { time: "3:44 PM", countdown: "in 1h 30m", x: 0.1725 },
  { time: "4:14 PM", countdown: "in 2h", x: 0.23 },
  { time: "4:44 PM", countdown: "in 2h 30m", x: 0.2875 },
  { time: "5:14 PM", countdown: "in 3h", x: 0.345 },
  { time: "5:44 PM", countdown: "in 3h 30m", x: 0.4025 },
  { time: "6:14 PM", countdown: "in 4h", x: 0.46 },
];

export const DEFAULT_PICK = 3;

export function pickTarget(pick: Pick): Target {
  return {
    kind: "time",
    when: pick.time,
    countdown: pick.countdown,
    announce: `Scheduled for ${pick.time}.`,
    skip: `Skip to ${pick.time}`,
    sentAt: pick.time,
    clock: `Wed ${pick.time}`,
  };
}

export const SEND_NOW: Sent = { at: NOW_LABEL, clock: CLOCK };

const LIMIT_FLAG: Flag = {
  key: "limit",
  label: "Limit resets 3:45 PM",
  title: "Claude's 5-hour limit is 100% used",
  icon: "gauge",
  x: 0.1754,
  row: 0,
  target: {
    kind: "limit",
    when: "3:45 PM",
    countdown: "in 1h 32m",
    announce: "Scheduled for 3:45 PM, 30 seconds after Claude's 5-hour limit resets.",
    skip: "Skip to the reset",
    sentAt: "3:45 PM",
    clock: "Wed 3:45 PM",
  },
};

const EVENING_FLAG: Flag = {
  key: "evening",
  label: "5:00 PM",
  title: "End of the working day",
  icon: "clock",
  x: 0.3182,
  row: 0,
  target: {
    kind: "time",
    when: "5:00 PM",
    countdown: "in 2h 46m",
    announce: "Scheduled for 5:00 PM.",
    skip: "Skip to 5:00 PM",
    sentAt: "5:00 PM",
    clock: "Wed 5:00 PM",
  },
};

const MORNING_FLAG: Flag = {
  key: "morning",
  label: "Tomorrow 9:00 AM",
  icon: "sun",
  x: 0.9416,
  row: 0,
  target: {
    kind: "time",
    when: "Tomorrow 9:00 AM",
    countdown: "in 18h 46m",
    announce: "Scheduled for tomorrow 9:00 AM.",
    skip: "Skip to tomorrow 9:00 AM",
    sentAt: "Thu 9:00 AM",
    clock: "Thu 9:00 AM",
  },
};

export const SCENARIO_IDS: ScenarioId[] = ["fiveHour", "weekly"];

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  fiveHour: {
    chip: "5-hour limit reached",
    flags: [LIMIT_FLAG, { ...EVENING_FLAG, row: 1 }, MORNING_FLAG],
  },
  weekly: {
    chip: "Weekly limit reached",
    flags: [EVENING_FLAG, MORNING_FLAG],
    footerLimit: {
      label: "Limit resets Fri 9:00 AM",
      title: "Claude's weekly limit is 100% used",
      target: {
        kind: "limit",
        when: "Fri 9:00 AM",
        countdown: "in 1d 18h",
        announce: "Scheduled for Fri 9:00 AM, 30 seconds after Claude's weekly limit resets.",
        skip: "Skip to the reset",
        sentAt: "Fri 9:00 AM",
        clock: "Fri 9:00 AM",
      },
    },
  },
};

export const EMPTY_TITLE = "Nothing scheduled";
export const EMPTY_BODY =
  "Write a prompt and press ⌥↵ to send it later: at a time, after a delay, or when the agent's usage limit resets.";
