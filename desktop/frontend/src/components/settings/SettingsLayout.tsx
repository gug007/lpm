import { useMemo, useState, type ReactNode } from "react";
import { useSettingsEscape } from "../../hooks/useSettingsEscape";
import {
  buildSearchEntries,
  matchSettings,
  TAB_TITLES,
  visibleNavGroups,
  type SettingsNavGroup,
  type SettingsSearchEntry,
} from "../../settings-registry";
import type { SettingsMachine } from "../../settingsMachine";
import { searchHints } from "../../settingsSearchHits";
import { shortcutRequirementHint } from "../../shortcutRecord";
import { useAppStore, type SettingsTab, type View } from "../../store/app";
import { settingsReturnLabel, useSettingsReturn } from "../../store/settingsReturn";
import { GlobalConfigEditor } from "../GlobalConfigEditor";
import { NAV_ICONS } from "./navIcons";
import { revealSettingsRow } from "./revealSettingsRow";
import { SettingsNav } from "./SettingsNav";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { SettingsPanes } from "./SettingsPanes";
import { SettingsTargetContext, type SettingsTarget } from "./settingsTarget";

const PAGE_SUBTITLES: Partial<Record<SettingsTab, string>> = {
  general: "How lpm looks, where new projects go, and how it stays up to date",
  notifications: "How lpm gets your attention when an agent or automation needs you",
  terminal: "How the built-in terminal looks, and what clicking a file path does",
  shortcuts: `Click a shortcut, then press the keys you want. ${shortcutRequirementHint()}`,
  agents: "Start agents, choose the model lpm writes with, and keep the sidebar tidy",
  accounts: "Your agent accounts and how much of each plan is left",
  git: "Keep projects up to date, and choose how pull, push and fetch behave",
};

// The page last open, unless the machine shown has no such page.
function shownTab(groups: SettingsNavGroup[], tab: SettingsTab): SettingsTab {
  const listed = groups.some((g) => g.items.some((item) => item.kind === "tab" && item.tab === tab));
  return listed ? tab : "general";
}

export function SettingsLayout({
  machine,
  target,
  notice,
  picker,
  onNavigate,
}: {
  machine: SettingsMachine;
  /// Null until the machine's settings can be shown; `notice` says why meanwhile.
  target: SettingsTarget | null;
  notice?: ReactNode;
  picker: ReactNode;
  onNavigate: (view: View) => void;
}) {
  const activeTab = useAppStore((s) => s.settingsTab);
  const setActiveTab = useAppStore((s) => s.setSettingsTab);
  const setView = useAppStore((s) => s.setView);
  const view = useAppStore((s) => s.view);
  const onGlobalConfig = view === "global-config";
  const returnView = useSettingsReturn((s) => s.from);
  const [query, setQuery] = useState("");

  const experimentalTTS = Boolean(target?.settings.experimentalTTS);
  const navGroups = useMemo(
    () => visibleNavGroups({ experimentalTTS }, machine),
    [experimentalTTS, machine],
  );
  const searchEntries = useMemo(
    () => buildSearchEntries({ experimentalTTS, machine }),
    [experimentalTTS, machine],
  );
  const searchResults = useMemo(() => matchSettings(searchEntries, query), [searchEntries, query]);
  const hints = useMemo(() => searchHints(searchEntries), [searchEntries]);
  const tab = shownTab(navGroups, activeTab);

  const selectTab = (next: SettingsTab) => {
    setActiveTab(next);
    if (onGlobalConfig) onNavigate("settings");
  };

  const activateEntry = (entry: SettingsSearchEntry) => {
    setQuery("");
    if (entry.kind === "view") {
      onNavigate(entry.view);
    } else {
      selectTab(entry.tab);
      revealSettingsRow(entry.id);
    }
  };

  const leave = () => setView(returnView);
  useSettingsEscape(leave);

  return (
    <div className="-mx-6 -mb-6 flex flex-1 overflow-hidden">
      <SettingsNav
        backLabel={settingsReturnLabel(returnView)}
        onBack={leave}
        picker={picker}
        groups={navGroups}
        activeTab={tab}
        activeView={onGlobalConfig ? view : undefined}
        query={query}
        results={searchResults}
        hints={hints}
        onQueryChange={setQuery}
        onActivate={activateEntry}
        onSelectTab={selectTab}
        onNavigate={onNavigate}
      />

      {onGlobalConfig ? (
        <div className="settings-pane-in flex min-h-0 min-w-0 flex-1 flex-col px-8 pt-2 pb-6">
          <GlobalConfigEditor machine={machine} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div key={tab} className="settings-pane-in mx-auto max-w-2xl px-10 pt-8 pb-10">
            <SettingsPageHeader
              icon={NAV_ICONS[tab]}
              title={TAB_TITLES[tab]}
              description={PAGE_SUBTITLES[tab]}
              machineName={machine.kind === "peer" ? machine.name : undefined}
            />
            {target ? (
              <SettingsTargetContext.Provider value={target}>
                <SettingsPanes tab={tab} onNavigate={onNavigate} />
              </SettingsTargetContext.Provider>
            ) : (
              notice
            )}
          </div>
        </div>
      )}
    </div>
  );
}
