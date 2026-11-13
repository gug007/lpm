import { useEffect, useState } from "react";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { Toggle } from "../ui/Toggle";
import { useSettingsTarget } from "./settingsTarget";

// Settings › General › Privacy: whether the machine sends crash reports. On
// until turned off, and turned off on each machine by itself.
export function CrashReportsSection() {
  const { settings, update, commands } = useSettingsTarget();
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAvailable(true);
    commands
      .crashReportsAvailable()
      .catch(() => false)
      .then((inItsBuild) => {
        if (!cancelled) setAvailable(inItsBuild);
      });
    return () => {
      cancelled = true;
    };
  }, [commands]);

  return (
    <SettingsSection title="Privacy">
      <SettingsRow
        {...rowProps(
          "general.crashReports",
          available ? undefined : { description: "This build of lpm doesn't send crash reports" },
        )}
        details={
          <>
            <p>When lpm hits an error it didn't expect, it sends a report with:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>the error and where in lpm it happened</li>
              <li>your lpm version, operating system version and processor type</li>
              <li>the app's own recent events, such as “settings loaded”</li>
            </ul>
            <p>
              Your code, terminal output, prompts and project settings are never part of a report.
              The error text can name the file or project it was about; your home folder name and
              anything that looks like a password or token are removed from it before it is sent.
            </p>
            <p>
              Reports go to Sentry, where lpm's developers read them. Each computer has its own
              switch, and turning it off stops reports at once.
            </p>
          </>
        }
      >
        <Toggle
          aria-label="Send crash reports"
          enabled={available && settings.crashReports !== false}
          disabled={!available}
          onChange={(on) => void update({ crashReports: on ? undefined : false })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
