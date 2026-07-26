import type { KeyboardEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import type { BringMode } from "../bringChangesApi";

export interface BringModeOption {
  value: BringMode;
  title: string;
  description: string;
  icon: ReactNode;
  // Set when the option can't be picked; shown in place of the description.
  blockedReason?: string;
}

interface BringModeCardsProps {
  options: BringModeOption[];
  value: BringMode;
  onChange: (mode: BringMode) => void;
}

export function BringModeCards({ options, value, onChange }: BringModeCardsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    let next = index;
    for (let i = 0; i < options.length; i++) {
      next = (next + step + options.length) % options.length;
      if (!options[next].blockedReason) break;
    }
    if (next === index || options[next].blockedReason) return;
    event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
      .item(next)
      ?.focus();
    onChange(options[next].value);
  };

  return (
    <div role="radiogroup" aria-label="Where the changes land" className="grid gap-2">
      {options.map((option, index) => {
        const active = option.value === value;
        const blocked = Boolean(option.blockedReason);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={blocked}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cyan)]/35 disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/8 shadow-[0_0_0_1px_var(--accent-cyan)]"
                : "border-[var(--border)] bg-[var(--bg-secondary)]/40 hover:border-[var(--text-muted)]/45 hover:bg-[var(--bg-hover)] disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--bg-secondary)]/40"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                active
                  ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
                  : "bg-[var(--bg-active)] text-[var(--text-secondary)]"
              }`}
            >
              {option.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--text-primary)]">
                {option.title}
              </span>
              <span
                className={`block text-[12px] leading-snug ${
                  blocked ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]"
                }`}
              >
                {option.blockedReason ?? option.description}
              </span>
            </span>
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                active
                  ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)] text-[var(--bg-primary)]"
                  : "border-[var(--border)] text-transparent"
              }`}
            >
              <Check size={10} strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
