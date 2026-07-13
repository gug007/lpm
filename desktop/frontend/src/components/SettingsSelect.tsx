import { ChevronDown } from "lucide-react";

interface SettingsSelectProps {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
  "aria-label"?: string;
}

export function SettingsSelect({
  value,
  onChange,
  children,
  className,
  title,
  "aria-label": ariaLabel,
}: SettingsSelectProps) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={onChange}
        title={title}
        aria-label={ariaLabel}
        className={`appearance-none rounded-md border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-2.5 pr-7 text-xs text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[var(--text-muted)] focus-visible:border-[var(--accent-green)] focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/30 ${className ?? ""}`}
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
    </div>
  );
}
