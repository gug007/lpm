import { useRef, useState } from "react";
import { CancelAIGenerate } from "../../bridge/commands";
import { peerSlugOf, prefixName } from "../peer/markers";

// What the backend rejects a stopped run with. Callers stay silent on it: the
// user asked for the stop, so it isn't a failure worth reporting.
const AI_CANCELED = "canceled";

export function isCanceledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg === AI_CANCELED;
}

export interface AIGenerationRunner {
  /** Run one generation, handing it a fresh id the stop control can reap. */
  run<T>(fn: (genId: string) => Promise<T>): Promise<T>;
  /** Run a fan-out of `count` generations that are stopped together. */
  runAll<T>(count: number, fn: (genIds: string[]) => Promise<T>): Promise<T>;
  cancel(): void;
}

export interface AIGeneration extends AIGenerationRunner {
  generating: boolean;
}

/// One cancellable AI generation slot: mints the run's id, tracks it while it's
/// in flight, and turns a stop into a `canceled` rejection so callers can tell
/// it apart from a real failure even when the CLI managed to answer first.
/// `scope` is the project name or folder the generation runs in: a paired
/// machine's marks the ids, so a stop goes where the run is.
export function createAIGeneration(
  scope: () => string | null | undefined,
  onGenerating: (generating: boolean) => void = () => {},
): AIGenerationRunner {
  const live = new Set<string>();
  let stopped = false;
  const mintId = () => {
    const id = crypto.randomUUID();
    const slug = peerSlugOf(scope());
    return slug ? prefixName(slug, id) : id;
  };
  const track = async <T,>(ids: string[], fn: () => Promise<T>): Promise<T> => {
    ids.forEach((id) => live.add(id));
    stopped = false;
    onGenerating(true);
    try {
      const out = await fn();
      if (stopped) throw new Error(AI_CANCELED);
      return out;
    } finally {
      ids.forEach((id) => live.delete(id));
      if (live.size === 0) onGenerating(false);
    }
  };
  return {
    run: (fn) => {
      const id = mintId();
      return track([id], () => fn(id));
    },
    runAll: (count, fn) => {
      const ids = Array.from({ length: Math.max(1, count) }, mintId);
      return track(ids, () => fn(ids));
    },
    cancel: () => {
      if (live.size === 0) return;
      stopped = true;
      live.forEach((id) => {
        void CancelAIGenerate(id).catch(() => {});
      });
    },
  };
}

/// `createAIGeneration` for a component.
export function useAIGeneration(scope?: string | null): AIGeneration {
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [generating, setGenerating] = useState(false);
  const [runner] = useState(() => createAIGeneration(() => scopeRef.current, setGenerating));
  return { generating, ...runner };
}
