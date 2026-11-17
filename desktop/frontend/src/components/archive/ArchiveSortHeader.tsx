import { ChevronDown } from "lucide-react";
import type { ArchiveSort } from "../../projectArchive";

/** A column heading that sorts the list by its column; the one in use carries
 *  the arrow. */
export function ArchiveSortHeader({
  id,
  label,
  sort,
  onSort,
}: {
  id: ArchiveSort;
  label: string;
  sort: ArchiveSort;
  onSort: (id: ArchiveSort) => void;
}) {
  const active = sort === id;
  return (
    <button
      type="button"
      onClick={() => onSort(id)}
      aria-pressed={active}
      title={`Sort by ${label.toLowerCase()}`}
      className={`-mx-1 flex w-fit items-center gap-1 rounded px-1 uppercase tracking-[inherit] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
        active ? "text-[var(--text-primary)]" : ""
      }`}
    >
      {label}
      <ChevronDown size={11} className={active ? "" : "opacity-0"} aria-hidden />
    </button>
  );
}
