import { rowProps } from "../../settings-registry";
import { shellName } from "../../shells";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { useSettingsTarget } from "./settingsTarget";
import { useMachineList } from "./useMachineList";

/** Settings › Terminal › Shell: what a new plain terminal opens in on the
 *  machine being set up. Hidden where there's nothing to pick from. */
export function TerminalShellRow() {
  const { settings, update, commands } = useSettingsTarget();
  const shells = useMachineList(commands.listShells);
  if (shells.length < 2) return null;
  const login = shells.find((s) => s.login);
  const picked = settings.terminalShell ?? "";
  const value = shells.some((s) => s.id === picked && !s.login) ? picked : "";
  return (
    <SettingsSection title="Shell">
      <SettingsRow {...rowProps("terminal.shell")}>
        <SettingsSelect
          value={value}
          onChange={(e) => void update({ terminalShell: e.target.value })}
          aria-label="Shell new terminals open"
        >
          <option value="">{login ? `${shellName(login, shells)} (login shell)` : "Login shell"}</option>
          {shells
            .filter((s) => !s.login)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {shellName(s, shells)}
              </option>
            ))}
        </SettingsSelect>
      </SettingsRow>
    </SettingsSection>
  );
}
