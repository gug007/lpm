import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { SettingsSearchEntry } from "../settings-registry";
import { SettingsSearchResults } from "./SettingsSearchResults";

interface SettingsSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: SettingsSearchEntry[];
  onActivate: (entry: SettingsSearchEntry) => void;
}

export function SettingsSearch({
  query,
  onQueryChange,
  results,
  onActivate,
}: SettingsSearchProps) {
  const active = query.trim() !== "";
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const clampedSelected = Math.min(selected, Math.max(results.length - 1, 0));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        onQueryChange("");
      }
      return;
    }
    if (!active || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[clampedSelected];
      if (entry) onActivate(entry);
    }
  };

  return (
    <div className="mb-3">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search settings"
          spellCheck={false}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-8 pr-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--text-primary)]/40"
        />
      </div>
      {active && (
        <div className="mt-2">
          <SettingsSearchResults
            results={results}
            selectedIndex={clampedSelected}
            onActivate={onActivate}
            onHover={setSelected}
          />
        </div>
      )}
    </div>
  );
}
