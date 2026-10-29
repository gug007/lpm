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
      className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-[var(--text-secondary)]"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] cursor-pointer accent-[var(--accent-blue)]"
      />
      {label}
    </label>
  );
}
