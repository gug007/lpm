import type { SettingsTab, View } from "../../store/app";
import { ConnectionsPane } from "../ConnectionsPane";
import { MobileSettingsPane } from "../MobileSettingsPane";
import { AccountsPane } from "./AccountsPane";
import { AgentsPane } from "./AgentsPane";
import { BackupPane } from "./BackupPane";
import { GeneralPane } from "./GeneralPane";
import { GitPane } from "./GitPane";
import { NotificationsPane } from "./NotificationsPane";
import { ShortcutsPane } from "./ShortcutsPane";
import { TemplatesPane } from "./TemplatesPane";
import { TerminalPane } from "./TerminalPane";
import { TtsPane } from "./TtsPane";

export function SettingsPanes({ tab, onNavigate }: { tab: SettingsTab; onNavigate: (view: View) => void }) {
  switch (tab) {
    case "general":
      return <GeneralPane />;
    case "notifications":
      return <NotificationsPane />;
    case "terminal":
      return <TerminalPane />;
    case "shortcuts":
      return <ShortcutsPane />;
    case "tts":
      return <TtsPane />;
    case "agents":
      return <AgentsPane onNavigate={onNavigate} />;
    case "accounts":
      return <AccountsPane />;
    case "git":
      return <GitPane onNavigate={onNavigate} />;
    case "templates":
      return <TemplatesPane />;
    case "backup":
      return <BackupPane />;
    case "mobile":
      return (
        <div data-settings-row="mobile.devices">
          <MobileSettingsPane />
        </div>
      );
    case "connections":
      return (
        <div data-settings-row="connections.peers">
          <ConnectionsPane />
        </div>
      );
  }
}
