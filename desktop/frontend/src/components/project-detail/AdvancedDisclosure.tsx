import { useEffect, useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";

// Collapsible "Advanced" section for the rarely-used action fields. Starts open
// when the fields already hold a value (editing an action, or a template/AI
// fill) and auto-opens if a value appears later, but never fights a manual
// collapse for the value already present.
export function AdvancedDisclosure({
  hasValue,
  children,
}: {
  hasValue: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(hasValue);

  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  return (
    <div className="border-t border-[var(--border)] pt-5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        Advanced
      </button>
      {expanded && <div className="mt-5 space-y-7">{children}</div>}
    </div>
  );
}
