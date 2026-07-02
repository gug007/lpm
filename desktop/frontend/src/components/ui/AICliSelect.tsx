import { useEffect, useState } from "react";
import { CheckAICLIs } from "../../../bridge/commands";
import { AI_CLI_OPTIONS, type AICLI } from "../../types";
import { ChevronDownIcon } from "../icons";

interface AICliSelectProps {
  value: AICLI;
  onChange: (cli: AICLI) => void;
}

export function AICliSelect({ value, onChange }: AICliSelectProps) {
  const [available, setAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    CheckAICLIs()
      .then((a) => {
        if (cancelled) return;
        setAvailable({
          claude: a.claude,
          codex: a.codex,
          gemini: a.gemini,
          opencode: a.opencode,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AICLI)}
        className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 pr-9 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none"
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
