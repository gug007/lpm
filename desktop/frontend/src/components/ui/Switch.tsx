// Presentational toggle track. The on-state is the modal's single accent moment
// for this control, so cyan reads as "this is on". The parent button owns the
// click and the switch role/state, so this stays purely visual.
export function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
        checked ? "bg-[var(--accent-cyan)]" : "bg-[var(--bg-active)]"
      }`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? "translate-x-3.5" : ""
        }`}
      />
    </span>
  );
}
