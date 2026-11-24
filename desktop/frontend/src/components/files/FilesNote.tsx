import type { ReactNode } from "react";

interface FilesNoteProps {
  tone?: "muted" | "bad";
  children: ReactNode;
}

// What the list says instead of rows, or under the few it has.
export function FilesNote({ tone = "muted", children }: FilesNoteProps) {
  return (
    <p
      className={`break-words px-4 py-6 text-center text-[11px] ${
        tone === "bad" ? "text-[var(--accent-red-text)]" : "text-[var(--text-muted)]"
      }`}
    >
      {children}
    </p>
  );
}
