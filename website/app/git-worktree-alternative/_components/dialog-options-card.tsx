import DialogCollapsible from "./dialog-collapsible";
import DialogSwitchRow from "./dialog-switch-row";
import {
  OPTION_ROWS,
  copyRef,
  optionsSummary,
  type DuplicateOptions,
  type OptionKey,
} from "./dialog-data";

export default function DialogOptionsCard({
  count,
  options,
  onOptionChange,
  open,
  onToggle,
}: {
  count: number;
  options: DuplicateOptions;
  onOptionChange: (key: OptionKey, value: boolean) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const ref = copyRef(count);
  return (
    <DialogCollapsible
      title="Options"
      summary={optionsSummary(options)}
      open={open}
      onToggle={onToggle}
    >
      <div className="divide-y divide-[var(--border)]">
        {OPTION_ROWS.map((row) => (
          <DialogSwitchRow
            key={row.key}
            icon={row.icon}
            title={row.title}
            description={row.description(ref)}
            checked={options[row.key]}
            onChange={(value) => onOptionChange(row.key, value)}
          />
        ))}
      </div>
    </DialogCollapsible>
  );
}
