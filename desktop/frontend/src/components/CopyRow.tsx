import { ChevronDown } from "lucide-react";
import { CopyRunConfig } from "./CopyRunConfig";
import type { ComposerHistory } from "./InputComposer";
import { FIELD_CLASS } from "./ui/fields";
import type { ActionInfo, CopyOverride, CopyRunMode } from "../types";

interface CopyRowProps {
  index: number;
  label: string;
  onLabelChange: (value: string) => void;
  override: CopyOverride | null;
  summary: string;
  expanded: boolean;
  onToggleExpand: () => void;
  actions: ActionInfo[];
  onChangeMode: (mode: CopyRunMode) => void;
  onPatchOverride: (patch: Partial<CopyOverride>) => void;
  history?: ComposerHistory;
  aiCwd?: string;
  autoFocus?: boolean;
}

export function CopyRow({
  index,
  label,
  onLabelChange,
  override,
  summary,
  expanded,
  onToggleExpand,
  actions,
  onChangeMode,
  onPatchOverride,
  history,
  aiCwd,
  autoFocus,
}: CopyRowProps) {
  return (
    <div className="grid grid-cols-[1rem_1fr_6.5rem] items-center gap-2.5">
      <span className="text-right text-[12px] tabular-nums text-[var(--text-muted)]">
        {index + 1}
      </span>
      <input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Auto-named"
        className={`${FIELD_CLASS} h-9 px-3`}
      />
      <button
        type="button"
        onClick={onToggleExpand}
        title={`Run on this copy — ${summary}`}
        className={`flex w-full items-center justify-end gap-1 text-[12px] font-medium transition-colors ${
          override
            ? "text-[var(--accent-cyan)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="col-span-3 ml-[1.625rem] mb-1 mt-2">
          <CopyRunConfig
            actions={actions}
            override={override}
            onChangeMode={onChangeMode}
            onPatchOverride={onPatchOverride}
            history={history}
            aiCwd={aiCwd}
          />
        </div>
      )}
    </div>
  );
}
