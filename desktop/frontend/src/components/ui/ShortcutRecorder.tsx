import { parseShortcut, formatShortcut } from "../../shortcutParse";
import { useShortcutCapture } from "../../hooks/useShortcutCapture";
import type { CaptureResult } from "../../shortcutRecord";

interface ShortcutRecorderProps {
  value: string;
  onChange: (next: string) => void;
  reserved?: ReadonlySet<string>;
  // Reads a key press while recording; lpm's own shortcuts by default.
  capture?: (event: KeyboardEvent) => CaptureResult;
  // What the button says for `value`.
  label?: (value: string) => string;
}

function shortcutLabel(value: string): string {
  const parsed = value ? parseShortcut(value) : null;
  return parsed ? formatShortcut(parsed) : "Set shortcut";
}

export function ShortcutRecorder({ value, onChange, reserved, capture, label = shortcutLabel }: ShortcutRecorderProps) {
  const { recording, hint, toggle } = useShortcutCapture({ reserved, capture, onCapture: onChange });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        className={`min-w-[7rem] rounded-md border px-3 py-1.5 text-center text-[13px] font-medium transition-colors ${
          recording
            ? "border-[var(--accent-cyan)] bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--text-muted)]"
        }`}
      >
        {recording ? "Press keys…" : label(value)}
      </button>
      {hint && <span className="text-[11px] text-[var(--text-error,#e15252)]">{hint}</span>}
    </div>
  );
}
