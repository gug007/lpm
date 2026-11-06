import { TransformText } from "../bridge/commands";
import { isCanceledError, type AIGeneration } from "./hooks/useAIGeneration";
import { toast } from "./notifications/toast";
import type { ComposerAction } from "./store/composerActions";
import { getSettings } from "./store/settings";
import { aiEffectiveEffort, aiEffectiveFast, type AICLI } from "./types";
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
  return {
    cli,
    model,
    effort: aiEffectiveEffort(cli, model, effort),
    fast: aiEffectiveFast(cli, model, fast),
  };
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
// every run fails do we surface the first error to the caller. `genIds` carries
// one id per run so the caller's stop control can reap the whole fan-out.
export async function generateVariants(
  projectName: string | null,
  cwd: string,
  params: TransformParams,
  instruction: string,
  text: string,
  count: number,
  genIds: string[] = [],
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
      genIds[i] ?? "",
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

interface ActionRewrite {
  gen: AIGeneration;
  projectName: string | null;
  cwd: string;
  ai: AIPicker;
  action: ComposerAction;
  value: string;
  count: number;
  onText: (text: string) => void;
  onVariants: (list: string[]) => void;
}

// Runs a composer action over `value`: one rewrite goes to `onText`, several to
// `onVariants`. An empty answer or a failure reads as a toast; a stop is silent.
export async function rewriteWithAction({
  gen,
  projectName,
  cwd,
  ai,
  action,
  value,
  count,
  onText,
  onVariants,
}: ActionRewrite): Promise<void> {
  try {
    const params = resolveTransformParams(ai);
    if (count <= 1) {
      const out = await gen.run((genId) =>
        TransformText(
          projectName,
          cwd,
          params.cli,
          params.model,
          params.effort,
          params.fast,
          action.instruction,
          value,
          genId,
        ),
      );
      const text = typeof out === "string" ? out.trim() : "";
      if (text) onText(text);
      else toast.error("AI returned an empty response");
    } else {
      const list = await gen.runAll(count, (genIds) =>
        generateVariants(projectName, cwd, params, action.instruction, value, count, genIds),
      );
      if (list.length > 0) onVariants(list);
      else toast.error("AI returned an empty response");
    }
  } catch (err) {
    if (!isCanceledError(err)) toast.error(`Action failed: ${err}`);
  }
}
