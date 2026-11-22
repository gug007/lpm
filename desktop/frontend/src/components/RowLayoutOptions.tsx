import type { ChangesSince, SidebarRowLayout } from "../sidebarRowLayout";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Toggle } from "./ui/Toggle";

type Options = Pick<SidebarRowLayout, "hideDefaultBranch" | "changesSince" | "prStateWord" | "checksOnlyFailing">;

interface RowLayoutOptionsProps {
  options: Options;
  onChange: (patch: Partial<Options>) => void;
}

const SINCE: { value: ChangesSince; label: string }[] = [
  { value: "commit", label: "Last commit" },
  { value: "branch", label: "Branch start" },
];

function ToggleRow({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-[12.5px] text-[var(--text-secondary)]">
      {label}
      <Toggle aria-label={label} enabled={enabled} onChange={onChange} />
    </label>
  );
}

/** How some details read: the default branch, what changes count from. */
export function RowLayoutOptions({ options, onChange }: RowLayoutOptionsProps) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-2">
      <ToggleRow
        label="Hide the default branch"
        enabled={options.hideDefaultBranch}
        onChange={(hideDefaultBranch) => onChange({ hideDefaultBranch })}
      />
      <div className="flex min-h-8 items-center justify-between gap-3 text-[12.5px] text-[var(--text-secondary)]">
        Changes since
        <SegmentedControl
          ariaLabel="Changes since"
          value={options.changesSince}
          options={SINCE}
          onChange={(changesSince) => onChange({ changesSince })}
        />
      </div>
      <ToggleRow
        label="Name a pull request's state"
        enabled={options.prStateWord}
        onChange={(prStateWord) => onChange({ prStateWord })}
      />
      <ToggleRow
        label="Checks only when not passing"
        enabled={options.checksOnlyFailing}
        onChange={(checksOnlyFailing) => onChange({ checksOnlyFailing })}
      />
    </div>
  );
}
