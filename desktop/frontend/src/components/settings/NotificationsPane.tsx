import { BrowserOpenURL } from "../../../bridge/runtime";
import { sendToRequestUrl } from "../../githubIssue";
import { channelEnabled } from "../../notifications/channels";
import type { NotificationEvent } from "../../notifications/types";
import { ROWS, rowProps, SOUND_EVENTS } from "../../settings-registry";
import type { Settings } from "../../store/settings";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SoundPicker } from "../SoundPicker";
import { TelegramRow } from "../TelegramRow";
import { BTN_SECONDARY } from "../ui/buttons";
import { Toggle } from "../ui/Toggle";
import { NotificationChannelsTable } from "./NotificationChannelsTable";
import { useRowReach, useSettingsTarget } from "./settingsTarget";
import { useMachineList } from "./useMachineList";

type SoundEvent = (typeof SOUND_EVENTS)[number]["event"];

// Each sound's agent event, and where its choice is kept.
const SOUND_SETTINGS: Record<
  SoundEvent,
  {
    event: NotificationEvent;
    value: (s: Settings) => string | undefined;
    patch: (sound: string) => Partial<Settings>;
  }
> = {
  done: { event: "agentDone", value: (s) => s.doneSound, patch: (doneSound) => ({ doneSound }) },
  waiting: { event: "agentWaiting", value: (s) => s.waitingSound, patch: (waitingSound) => ({ waitingSound }) },
  error: { event: "agentError", value: (s) => s.errorSound, patch: (errorSound) => ({ errorSound }) },
};

export function NotificationsPane() {
  const { machine, settings, update, commands } = useSettingsTarget();
  const shows = useRowReach();
  const sounds = useMachineList(shows("notifications.channels") ? commands.listSystemSounds : null);
  const audible = SOUND_EVENTS.filter((r) => channelEnabled(settings, SOUND_SETTINGS[r.event].event, "sound"));

  const sendsResults = shows("notifications.telegram") || shows("notifications.sendToRequest");

  return (
    <>
      {shows("notifications.channels") && (
        <>
          <SettingsSection
            id={ROWS["notifications.channels"].id}
            title="Alerts"
            description={ROWS["notifications.channels"].description}
          >
            <NotificationChannelsTable settings={settings} update={update} />
          </SettingsSection>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Phones choose their own in lpm Link, under Settings › Notifications.
          </p>
          {audible.length > 0 && (
            <SettingsSection title="Sounds">
              {audible.map((r) => (
                <SettingsRow key={r.event} id={`sound.${r.event}`} label={r.label} description={r.description}>
                  <SoundPicker
                    event={r.event}
                    value={SOUND_SETTINGS[r.event].value(settings) ?? "chime"}
                    sounds={sounds}
                    local={machine.kind === "local"}
                    onChange={(v) => void update(SOUND_SETTINGS[r.event].patch(v))}
                  />
                </SettingsRow>
              ))}
            </SettingsSection>
          )}
        </>
      )}
      {shows("notifications.holdWhileTyping") && (
        <SettingsSection title="While you type">
          <SettingsRow {...rowProps("notifications.holdWhileTyping")}>
            <Toggle
              enabled={settings.holdToastsWhileTyping === true}
              onChange={(v) => void update({ holdToastsWhileTyping: v })}
            />
          </SettingsRow>
        </SettingsSection>
      )}
      {shows("notifications.weeklyRecap") && (
        <SettingsSection title="Weekly recap">
          <SettingsRow {...rowProps("notifications.weeklyRecap")}>
            <Toggle
              enabled={settings.weeklyRecap !== false}
              onChange={(v) => void update({ weeklyRecap: v })}
            />
          </SettingsRow>
        </SettingsSection>
      )}
      {sendsResults && (
        <SettingsSection title="Send automation results to">
          {shows("notifications.telegram") && <TelegramRow host={machine.kind === "peer" ? machine.slug : null} />}
          {shows("notifications.sendToRequest") && (
            <SettingsRow {...rowProps("notifications.sendToRequest")}>
              <button onClick={() => BrowserOpenURL(sendToRequestUrl())} className={BTN_SECONDARY}>
                Request on GitHub
              </button>
            </SettingsRow>
          )}
        </SettingsSection>
      )}
    </>
  );
}
