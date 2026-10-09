/** The on/off switch Settings rows use. */
export function Toggle({
  enabled,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex disabled:cursor-not-allowed disabled:opacity-50 h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] ${
        enabled ? "bg-[var(--accent-green)]" : "bg-[var(--bg-active)]"
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-out ${
          enabled ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
