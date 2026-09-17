import type { ReactNode } from "react";
import { Files } from "lucide-react";
import { SourceControlIcon } from "../icons";
import { SegmentedControl } from "../ui/SegmentedControl";

type View = "all" | "changes";

interface FilesViewSwitchProps {
  changesOnly: boolean;
  // How many files are uncommitted, or null while that is unknown.
  count: number | null;
  onChange: (changesOnly: boolean) => void;
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
// tree shows before switching.
export function FilesViewSwitch({ changesOnly, count, onChange }: FilesViewSwitchProps) {
  const badge = count ? (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-[var(--text-secondary)] ${
        changesOnly ? "bg-[var(--bg-secondary)]" : "bg-[var(--bg-active)]"
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
  ];
  return (
    <div className="shrink-0 px-2 pt-2">
      <SegmentedControl<View>
        value={changesOnly ? "changes" : "all"}
        options={options}
        onChange={(view) => onChange(view === "changes")}
        variant="subtle"
        fullWidth
        ariaLabel="Files view"
      />
    </div>
  );
}
