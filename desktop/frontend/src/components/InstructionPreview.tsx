import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TEXT_ACTION } from "./ui/buttons";

const SHOWN_LINES = 3;
// A preview this short shows whole rather than hiding a line or two.
const WHOLE_UP_TO = 5;

// The instructions a section follows, quoted under its row: whole when short,
// otherwise the first lines with a Show all that opens the rest in place.
export function InstructionPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const folds = lines.length > WHOLE_UP_TO;
  const shown = folds && !expanded ? lines.slice(0, SHOWN_LINES) : lines;
  return (
    <div className="mt-2.5">
      <div className="flex flex-col border-l-2 border-[var(--border)] pl-3 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
        {shown.map((line, i) => (
          <span key={i} className={expanded ? "break-words" : "truncate"}>
            {line}
          </span>
        ))}
      </div>
      {folds && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={`${TEXT_ACTION} -ml-1.5 mt-1`}>
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
          <ChevronDown size={12} strokeWidth={2} className={expanded ? "rotate-180" : ""} />
        </button>
      )}
    </div>
  );
}
