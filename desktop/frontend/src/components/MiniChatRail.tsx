import type { notes } from "../../wailsjs/go/models";
import { PlusIcon, SidebarIcon, SearchIcon } from "./icons";

interface MiniChatRailProps {
  chats: notes.Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSearch: () => void;
  onExpand: () => void;
}

// Collapsed-but-not-hidden sidebar: a narrow column of initial chips so the
// user can still see and switch between chats without giving up message
// real estate. Mirrors the Slack/VSCode pattern.
export function MiniChatRail({
  chats,
  activeId,
  onSelect,
  onCreate,
  onSearch,
  onExpand,
}: MiniChatRailProps) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg-primary)] py-2">
      <button
        onClick={onExpand}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        title="Expand sidebar"
        aria-label="Expand sidebar"
      >
        <SidebarIcon />
      </button>
      <button
        onClick={onSearch}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        title="Search notes"
        aria-label="Search notes"
      >
        <SearchIcon />
      </button>
      <button
        onClick={onCreate}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        title="New chat"
        aria-label="New chat"
      >
        <PlusIcon />
      </button>
      <div className="my-1 h-px w-6 bg-[var(--border)]" />
      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1 pb-1">
        {chats.map((c) => {
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={c.title}
              aria-label={c.title}
              aria-pressed={active}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold transition-colors ${
                active
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                  : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]/70 hover:text-[var(--text-primary)]"
              }`}
            >
              {initials(c.title)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// First letter of the first two words, falling back to first two characters
// for a single-word title. Distinguishes "Project Alpha" (PA) from
// "Project Beta" (PB) without showing the redundant prefix.
function initials(title: string): string {
  const t = title.trim();
  if (!t) return "?";
  const words = t.split(/\s+/);
  if (words.length === 1) return t.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
