import type { AgentKind } from "./agent-script";

// The models and reasoning levels each CLI really offers, and the words each one
// uses for them — Claude's levels are verbatim from `claude -p "/effort help"`,
// Codex's from the rows of its own "/model" picker. The app reads this catalogue
// from its own source; here it is inlined so the demo can be a single client
// bundle, but the lists and the wording are the same.

export type Level = {
  value: string;
  label: string;
  blurb: string;
};

export type Model = {
  value: string;
  label: string;
  /** How the CLI names this model in its status line. */
  status: string;
  /** Levels this model won't take, greyed out rather than dropped. */
  without?: string[];
};

const CLAUDE_LEVELS: Level[] = [
  { value: "auto", label: "Auto", blurb: "Use the default effort level for your model" },
  { value: "low", label: "Low", blurb: "Quick, straightforward implementation" },
  { value: "medium", label: "Medium", blurb: "Balanced approach with standard testing" },
  { value: "high", label: "High", blurb: "Comprehensive implementation with extensive testing" },
  { value: "xhigh", label: "Extra High", blurb: "Extended reasoning with thorough analysis" },
  { value: "max", label: "Max", blurb: "Maximum capability with deepest reasoning" },
  {
    value: "ultracode",
    label: "Ultracode",
    blurb: "xhigh + dynamic workflow orchestration, this session only",
  },
];

const CODEX_LEVELS: Level[] = [
  { value: "low", label: "Low", blurb: "Fast responses with lighter reasoning" },
  { value: "medium", label: "Medium", blurb: "Balances speed and reasoning depth for everyday tasks" },
  { value: "high", label: "High", blurb: "Greater reasoning depth for complex problems" },
  { value: "xhigh", label: "Extra High", blurb: "Extra high reasoning depth for complex problems" },
  { value: "max", label: "Max", blurb: "Consumes usage limits faster" },
  { value: "ultra", label: "Ultra", blurb: "Consumes usage limits faster" },
];

// Only the top Codex models carry Max and Ultra; only Haiku lacks Ultracode.
const CODEX_TOP = ["gpt-6-astra", "gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra"];
const CODEX_MAX_ONLY = ["gpt-6-luna", "gpt-5.6-luna"];
const withoutTop = (slug: string) =>
  CODEX_TOP.includes(slug) ? undefined : CODEX_MAX_ONLY.includes(slug) ? ["ultra"] : ["max", "ultra"];

const codex = (slug: string, label: string): Model => ({
  value: slug,
  label,
  status: slug,
  without: withoutTop(slug),
});

const CATALOGUE: Record<AgentKind, { models: Model[]; levels: Level[] }> = {
  claude: {
    models: [
      { value: "fable", label: "Fable", status: "Fable 5" },
      { value: "opus", label: "Opus", status: "Opus 4.8" },
      { value: "sonnet", label: "Sonnet", status: "Sonnet 4.6" },
      { value: "haiku", label: "Haiku", status: "Haiku 4.5", without: ["ultracode"] },
    ],
    levels: CLAUDE_LEVELS,
  },
  codex: {
    models: [
      codex("gpt-6-astra", "GPT-6 Astra"),
      codex("gpt-6-sol", "GPT-6 Sol"),
      codex("gpt-6-luna", "GPT-6 Luna"),
      codex("gpt-5.6-sol", "GPT-5.6 Sol"),
      codex("gpt-5.6-terra", "GPT-5.6 Terra"),
      codex("gpt-5.6-luna", "GPT-5.6 Luna"),
      codex("gpt-5.5", "GPT-5.5"),
      codex("gpt-5.4", "GPT-5.4"),
      codex("gpt-5.4-mini", "GPT-5.4 Mini"),
      codex("gpt-5.4-nano", "GPT-5.4 Nano"),
      codex("gpt-5.3-codex", "GPT-5.3 Codex"),
    ],
    levels: CODEX_LEVELS,
  },
};

export type ModelPick = { model: string; effort: string };

/** What each terminal starts on, matching the banner the CLI printed. */
export const INITIAL_PICK: Record<AgentKind, ModelPick> = {
  claude: { model: "fable", effort: "high" },
  codex: { model: "gpt-6-astra", effort: "max" },
};

export const modelsFor = (agent: AgentKind): Model[] => CATALOGUE[agent].models;

/** Every level the CLI has, in menu order. The picker renders all of them and
 *  greys out the ones the highlighted model won't take, so the flyout keeps one
 *  height as the pointer runs down the model list — and so a missing level is
 *  visibly unavailable rather than quietly absent. */
export const levelsFor = (agent: AgentKind): Level[] => CATALOGUE[agent].levels;

export function findModel(agent: AgentKind, value: string): Model | undefined {
  return modelsFor(agent).find((m) => m.value === value);
}

export function offers(agent: AgentKind, model: string, level: string): boolean {
  return !findModel(agent, model)?.without?.includes(level);
}

export function modelLabel(agent: AgentKind, value: string): string {
  return findModel(agent, value)?.label ?? value;
}

export function levelLabel(agent: AgentKind, value: string): string {
  return levelsFor(agent).find((l) => l.value === value)?.label ?? value;
}

export function levelBlurb(agent: AgentKind, value: string): string {
  return levelsFor(agent).find((l) => l.value === value)?.blurb ?? "";
}

// What Codex lands on when its picker confirms a level it wasn't asked about,
// and what Claude falls back to when it clamps one the new model can't take.
const DEFAULT_LEVEL: Record<AgentKind, string> = { claude: "auto", codex: "medium" };

/** The level a bare model pick ends on — the other half of what menuEffect
 *  promises. Codex's picker confirms a level every pass, so switching model
 *  resets it; Claude's "/model" leaves the level alone, unless the new model
 *  doesn't take it, in which case Claude clamps and lpm stops claiming the old
 *  one. */
export function levelAfterModelPick(agent: AgentKind, model: string, prev: string): string {
  if (agent === "codex") return DEFAULT_LEVEL.codex;
  return offers(agent, model, prev) ? prev : DEFAULT_LEVEL.claude;
}

/** The model as its CLI's own status line writes it: Claude prints a display
 *  name, Codex prints the slug followed by the reasoning level. */
export function statusModel(agent: AgentKind, pick: ModelPick): string {
  const model = findModel(agent, pick.model)?.status ?? pick.model;
  return agent === "codex" ? `${model} ${pick.effort}` : model;
}

/** Plain-English statement of what committing the cursor will send. The two
 *  CLIs differ in a way no menu layout can show on its own: picking a bare model
 *  leaves Claude's level alone, while Codex's picker confirms a level on every
 *  pass and so resets it to that model's default. */
export function menuEffect(
  agent: AgentKind,
  cursor: { column: "model" | "level"; model: string; level: string },
  pick: ModelPick,
): string {
  const model = modelLabel(agent, cursor.model);
  const running = cursor.model === pick.model;
  if (cursor.column === "level") {
    if (!cursor.level) return "";
    const level = levelLabel(agent, cursor.level);
    return running ? `Set level to ${level}, staying on ${model}` : `Switch to ${model} at ${level}`;
  }
  if (running) return "Already running — pick a level to change it";
  if (agent === "codex") return `Switch to ${model} at its default level`;
  return offers(agent, cursor.model, pick.effort)
    ? `Switch to ${model}, leaving the level alone`
    : `Switch to ${model} — it has no ${levelLabel(agent, pick.effort)}`;
}

/** What the CLI prints when lpm applies a pick — the same confirmations the real
 *  tools write, which is how a switch is visible in the terminal at all. Claude
 *  takes "/model" and "/effort" as separate commands and answers each one;
 *  Codex has only its picker, which confirms both halves in a single banner. */
export function switchNotices(
  agent: AgentKind,
  prev: ModelPick,
  next: ModelPick,
): string[] {
  if (agent === "codex") {
    return [`Model changed to ${findModel(agent, next.model)?.status ?? next.model} ${next.effort}`];
  }
  const lines: string[] = [];
  if (next.model !== prev.model) {
    lines.push(`Set model to \`${findModel(agent, next.model)?.status ?? next.model}\``);
  }
  if (next.effort !== prev.effort) {
    lines.push(`Set effort level to ${next.effort} for this session`);
  }
  return lines;
}
