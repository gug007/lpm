import type { ReactNode } from "react";
import { Files, TextSearch } from "lucide-react";
import { chordLabel, type Chord } from "../../keys";
import { SourceControlIcon } from "../icons";
import { SegmentedControl } from "../ui/SegmentedControl";

export type RailView = "all" | "changes" | "search";

export const SEARCH_FILES_CHORD: Chord = { key: "f", meta: true, shift: true };

interface FilesViewSwitchProps {
  view: RailView;
  // How many files are uncommitted, or null while that is unknown.
  count: number | null;
  onChange: (view: RailView) => void;
  // Offers the Search view as a third segment.
  searchable?: boolean;
}

function segment(icon: ReactNode, text: string, badge?: ReactNode) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      {icon}
      {text}
      {badge}
    </span>
  );
}

// The rail's view switch. The Changes segment carries the count, so a dirty
// tree shows before switching; Search is an icon, leaving the other two their
// width.
export function FilesViewSwitch({ view, count, onChange, searchable = false }: FilesViewSwitchProps) {
  const badge = count ? (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-[var(--text-secondary)] ${
        view === "changes" ? "bg-[var(--bg-secondary)]" : "bg-[var(--bg-active)]"
      }`}
    >
      {count}
    </span>
  ) : null;
  const options = [
    { value: "all" as const, label: segment(<Files size={14} strokeWidth={1.6} />, "Files") },
    {
      value: "changes" as const,
      label: segment(<SourceControlIcon size={14} />, "Changes", badge),
    },
    ...(searchable
      ? [
          {
            value: "search" as const,
            label: (
              <span className="inline-flex items-center justify-center">
                <TextSearch size={14} strokeWidth={1.6} aria-hidden />
                <span className="sr-only">Search</span>
              </span>
            ),
            tooltip: `Search in files (${chordLabel(SEARCH_FILES_CHORD)})`,
            grow: false,
          },
        ]
      : []),
  ];
  return (
    <div className="shrink-0 px-2 pt-2">
      <SegmentedControl<RailView>
        value={view}
        options={options}
        onChange={onChange}
        variant="subtle"
        fullWidth
        ariaLabel="Files view"
      />
    </div>
  );
}
