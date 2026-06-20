import type { ReactNode } from "react";
import { Switch } from "./ui/Switch";

interface SwitchRowProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
}

export function SwitchRow({
  checked,
  onChange,
  icon,
  title,
  description,
}: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          checked
            ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
            : "bg-[var(--bg-active)] text-[var(--text-muted)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block text-[12px] leading-snug text-[var(--text-muted)]">
          {description}
        </span>
      </span>
      <Switch checked={checked} />
    </button>
  );
}
