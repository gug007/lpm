import { Zap } from "lucide-react";

export function Tab({
  children,
  active,
  icon,
  port,
  tone,
  compact,
}: {
  children: React.ReactNode;
  active?: boolean;
  icon: React.ReactNode;
  port?: string;
  /** Status tint, on the label only — the app leaves the pill itself neutral. */
  tone?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-[0.45em] rounded-[0.4em] py-[0.15em] ${
        compact ? "px-[0.5em]" : "px-[0.6em]"
      } ${active ? "bg-white/[0.1] text-[#d4d4d4]" : "text-[#a0a0a0]"}`}
    >
      {icon}
      <span className={`font-mono text-[0.95em] font-medium ${tone ?? ""}`}>
        {children}
      </span>
      {port && (
        <span className="font-mono text-[0.9em] tabular-nums text-[#9a9a9a]">
          {port}
        </span>
      )}
    </div>
  );
}

export const RUNNING_ZAP = (
  <Zap
    className="h-[0.85em] w-[0.85em] shrink-0 text-emerald-400"
    strokeWidth={2}
    fill="currentColor"
  />
);
