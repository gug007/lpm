import { useRef, useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { SKILL_SORTS, type SkillSort } from "./skillUsage";

interface SkillSortButtonProps {
  sort: SkillSort;
  onSort: (sort: SkillSort) => void;
}

// The order skills are listed in within each folder: by name, or by how
// recently or how often they ran.
export function SkillSortButton({ sort, onSort }: SkillSortButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const label = SKILL_SORTS.find((s) => s.value === sort)?.label ?? "Name";
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Sort: ${label}`}
        aria-label={`Sort skills: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
          sort === "name" ? "text-[var(--text-muted)]" : "text-[var(--accent-cyan)]"
        }`}
      >
        <ArrowUpDown size={12} />
      </button>
      {open && ref.current && (
        <ContextMenuShell anchor={ref.current} trigger={ref.current} align="end" onClose={() => setOpen(false)}>
          <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Sort by
          </div>
          {SKILL_SORTS.map((s) => (
            <ContextMenuItem
              key={s.value}
              label={s.label}
              trailing={s.value === sort ? <Check size={11} /> : undefined}
              onClick={() => {
                setOpen(false);
                onSort(s.value);
              }}
            />
          ))}
        </ContextMenuShell>
      )}
    </>
  );
}
