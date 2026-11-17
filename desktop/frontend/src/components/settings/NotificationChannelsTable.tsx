import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  channelEnabled,
  offersChannel,
  type NotificationChannel,
} from "../../notifications/channels";
import type { NotificationEvent } from "../../notifications/types";
import type { Settings } from "../../store/settings";
import { CheckboxInput } from "./CheckboxInput";
import { CAPS_LABEL } from "./sectionStyles";

interface NotificationChannelsTableProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => unknown;
}

/** One row per kind of news, one column per way it can reach you. A cell is
 *  written only when it's changed; the rest keep following their defaults. */
export function NotificationChannelsTable({ settings, update }: NotificationChannelsTableProps) {
  const set = (event: NotificationEvent, channel: NotificationChannel, on: boolean) => {
    const prefs = settings.notificationChannels ?? {};
    void update({ notificationChannels: { ...prefs, [event]: { ...prefs[event], [channel]: on } } });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-[13px]">
        <thead>
          <tr className={`border-b border-[var(--border)] bg-[var(--bg-primary)]/50 ${CAPS_LABEL}`}>
            <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium">
              Event
            </th>
            {NOTIFICATION_CHANNELS.map((c) => (
              <th key={c.id} scope="col" className="w-20 px-2 py-2 text-center font-medium last:pr-4">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_EVENTS.map((e) => (
            <tr key={e.id} className="border-b border-[var(--border)] last:border-0">
              <th scope="row" className="h-12 py-1.5 pl-4 pr-3 text-left font-normal text-[var(--text-primary)]">
                {e.label}
                {e.hint && <span className="block text-[11px] leading-snug text-[var(--text-muted)]">{e.hint}</span>}
              </th>
              {NOTIFICATION_CHANNELS.map((c) => (
                <td
                  key={c.id}
                  title={offersChannel(e.id, c.id) ? undefined : "Not offered for this event"}
                  className="px-2 py-1.5 text-center align-middle last:pr-4"
                >
                  {offersChannel(e.id, c.id) ? (
                    <span className="inline-flex align-middle">
                      <CheckboxInput
                        aria-label={`${e.label}: ${c.label}`}
                        checked={channelEnabled(settings, e.id, c.id)}
                        onChange={(on) => set(e.id, c.id, on)}
                      />
                    </span>
                  ) : (
                    <span aria-label="Not offered" className="text-[var(--text-muted)] opacity-50">
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
