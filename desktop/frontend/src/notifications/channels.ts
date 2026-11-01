import { getSettings, type Settings } from "../store/settings";
import type { NotificationEvent } from "./types";

// Phones keep their own per-event switches in lpm Link, so there is no phone
// channel here.
export type NotificationChannel = "inApp" | "sound" | "banner";

export type EventChannels = Partial<Record<NotificationChannel, boolean>>;

export type NotificationChannelPrefs = Partial<Record<NotificationEvent, EventChannels>>;

export interface NotificationEventSpec {
  id: NotificationEvent;
  label: string;
  hint?: string;
  /** The channels this event can use, each with its default. */
  defaults: EventChannels;
}

// The rows of Settings → Notifications. A channel an event leaves out isn't
// offered for it. Keep in step with NOTIFICATION_EVENTS in notifychannels.rs.
export const NOTIFICATION_EVENTS: NotificationEventSpec[] = [
  { id: "agentWaiting", label: "Agent needs you", defaults: { inApp: true, sound: true, banner: true } },
  { id: "agentDone", label: "Agent finished", defaults: { inApp: false, sound: true, banner: true } },
  { id: "agentError", label: "Agent hit a problem", defaults: { inApp: false, sound: true, banner: true } },
  {
    id: "automation",
    label: "Automation results",
    hint: "Telegram too, when connected",
    defaults: { inApp: true, banner: true },
  },
  { id: "autoPull", label: "Auto pull", defaults: { inApp: true } },
  { id: "peers", label: "Peers & sync", defaults: { inApp: true } },
  { id: "sendLater", label: "Scheduled prompts", hint: "Sent, or missed while away", defaults: { inApp: true, banner: true } },
  {
    id: "keepAwake",
    label: "Keep awake ending",
    hint: "Five minutes before it lets go",
    defaults: { inApp: true, banner: true },
  },
];

export const NOTIFICATION_CHANNELS: { id: NotificationChannel; label: string }[] = [
  { id: "inApp", label: "In app" },
  { id: "sound", label: "Sound" },
  { id: "banner", label: "Banner" },
];

// Before the per-event table, one switch covered all sounds and one all banners.
const LEGACY_SWITCH: Partial<Record<NotificationChannel, keyof Settings>> = {
  sound: "soundNotifications",
  banner: "systemNotifications",
};

export function eventSpec(event: NotificationEvent): NotificationEventSpec {
  return NOTIFICATION_EVENTS.find((e) => e.id === event)!;
}

export function offersChannel(event: NotificationEvent, channel: NotificationChannel): boolean {
  return eventSpec(event).defaults[channel] !== undefined;
}

/** Whether `event` reaches you through `channel`: your choice for that event,
 *  else the old all-events switch when it's off, else the event's default.
 *  Notifications that aren't about an event always show in the app. */
export function channelEnabled(
  settings: Settings,
  event: NotificationEvent | undefined,
  channel: NotificationChannel,
): boolean {
  if (!event) return channel === "inApp";
  const fallback = eventSpec(event).defaults[channel];
  if (fallback === undefined) return false;
  const chosen = settings.notificationChannels?.[event]?.[channel];
  if (chosen !== undefined) return chosen;
  const legacy = LEGACY_SWITCH[channel];
  if (legacy && settings[legacy] === false) return false;
  return fallback;
}

export function allowsChannel(event: NotificationEvent | undefined, channel: NotificationChannel): boolean {
  return channelEnabled(getSettings(), event, channel);
}
