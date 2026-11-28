// AI rewrites of a tab's prompt ("Refine with AI"). One lives here rather than
// in the composer, which is swapped out whenever another terminal's takes its
// place: the rewrite carries on meanwhile, and the composer picks it up, still
// running or already answered, when it's back. Keyed by the tab's history key,
// which outlasts the terminal id a rebuilt project view hands the tab.

import { create } from "zustand";
import { rewriteWithAction } from "../composerVariants";
import { createAIGeneration } from "../hooks/useAIGeneration";
import type { AIPicker } from "../hooks/useAIPicker";
import type { ComposerAction } from "./composerActions";

// What the AI came back with: one rewrite to put in the field, several to
// choose from, or nothing (stopped, failed or empty, each already reported).
export type RewriteOutcome =
  | { kind: "text"; text: string }
  | { kind: "variants"; list: string[] }
  | { kind: "none" };

export interface ComposerRewrite {
  // The action asked for, named over the rewrites to choose from.
  label: string;
  // The prompt the text came from, and its attachments when it was sent.
  promptId: string;
  images: Record<string, string>;
  // Null while the AI is still writing.
  outcome: RewriteOutcome | null;
  // Stops the AI; the outcome then arrives as nothing.
  stop: () => void;
}

export interface RewriteRequest {
  projectName: string | null;
  cwd: string;
  ai: AIPicker;
  action: ComposerAction;
  value: string;
  count: number;
  promptId: string;
  images: Record<string, string>;
}

const useComposerRewrites = create<{ rewrites: Record<string, ComposerRewrite> }>(() => ({
  rewrites: {},
}));

function put(tabKey: string, rewrite: ComposerRewrite | null): void {
  useComposerRewrites.setState(({ rewrites }) => {
    const { [tabKey]: _, ...rest } = rewrites;
    return { rewrites: rewrite ? { ...rest, [tabKey]: rewrite } : rest };
  });
}

export function composerRewriteOf(tabKey: string): ComposerRewrite | null {
  return useComposerRewrites.getState().rewrites[tabKey] ?? null;
}

export function startComposerRewrite(tabKey: string, request: RewriteRequest): void {
  if (composerRewriteOf(tabKey)) return;
  const { action, promptId, images, ...run } = request;
  const { projectName } = run;
  const gen = createAIGeneration(() => projectName);
  const rewrite: ComposerRewrite = { label: action.label, promptId, images, outcome: null, stop: gen.cancel };
  let outcome: RewriteOutcome = { kind: "none" };
  put(tabKey, rewrite);
  void rewriteWithAction({
    ...run,
    gen,
    action,
    onText: (text) => {
      outcome = { kind: "text", text };
    },
    onVariants: (list) => {
      outcome = { kind: "variants", list };
    },
  }).then(() => {
    // Ended meanwhile (its tab was closed): nobody is waiting for the answer.
    if (composerRewriteOf(tabKey) === rewrite) put(tabKey, { ...rewrite, outcome });
  });
}

// Takes the rewrite off the tab and hands it back, stopping the AI if it is
// still writing. Null when there was none, so an answer is used only once.
export function endComposerRewrite(tabKey: string): ComposerRewrite | null {
  const rewrite = composerRewriteOf(tabKey);
  if (!rewrite) return null;
  rewrite.stop();
  put(tabKey, null);
  return rewrite;
}

export function useComposerRewrite(tabKey: string): ComposerRewrite | null {
  return useComposerRewrites((s) => s.rewrites[tabKey] ?? null);
}
