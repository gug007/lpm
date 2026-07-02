import { AI_CLI_OPTIONS, type AICLI } from "../../types";
import { useAIPicker } from "../../hooks/useAIPicker";
import { ChevronDownIcon } from "../icons";

interface AICliSelectProps {
  value: AICLI;
  onChange: (cli: AICLI) => void;
}

export function AICliSelect({ value, onChange }: AICliSelectProps) {
  const { aiCLIs: available } = useAIPicker(true);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AICLI)}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] pl-3 pr-9 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
      >
        {AI_CLI_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {available[o.value] === false ? `${o.label} — not installed` : o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
        <ChevronDownIcon />
      </span>
    </div>
  );
}
