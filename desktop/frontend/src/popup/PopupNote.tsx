import type { ReactNode } from "react";

// Words in place of a popup's page: why it isn't there, or that it's loading.
export function PopupNote({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[11.5px] leading-snug">
      <span className={tone === "error" ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}>
        {children}
      </span>
    </div>
  );
}
