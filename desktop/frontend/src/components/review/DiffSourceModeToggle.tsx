import { SegmentedControl } from "../ui/SegmentedControl";
import { REVIEW_MODES, REVIEW_SOURCES, type ReviewMode } from "./reviewSource";

const OPTIONS = REVIEW_MODES.map((m) => ({ value: m, label: REVIEW_SOURCES[m].label }));

interface DiffSourceModeToggleProps {
  mode: ReviewMode;
  onChange: (mode: ReviewMode) => void;
}

export function DiffSourceModeToggle({ mode, onChange }: DiffSourceModeToggleProps) {
  return (
    <SegmentedControl
      value={mode}
      options={OPTIONS}
      onChange={onChange}
      variant="subtle"
      ariaLabel="Change source"
    />
  );
}
