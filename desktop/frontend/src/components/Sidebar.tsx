import { StatusDot } from "./StatusDot";
import type { ProjectInfo } from "../types";

interface SidebarProps {
  projects: ProjectInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
  onSettings: () => void;
  showSettings: boolean;
}

export function Sidebar({ projects, selected, onSelect, onSettings, showSettings }: SidebarProps) {
  return (
    <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
      <div className="flex items-center justify-between p-4 pb-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Projects
        </h2>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Add project"
        >
          +
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {projects.map((project) => (
          <button
            key={project.name}
            onClick={() => onSelect(project.name)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selected === project.name
                ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <StatusDot running={project.running} />
            <span className="truncate">{project.name}</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {project.services?.length || 0}
            </span>
          </button>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] p-2">
        <button
          onClick={onSettings}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            showSettings
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          Settings
        </button>
      </div>
    </aside>
  );
}
