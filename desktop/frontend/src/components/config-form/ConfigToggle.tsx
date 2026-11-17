import { Toggle } from "../ui/Toggle";

export function ConfigToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 self-start">
      <Toggle enabled={checked} onChange={onChange} aria-label={label} />
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
    </label>
  );
}
