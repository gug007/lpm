import { TransformText } from "../bridge/commands";
import { getSettings } from "./store/settings";
import { aiEffectiveFast, type AICLI } from "./types";
import type { AIPicker } from "./hooks/useAIPicker";

// Upper bound on how many rewrites a single action can request at once. Small so
// the variant picker stays scannable and we don't fan out into an unbounded pile
// of parallel CLI runs.
export const MAX_VARIANTS = 5;

// The resolved AI selection a transform runs with, read at run time so the live
// picker choice (settings first, else the composer's own picker) always wins.
export interface TransformParams {
  cli: AICLI;
  model: string;
  effort: string;
  fast: boolean;
}

export function resolveTransformParams(ai: AIPicker): TransformParams {
  const s = getSettings();
  const cli = (s.aiCli as AICLI) || ai.selectedCLI;
  const model = s.aiModel ?? ai.selectedModel;
  const effort = s.aiEffort ?? ai.selectedEffort;
  const fast = s.aiFast ?? ai.selectedFast;
  return { cli, model, effort, fast: aiEffectiveFast(cli, model, fast) };
}

export function clampVariantCount(count: number): number {
  return Math.max(1, Math.min(MAX_VARIANTS, Math.round(count)));
}

// Nudge each parallel run toward a genuinely different rewrite so the picker
// isn't three near-identical outputs — the instruction still leads, this only
// steers diversity.
function variantInstruction(instruction: string, index: number, total: number): string {
  return `${instruction}\n\nGenerate variation ${index + 1} of ${total}: produce a distinct rewrite that differs meaningfully from the other variations in wording, structure, and emphasis, while fully following the instruction above.`;
}

// Run the action `count` times in parallel and return the non-empty rewrites.
// Partial failures are dropped so a few dead runs still yield choices; only when
// every run fails do we surface the first error to the caller.
export async function generateVariants(
  projectName: string | null,
  cwd: string,
  params: TransformParams,
  instruction: string,
  text: string,
  count: number,
): Promise<string[]> {
  const n = clampVariantCount(count);
  const runs = Array.from({ length: n }, (_, i) =>
    TransformText(
      projectName,
      cwd,
      params.cli,
      params.model,
      params.effort,
      params.fast,
      n === 1 ? instruction : variantInstruction(instruction, i, n),
      text,
    ),
  );
  const settled = await Promise.allSettled(runs);
  const ok = settled
    .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled")
    .map((r) => (typeof r.value === "string" ? r.value.trim() : ""))
    .filter((t) => t.length > 0);
  if (ok.length === 0) {
    const failed = settled.find((r) => r.status === "rejected");
    if (failed && failed.status === "rejected") throw failed.reason;
  }
  return ok;
}
