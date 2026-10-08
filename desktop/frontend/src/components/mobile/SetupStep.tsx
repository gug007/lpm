import type { ReactNode } from "react";
import { Check } from "lucide-react";

/** One numbered step of first-run setup, ticked once it's done. */
export function SetupStep({
  n,
  done,
  title,
  detail,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
        style={
          done
            ? { backgroundColor: "color-mix(in srgb, var(--accent-green) 15%, transparent)", color: "var(--accent-green)" }
            : { backgroundColor: "var(--bg-active)", color: "var(--text-secondary)" }
        }
      >
        {done ? <Check size={13} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{detail}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
