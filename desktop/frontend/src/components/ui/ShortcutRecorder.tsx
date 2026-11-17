import { Pencil } from "lucide-react";
import { parseShortcut, formatShortcut } from "../../shortcutParse";
import { useShortcutCapture } from "../../hooks/useShortcutCapture";
import type { CaptureResult } from "../../shortcutRecord";
import { SHORTCUT_BOX } from "../settings/shortcutBox";
import { ShortcutKeys } from "../settings/ShortcutKeys";

interface ShortcutRecorderProps {
  value: string;
  onChange: (next: string) => void;
  reserved?: ReadonlySet<string>;
  // Reads a key press while recording; lpm's own shortcuts by default.
  capture?: (event: KeyboardEvent) => CaptureResult;
  // What the button says for `value`.
  label?: (value: string) => string;
  // Drawn faded, as while the feature it opens is off.
  dimmed?: boolean;
}

function shortcutLabel(value: string): string {
  const parsed = value ? parseShortcut(value) : null;
  return parsed ? formatShortcut(parsed) : "";
}

export function ShortcutRecorder({
  value,
  onChange,
  reserved,
  capture,
  label = shortcutLabel,
  dimmed = false,
}: ShortcutRecorderProps) {
  const { recording, hint, toggle } = useShortcutCapture({ reserved, capture, onCapture: onChange });
  const text = label(value);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-label={recording ? "Press the new keys" : `Change shortcut${text ? `, now ${text}` : ""}`}
        className={`group ${SHORTCUT_BOX} bg-[var(--bg-primary)] transition-colors ${
          recording
            ? "border-[var(--accent-cyan)]"
            : "border-[var(--border)] hover:border-[var(--text-muted)]"
        } ${dimmed && !recording ? "opacity-55" : ""}`}
      >
        {recording ? (
          <span className="px-1 text-[12px] font-medium text-[var(--text-secondary)]">Press keys…</span>
        ) : text ? (
          <ShortcutKeys label={text} />
        ) : (
          <span className="px-1 text-[12px] font-medium text-[var(--text-secondary)]">Set shortcut</span>
        )}
        {!recording && (
          <Pencil
            size={12}
            aria-hidden
            className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]"
          />
        )}
      </button>
      {hint && <span className="text-[11px] text-[var(--text-error,#e15252)]">{hint}</span>}
    </div>
  );
}
