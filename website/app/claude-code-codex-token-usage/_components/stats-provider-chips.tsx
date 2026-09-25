import { PROVIDERS, PROVIDER_META, type Provider } from "./stats-sample-data";

export default function StatsProviderChips({
  hidden,
  onToggle,
}: {
  hidden: ReadonlySet<Provider>;
  onToggle: (provider: Provider) => void;
}) {
  return (
    <div role="group" aria-label="Tools in the chart" className="flex items-center gap-1">
      {PROVIDERS.map((provider) => {
        const meta = PROVIDER_META[provider];
        const on = !hidden.has(provider);
        const locked = on && hidden.size === PROVIDERS.length - 1;
        return (
          <button
            key={provider}
            type="button"
            aria-pressed={on}
            aria-disabled={locked || undefined}
            title={locked ? "Keep at least one tool visible" : undefined}
            onClick={() => {
              if (!locked) onToggle(provider);
            }}
            className={`flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition-colors duration-[120ms] ${
              on
                ? "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--text-secondary)]"
                : "text-[var(--text-muted)] line-through hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.4 }}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
