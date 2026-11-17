import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { isMac } from "../../platform";
import type { SettingsNavGroup, SettingsSearchEntry } from "../../settings-registry";
import type { SettingsTab, View } from "../../store/app";
import { useSettingsStore } from "../../store/settings";
import { SettingsSearch } from "../SettingsSearch";
import { NAV_ICONS } from "./navIcons";

export function SettingsNav({
  backLabel,
  onBack,
  picker,
  groups,
  activeTab,
  activeView,
  query,
  results,
  hints,
  onQueryChange,
  onActivate,
  onSelectTab,
  onNavigate,
}: {
  /// Where leaving Settings goes back to.
  backLabel: string;
  onBack: () => void;
  /// Which machine's settings show, when there is more than one to choose.
  picker: ReactNode;
  groups: SettingsNavGroup[];
  activeTab: SettingsTab;
  /// A page from the nav shown in place of the tabs, such as Global config.
  activeView?: View;
  query: string;
  results: SettingsSearchEntry[];
  /// Searches to suggest when one finds nothing.
  hints: string[];
  onQueryChange: (query: string) => void;
  onActivate: (entry: SettingsSearchEntry) => void;
  onSelectTab: (tab: SettingsTab) => void;
  onNavigate: (view: View) => void;
}) {
  const searching = query.trim() !== "";
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth) || 260;
  return (
    <nav
      className="flex shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-sidebar)] px-3 transition-[width] duration-150"
      style={{ width: searching ? Math.max(340, sidebarWidth) : sidebarWidth }}
    >
      {/* Settings stand in for the project sidebar, so this column starts at
          the window's edge and keeps the sidebar's room for the traffic lights. */}
      <div className="app-drag h-11 shrink-0 native-chrome:h-3" />
      <button
        type="button"
        data-settings-back
        onClick={onBack}
        className="group mb-4 flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1 truncate">{backLabel}</span>
        <kbd className="shrink-0 rounded border border-[var(--border)] px-1 font-sans text-[10px] leading-4 text-[var(--text-muted)]">
          {isMac ? "esc" : "Esc"}
        </kbd>
      </button>
      <h1 className="mb-3 px-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">Settings</h1>
      {picker}
      <SettingsSearch
        query={query}
        onQueryChange={onQueryChange}
        results={results}
        hints={hints}
        onActivate={onActivate}
      />
      {!searching &&
        groups.map((group) => (
          <div key={group.title} className="mb-2">
            <div className="mb-1 mt-3 px-2.5 text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--text-muted)] opacity-70">
              {group.title}
            </div>
            {group.items.map((item) => {
              const key = item.kind === "view" ? item.view : item.tab;
              const Icon = NAV_ICONS[key];
              const active =
                item.kind === "view" ? activeView === item.view : !activeView && activeTab === item.tab;
              return (
                <button
                  key={key}
                  onClick={() => (item.kind === "view" ? onNavigate(item.view) : onSelectTab(item.tab))}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors ${
                    active
                      ? "bg-[var(--bg-active)] font-medium text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {Icon && (
                    <Icon
                      size={15}
                      strokeWidth={active ? 2 : 1.75}
                      className={`shrink-0 transition-colors ${
                        active
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                      }`}
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
    </nav>
  );
}
