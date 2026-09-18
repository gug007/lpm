"use client";

import type { ReactNode } from "react";
import { Files, GitBranch } from "lucide-react";
import { SegmentedControl } from "./ui-kit";

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
export function FilesViewSwitch({
  changesOnly,
  count,
  onChange,
}: {
  changesOnly: boolean;
  count: number;
  onChange: (changesOnly: boolean) => void;
}) {
  const badge = count ? (
    <span
      className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-[#b3b3b3] ${
        changesOnly ? "bg-[#242424]" : "bg-[#333333]"
      }`}
    >
      {count}
    </span>
  ) : null;
  return (
    <div className="shrink-0 px-2 pt-2">
      <SegmentedControl<"all" | "changes">
        value={changesOnly ? "changes" : "all"}
        options={[
          {
            value: "all",
            label: segment(<Files className="h-3.5 w-3.5" strokeWidth={1.6} />, "Files"),
          },
          {
            value: "changes",
            label: segment(
              <GitBranch className="h-3.5 w-3.5" strokeWidth={1.6} />,
              "Changes",
              badge,
            ),
          },
        ]}
        onChange={(view) => onChange(view === "changes")}
        fullWidth
        ariaLabel="Files view"
      />
    </div>
  );
}
