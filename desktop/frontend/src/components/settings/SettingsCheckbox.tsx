import { CheckboxInput } from "./CheckboxInput";

export function SettingsCheckbox({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}) {
  return (
    <label
      title={title}
      className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      <CheckboxInput checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
