import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { INSET_FOCUS } from "./dialog-styles";

export default function DialogSwitchRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] ${INSET_FOCUS}`}
    >
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          checked
            ? "bg-[#22d3ee]/15 text-[var(--accent-cyan)]"
            : "bg-[var(--bg-active)] text-[var(--text-muted)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          id={`${id}-title`}
          className="block text-[13px] font-medium text-[var(--text-primary)]"
        >
          {title}
        </span>
        <span
          id={`${id}-desc`}
          className="block text-[12px] leading-snug text-[var(--text-muted)]"
        >
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors forced-color-adjust-none forced-colors:border forced-colors:border-[CanvasText] ${
          checked
            ? "bg-[var(--accent-cyan)] forced-colors:bg-[Highlight]"
            : "bg-[var(--bg-active)] forced-colors:bg-[Canvas]"
        }`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white transition-transform forced-colors:left-0.5 forced-colors:top-0.5 ${
            checked
              ? "translate-x-3.5 forced-colors:bg-[HighlightText]"
              : "forced-colors:bg-[CanvasText]"
          }`}
        />
      </span>
    </button>
  );
}
