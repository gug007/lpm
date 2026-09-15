import {
  effortLabel,
  modelLabel,
  switchEfforts,
  type ModelPick,
  type SwitchableCLI,
} from "./agentModelSwitch";

// What each reasoning level actually buys you, in the CLI's own words — Claude's
// from `claude --model <m> -p "/effort help"`, Codex's from the rows of its
// "/model" picker. Kept verbatim rather than paraphrased: these are the
// descriptions the user sees in the agent itself, so the two surfaces agree.
const CLAUDE_EFFORT_BLURBS: Record<string, string> = {
  auto: "Use the default effort level for your model",
  low: "Quick, straightforward implementation",
  medium: "Balanced approach with standard testing",
  high: "Comprehensive implementation with extensive testing",
  xhigh: "Extended reasoning with thorough analysis",
  max: "Maximum capability with deepest reasoning",
  ultracode: "xhigh + dynamic workflow orchestration, this session only",
};

const CODEX_EFFORT_BLURBS: Record<string, string> = {
  low: "Fast responses with lighter reasoning",
  medium: "Balances speed and reasoning depth for everyday tasks",
  high: "Greater reasoning depth for complex problems",
  xhigh: "Extra high reasoning depth for complex problems",
  max: "Consumes usage limits faster",
  ultra: "Consumes usage limits faster",
};

/** The one-line blurb for a level, or "" for one neither CLI describes. */
export function effortBlurb(cli: SwitchableCLI, effort: string): string {
  const table = cli === "claude" ? CLAUDE_EFFORT_BLURBS : CODEX_EFFORT_BLURBS;
  return table[effort] ?? "";
}

/** Which half of the menu the cursor is in, and what it points at. */
export interface MenuCursor {
  column: "model" | "effort";
  model: string;
  effort: string;
}

// Plain-English statement of what committing the cursor will send. The two CLIs
// differ in a way no menu layout can show on its own: picking a bare model
// leaves Claude's level alone, while Codex's picker confirms a level on every
// pass and so resets it to that model's default. Saying so before the click is
// the only way the difference is ever visible.
export function menuEffect(cli: SwitchableCLI, cursor: MenuCursor, pick: ModelPick): string {
  const model = modelLabel(cli, cursor.model);
  const running = Boolean(pick.model) && cursor.model === pick.model;
  if (cursor.column !== "model") {
    if (!cursor.effort) return "";
    const level = effortLabel(cli, cursor.model, cursor.effort);
    return running ? `Set level to ${level}, staying on ${model}` : `Switch to ${model} at ${level}`;
  }
  if (running) return "Already running — pick a level to change it";
  if (cli === "codex") return `Switch to ${model} at its default level`;
  // Claude keeps the level across a model switch, but only when the new model
  // takes it: Haiku has no Ultracode, and Claude clamps without saying to what.
  const keeps = !pick.effort || switchEfforts(cli, cursor.model).some((e) => e.value === pick.effort);
  return keeps
    ? `Switch to ${model}, leaving the level alone`
    : `Switch to ${model} — it has no ${effortLabel(cli, pick.model, pick.effort)}`;
}
