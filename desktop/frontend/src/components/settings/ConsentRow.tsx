import { useEffect, useState, type ReactNode } from "react";
import { rowProps, type SettingsRowId } from "../../settings-registry";
import type { Settings } from "../../store/settings";
import { SettingsRow } from "../SettingsRow";
import { Toggle } from "../ui/Toggle";
import { useSettingsTarget } from "./settingsTarget";

type ConsentKey = "crashReports" | "dailyPing";

// A switch that is on until turned off, per machine, for something the
// machine's build may not send at all. An lpm too old to answer `check`
// doesn't send it.
export function ConsentRow({
  id,
  setting,
  check,
  unavailable,
  details,
}: {
  id: SettingsRowId;
  setting: ConsentKey;
  check: () => Promise<boolean>;
  unavailable: string;
  details: ReactNode;
}) {
  const { settings, update } = useSettingsTarget();
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAvailable(true);
    check()
      .catch(() => false)
      .then((inItsBuild) => {
        if (!cancelled) setAvailable(inItsBuild);
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

  const row = rowProps(id, available ? undefined : { description: unavailable });
  return (
    <SettingsRow {...row} details={details}>
      <Toggle
        aria-label={row.label}
        enabled={available && settings[setting] !== false}
        disabled={!available}
        onChange={(on) => void update({ [setting]: on ? undefined : false })}
      />
    </SettingsRow>
  );
}
