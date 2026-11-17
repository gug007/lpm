import { ChevronDown } from "lucide-react";
import { CONFIG_INPUT } from "./configFormStyles";

export function ConfigSelect({
  value,
  onChange,
  options,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  invalid?: boolean;
}) {
  return (
    <span className="relative flex min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONFIG_INPUT} appearance-none truncate pr-8 ${
          invalid ? "!border-[var(--accent-red)] !text-[var(--accent-red-text)]" : ""
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />
    </span>
  );
}
