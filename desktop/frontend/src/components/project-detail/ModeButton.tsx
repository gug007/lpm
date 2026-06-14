import type { ReactNode } from "react";

// One cell of the labeled segmented pickers (run mode, confirm, port conflict).
export function ModeButton({
  active,
  icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      <span className={active ? "" : "opacity-80"}>{icon}</span>
      {title}
    </button>
  );
}
