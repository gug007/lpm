import { Columns2, Rows2 } from "lucide-react";
import { SwitchRow } from "./SwitchRow";
import { SegmentedControl } from "./ui/SegmentedControl";
import { MAX_SIDE_BY_SIDE, type SideBySideLayout } from "../sideBySide";

const LAYOUTS = [
  { value: "columns", label: "Columns" },
  { value: "rows", label: "Rows" },
] as const;

interface SideBySideOptionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  layout: SideBySideLayout;
  onLayoutChange: (layout: SideBySideLayout) => void;
}

export function SideBySideOption({
  enabled,
  onEnabledChange,
  layout,
  onLayoutChange,
}: SideBySideOptionProps) {
  const rows = layout === "rows";
  return (
    <>
      <SwitchRow
        checked={enabled}
        onChange={onEnabledChange}
        icon={rows ? <Rows2 size={18} /> : <Columns2 size={18} />}
        title="Open side by side"
        description={`Show the runs ${rows ? "one above the other" : "next to each other"} as the copies are created (up to ${MAX_SIDE_BY_SIDE}).`}
      />
      {enabled && (
        <div className="flex items-center justify-between gap-3 pb-3 pl-[60px] pr-4">
          <span className="text-[12px] text-[var(--text-muted)]">Split into</span>
          <SegmentedControl
            value={layout}
            options={LAYOUTS}
            onChange={onLayoutChange}
            ariaLabel="Side by side layout"
          />
        </div>
      )}
    </>
  );
}
