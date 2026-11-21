import { SettingsSection } from "../SettingsSection";
import { ConsentRow } from "./ConsentRow";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

const CRASH_REPORT_DETAILS = (
  <>
    <p>When lpm hits an error it didn't expect, it sends a report with:</p>
    <ul className="list-disc space-y-0.5 pl-4">
      <li>the error and where in lpm it happened</li>
      <li>your lpm version, operating system version and processor type</li>
      <li>the app's own recent events, such as “settings loaded”</li>
    </ul>
    <p>
      Your code, terminal output, prompts and project settings are never part of a report. The
      error text can name the project it was about, but any file path in it is cut to where it
      starts, like ~/.lpm/…, so your home folder name and your folders and files aren't in it.
      Anything that looks like a password or token is removed too, before it is sent.
    </p>
    <p>
      Reports go to Sentry, where lpm's developers read them. Each computer has its own switch,
      and turning it off stops reports at once.
    </p>
  </>
);

const DAILY_PING_DETAILS = (
  <>
    <p>On each day lpm is used, it sends one ping with:</p>
    <ul className="list-disc space-y-0.5 pl-4">
      <li>that lpm was used today, and whether it's the first day this week or this month</li>
      <li>your lpm version, operating system and processor type</li>
      <li>whether it's a computer you sit at or a server</li>
      <li>the month lpm was installed, and whether that was in the last few days</li>
    </ul>
    <p>
      A ping has no ID, account or name on it, so one day's ping can't be matched with another's.
      Your code, projects, terminal output and prompts are never part of it.
    </p>
    <p>
      Pings go to a server lpm's developers run, which keeps only the totals of how many computers
      used lpm each day, week and month, and not the address a ping came from. Each computer has
      its own switch.
    </p>
  </>
);

export function PrivacySection() {
  const { commands } = useSettingsTarget();
  const shows = useRowReach();
  const crashReports = shows("general.crashReports");
  const dailyPing = shows("general.dailyPing");
  if (!crashReports && !dailyPing) return null;

  return (
    <SettingsSection title="Privacy">
      {crashReports && (
        <ConsentRow
          id="general.crashReports"
          setting="crashReports"
          check={commands.crashReportsAvailable}
          unavailable="This build of lpm doesn't send crash reports"
          details={CRASH_REPORT_DETAILS}
        />
      )}
      {dailyPing && (
        <ConsentRow
          id="general.dailyPing"
          setting="dailyPing"
          check={commands.dailyPingAvailable}
          unavailable="This build of lpm doesn't send a daily ping"
          details={DAILY_PING_DETAILS}
        />
      )}
    </SettingsSection>
  );
}
