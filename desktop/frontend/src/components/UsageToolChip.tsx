import { providerMeta } from "../agentStatus";

// One agent CLI the sidebar usage meter can track, switched on or off.
export function UsageToolChip({
  provider,
  on,
  disabled = false,
  onToggle,
}: {
  provider: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const meta = providerMeta(provider);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on
          ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.5 }}
      />
      {meta.short}
    </button>
  );
}
