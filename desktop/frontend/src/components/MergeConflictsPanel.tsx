import type { useAIPicker } from "../hooks/useAIPicker";
import type { MergeConflicts } from "../hooks/useMergeConflicts";
import { openConflictFile } from "../conflictFileOpen";
import { progressLabel, remainingFiles } from "../mergeConflicts";
import { AIPickerButton } from "./ui/AIPickerButton";
import { ConflictFileRow } from "./ConflictFileRow";

interface MergeConflictsPanelProps {
  projectPath: string;
  conflicts: MergeConflicts;
  interactive: boolean;
  aiBusy: boolean;
  progressLine: string;
  ai: ReturnType<typeof useAIPicker>;
  onResolveWithAI: () => void;
  onCancelAI: () => void;
  onAbort: () => void;
  onContinue: () => void;
  onDone: () => void;
}

export function MergeConflictsPanel({
  projectPath,
  conflicts,
  interactive,
  aiBusy,
  progressLine,
  ai,
  onResolveWithAI,
  onCancelAI,
  onAbort,
  onContinue,
  onDone,
}: MergeConflictsPanelProps) {
  const { state, sides, pending } = conflicts;
  if (!state) return null;
  const remaining = remainingFiles(state).length;
  const total = state.files.length;
  const resolvedPct = total ? ((total - remaining) / total) * 100 : 0;
  const locked = !interactive || pending !== null;
  const legacy = !!state.legacy;

  return (
    <>
      <div className="px-4 pt-3">
        <p className="text-[11px] text-[var(--text-muted)]">{progressLabel(state)}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
          <div
            className="h-full rounded-full bg-[var(--accent-green)] transition-[width] duration-300"
            style={{ width: `${resolvedPct}%` }}
          />
        </div>
      </div>
      <ul className="max-h-[260px] overflow-y-auto py-2">
        {state.files.map((f) => (
          <ConflictFileRow
            key={f.path}
            file={f}
            side={sides.get(f.path)}
            legacy={legacy}
            disabled={locked}
            onOpen={() => openConflictFile(projectPath, f.path, f.firstLine)}
            onTakeSide={(side) => conflicts.takeSide(f.path, side)}
            onMarkResolved={() => conflicts.markResolved(f.path)}
          />
        ))}
      </ul>
      {aiBusy && progressLine && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span className="line-clamp-2">{progressLine}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
        <button
          onClick={onAbort}
          disabled={locked}
          className="text-[12px] text-[var(--accent-red)] transition-colors hover:underline disabled:opacity-40"
        >
          Abort merge
        </button>
        <div className="flex items-center gap-2">
          {(remaining > 0 || aiBusy) &&
            (ai.anyAvailable || aiBusy ? (
              <AIPickerButton
                onGenerate={onResolveWithAI}
                onCancel={onCancelAI}
                generating={aiBusy}
                disabled={aiBusy || locked}
                title={`Resolve with ${ai.cliLabel}`}
                label={`Resolve ${remaining} with AI`}
                generatingLabel="Resolving…"
                aiCLIs={ai.aiCLIs}
                selectedCLI={ai.selectedCLI}
                selectedModel={ai.selectedModel}
                selectedEffort={ai.selectedEffort}
                selectedFast={ai.selectedFast}
                onSelect={ai.selectAI}
                onSelectEffort={ai.selectEffort}
                onSelectFast={ai.selectFast}
              />
            ) : (
              <span className="text-[11px] text-[var(--text-muted)]">
                Install Claude Code, Codex, Gemini, or OpenCode to resolve with AI
              </span>
            ))}
          <button
            onClick={state.merging ? onContinue : onDone}
            disabled={remaining > 0 || locked}
            title={remaining > 0 ? "Resolve every file first" : undefined}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
          >
            {!state.merging ? "Done" : pending === "" ? "Continuing…" : "Continue merge"}
          </button>
        </div>
      </div>
    </>
  );
}
