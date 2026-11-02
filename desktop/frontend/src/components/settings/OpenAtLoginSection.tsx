import { useCallback, useEffect, useState } from "react";
import { LoginItemSet, LoginItemState } from "../../../bridge/commands";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { Toggle } from "../ui/Toggle";
import { useRowReach } from "./settingsTarget";

interface LoginItem {
  supported: boolean;
  enabled: boolean;
  needsApproval: boolean;
}

// The OS keeps this switch, and it can be changed there too, so it is read back
// whenever lpm comes to the front.
export function OpenAtLoginSection() {
  const shown = useRowReach()("general.openAtLogin");
  const [state, setState] = useState<LoginItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(() => {
    LoginItemState()
      .then((next: LoginItem) => setState(next))
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    if (!shown) return;
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [shown, read]);

  if (!shown || !state?.supported) return null;

  const change = (enabled: boolean) => {
    setError(null);
    setState({ ...state, enabled });
    LoginItemSet(enabled)
      .then((next: LoginItem) => setState(next))
      .catch((e: unknown) => {
        setError(String(e));
        read();
      });
  };

  let below = null;
  if (error) {
    below = <p className="mt-1 text-[11px] text-[var(--accent-red-text)]">{error}</p>;
  } else if (state.needsApproval) {
    below = (
      <p className="mt-1 text-[11px] text-[var(--accent-amber-text)]">
        Allow lpm in System Settings › General › Login Items to finish
      </p>
    );
  }

  return (
    <SettingsSection title="Startup">
      <SettingsRow {...rowProps("general.openAtLogin")} below={below}>
        <Toggle
          aria-label="Open at login"
          enabled={state.enabled || state.needsApproval}
          onChange={change}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
