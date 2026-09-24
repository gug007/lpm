import { GitBranch, Package, RefreshCw, type LucideIcon } from "lucide-react";
import { REVIEW_CHANGES_PATH } from "@/lib/links";

export const PROJECT = "shop";
export const MIN_COPIES = 1;
export const MAX_COPIES = 50;
export const INITIAL_COPIES = 3;

export const ACTION_LABEL = "Claude";
export const AGENT_COMMAND = "claude";
export const SAMPLE_PROMPT = "Add a 14-day trial to the billing flow";

export type RunMode = "none" | "action" | "command";
export type CopyRunMode = "default" | RunMode;

export type CopyDraft = { serial: number; override: RunMode | null };

export const RUN_OPTIONS: readonly { value: RunMode; label: string }[] = [
  { value: "none", label: "Nothing" },
  { value: "action", label: "Action" },
  { value: "command", label: "Command" },
];

export const COPY_RUN_OPTIONS: readonly { value: CopyRunMode; label: string }[] =
  [{ value: "default", label: "Default" }, ...RUN_OPTIONS];

export type OptionKey = "committedOnly" | "pullLatest" | "reinstall";
export type DuplicateOptions = Record<OptionKey, boolean>;

export const DEFAULT_OPTIONS: DuplicateOptions = {
  committedOnly: false,
  pullLatest: true,
  reinstall: false,
};

export const OPTION_ROWS: readonly {
  key: OptionKey;
  icon: LucideIcon;
  title: string;
  summary: string;
  description: (ref: string) => string;
}[] = [
  {
    key: "committedOnly",
    icon: GitBranch,
    title: "Committed work only",
    summary: "Committed only",
    description: (ref) =>
      `Reset ${ref} to the last commit, dropping uncommitted changes.`,
  },
  {
    key: "pullLatest",
    icon: RefreshCw,
    title: "Pull latest changes",
    summary: "Pull latest",
    description: (ref) =>
      `Bring ${ref} up to the newest commits on its branch.`,
  },
  {
    key: "reinstall",
    icon: Package,
    title: "Reinstall dependencies",
    summary: "Reinstall",
    description: (ref) =>
      `Copy without dependencies, then install them fresh in ${ref}.`,
  },
];

const FIXED_SUFFIXES = ["k3Fq9Z", "Rm82xQ", "p0VnLe", "7tHcWa", "Yd4sJo"];
const ID_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Seeded by the copy's serial, never Math.random, so the server render and
// hydration name every copy the same way.
export function copyLabel(serial: number): string {
  if (serial < FIXED_SUFFIXES.length) {
    return `${PROJECT}-${FIXED_SUFFIXES[serial]}`;
  }
  let seed = Math.imul(serial + 1, 2654435761) >>> 0;
  let id = "";
  for (let i = 0; i < 6; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    id += ID_ALPHABET[(seed >>> 16) % ID_ALPHABET.length];
  }
  return `${PROJECT}-${id}`;
}

export const copyNoun = (count: number) => (count === 1 ? "copy" : "copies");
export const copyRef = (count: number) =>
  count === 1 ? "the copy" : "each copy";

export function confirmLabel(count: number, runs: boolean): string {
  if (!runs) return `Create ${count} ${copyNoun(count)}`;
  return count === 1 ? "Run on the copy" : `Run on ${count} copies`;
}

export function runSummary(mode: RunMode): string {
  if (mode === "none") return "Nothing";
  return mode === "command" ? "Command" : ACTION_LABEL;
}

export function overrideSummary(override: RunMode | null): string {
  if (override === null) return "Default";
  if (override === "none") return "Nothing";
  return override === "command" ? "Command" : `Action: ${ACTION_LABEL}`;
}

export function optionsSummary(options: DuplicateOptions): string {
  return (
    OPTION_ROWS.filter((row) => options[row.key])
      .map((row) => row.summary)
      .join(" · ") || "None"
  );
}

export function toastMessages(count: number): string[] {
  const perCopy =
    count > 1
      ? Array.from(
          { length: count },
          (_, i) => `Creating copy ${i + 1} of ${count} of ${PROJECT}…`,
        )
      : [];
  return [
    `Creating ${count} ${copyNoun(count)} of ${PROJECT}…`,
    ...perCopy,
    `Created ${count} ${copyNoun(count)} of ${PROJECT}`,
  ];
}

export type StepPart = string | { code: string } | { href: string; text: string };

export const HOW_STEPS: readonly { title: string; body: StepPart[] }[] = [
  {
    title: "Right-click, Duplicate",
    body: [
      "Right-click the project in lpm's sidebar and choose Duplicate. New Worktree, right below it, opens the same dialog but makes linked worktrees on fresh branches.",
    ],
  },
  {
    title: "Choose what comes along",
    body: [
      "By default a copy keeps your uncommitted edits, ",
      { code: ".env" },
      " and ",
      { code: "node_modules" },
      ", and tries to fast-forward to the newest commits. Switch on Committed work only, turn off Pull latest changes or switch on Reinstall dependencies for a Node project. Build output and caches like ",
      { code: ".next" },
      ", ",
      { code: "dist" },
      " and ",
      { code: "target" },
      " are always left behind.",
    ],
  },
  {
    title: "Run an agent in every copy",
    body: [
      "Pick what starts in each copy: nothing, one of the project's actions or a command like ",
      { code: "claude" },
      ", plus an optional prompt for the agent. Make up to 50 copies at once; they nest under the original in the sidebar, or in a folder you name. ",
      { href: REVIEW_CHANGES_PATH, text: "Review each copy's diff" },
      ", keep the one that works and delete the rest.",
    ],
  },
];
