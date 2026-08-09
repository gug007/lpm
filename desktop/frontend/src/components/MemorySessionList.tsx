import type { ContentZoom } from "../hooks/useContentZoom";
import type { MemorySession } from "../types";
import { MemoryStamp } from "./MemoryStamp";
import { SquarePenIcon, TrashIcon } from "./icons";

interface MemorySessionListProps {
  sessions: MemorySession[];
  zoom: ContentZoom;
  onOpen: (name: string) => void;
  onRename: (session: MemorySession) => void;
  onDelete: (session: MemorySession) => void;
}

// The first line under "## Goal" — the card's one-line answer to "what is this
// workstream about", far more telling than repeating the slug.
function goalOf(content: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => /^##\s+Goal\b/i.test(l.trim()));
  if (start < 0) return "";
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("##")) break;
    if (t) return t;
  }
  return "";
}

// Rename and delete sit outside the card button rather than inside it — a button
// nested in a button is invalid, and the row stays one keyboard stop for opening.
export function MemorySessionList({
  sessions,
  zoom,
  onOpen,
  onRename,
  onDelete,
}: MemorySessionListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={zoom.surfaceRef}>
      <div className="mx-auto max-w-2xl px-6 py-5" style={{ zoom: zoom.zoom }}>
        <ul className="flex flex-col gap-2.5">
          {sessions.map((s) => {
            const goal = goalOf(s.content);
            const subtitle = goal || (s.name !== s.title ? s.name : "");
            return (
              <li key={s.name} className="group relative">
                <button
                  onClick={() => onOpen(s.name)}
                  className="flex w-full flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50 px-4 py-3.5 text-left transition-colors hover:border-[var(--accent-purple)]/40 hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex w-full items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
                      {s.title}
                    </span>
                    <span className="group-hover:invisible">
                      <MemoryStamp session={s} />
                    </span>
                  </span>
                  {subtitle && (
                    <span className="line-clamp-1 text-xs leading-5 text-[var(--text-muted)]">
                      {subtitle}
                    </span>
                  )}
                </button>
                <span className="absolute right-3 top-3 hidden items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={() => onRename(s)}
                    title="Rename session"
                    aria-label={`Rename ${s.title}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                  >
                    <SquarePenIcon size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    title="Delete session"
                    aria-label={`Delete ${s.title}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-primary)] hover:text-[var(--accent-red)]"
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
