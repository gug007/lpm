import { Replace, ReplaceAll } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { TEXT_INPUT, fieldInputClass, sideButtonClass } from "./searchFieldStyles";

interface FilesSearchReplaceProps {
  value: string;
  onChange: (value: string) => void;
  // How many matches a Replace all would change; 0 turns it off.
  total: number;
  busy: boolean;
  onReplaceAll: () => void;
  regex: boolean;
}

// The replacement, under the query, with Replace all beside it; Enter in the
// field asks for Replace all too.
export function FilesSearchReplace({ value, onChange, total, busy, onReplaceAll, regex }: FilesSearchReplaceProps) {
  const canReplace = total > 0 && !busy;
  return (
    <div className="flex shrink-0 items-center gap-1 pl-8 pr-2 pt-1">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <Replace size={12} strokeWidth={1.8} />
        </span>
        <input
          {...TEXT_INPUT}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (canReplace) onReplaceAll();
          }}
          placeholder={regex ? "Replace, $1 for a group" : "Replace"}
          aria-label="Replace with"
          className={`${fieldInputClass(false)} pl-7 pr-2`}
        />
      </div>
      <Tooltip content={total > 0 ? `Replace all ${total.toLocaleString()}` : "Replace all"} side="bottom">
        <button
          type="button"
          onClick={onReplaceAll}
          disabled={!canReplace}
          aria-label="Replace all"
          className={sideButtonClass()}
        >
          <ReplaceAll size={14} strokeWidth={1.8} />
        </button>
      </Tooltip>
    </div>
  );
}
