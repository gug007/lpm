import { useEffect, useRef } from "react";

interface DictationTryFieldProps {
  shortcutLabel: string | null;
  onReady: (field: HTMLInputElement) => void;
}

/** A field to try dictation in from Settings: it takes focus and recording
 *  starts into it straight away. */
export function DictationTryField({ shortcutLabel, onReady }: DictationTryFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    if (ref.current) ready.current(ref.current);
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      aria-label="Try dictation"
      placeholder={`Say something, then press ${shortcutLabel ?? "↵"} to insert it`}
      className="mt-2.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]/60"
    />
  );
}
