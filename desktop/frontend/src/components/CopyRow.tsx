import { ChevronDown } from "lucide-react";
import { CopyRunConfig } from "./CopyRunConfig";
import { CopyMacSelect, type CopyTargetOption } from "./CopyMacSelect";
import type { ComposerHistory } from "./InputComposer";
import { FIELD_CLASS } from "./ui/fields";
import type { ActionInfo, CopyOverride, CopyRunMode } from "../types";

// Focus a label input pre-filled with an auto-name (`<project>-<id6>`),
// selecting the random suffix so typing replaces just that part while keeping
// the project prefix — e.g. `lpm-ewr7we` → `lpm-task-name`. Module-level so
// its identity is stable when used directly as a ref.
export function focusLabelSuffix(el: HTMLInputElement | null) {
  if (!el) return;
  el.focus();
  const n = el.value.length;
  if (/-[A-Za-z0-9]{6}$/.test(el.value)) el.setSelectionRange(n - 6, n);
}

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
  targets?: CopyTargetOption[];
  target?: string;
  onTargetChange?: (name: string) => void;
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
  targets,
  target,
  onTargetChange,
  history,
  aiCwd,
  autoFocus,
}: CopyRowProps) {
  const showTargets = targets !== undefined && targets.length > 1 && onTargetChange !== undefined;
  return (
    <div className="grid grid-cols-[1rem_1fr_6.5rem] items-center gap-2.5">
      <span className="text-right text-[12px] tabular-nums text-[var(--text-muted)]">
        {index + 1}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          ref={autoFocus ? focusLabelSuffix : undefined}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Auto-named"
          className={`${FIELD_CLASS} h-9 min-w-0 flex-1 px-3`}
        />
        {showTargets && (
          <CopyMacSelect
            options={targets}
            value={target ?? targets[0].name}
            onChange={onTargetChange}
          />
        )}
      </div>
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
