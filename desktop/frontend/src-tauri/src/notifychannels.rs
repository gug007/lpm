// Which ways each kind of news reaches the user: an in-app toast, a sound, a
// system banner. Settings → Notifications draws this table and stores the
// user's choices under `notificationChannels`; this side reads the sound and
// banner columns. Keep in step with src/notifications/channels.ts.
use crate::status::{STATUS_DONE, STATUS_ERROR, STATUS_WAITING};
use serde_json::Value;

pub const SETTINGS_KEY: &str = "notificationChannels";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationEvent {
    AgentWaiting,
    AgentDone,
    AgentError,
    Automation,
    AutoPull,
    Peers,
    SendLater,
    KeepAwake,
    Ci,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NotificationChannel {
    InApp,
    Sound,
    Banner,
}

use NotificationChannel::{Banner, InApp, Sound};

/// Each event with the channels it offers and their defaults. A channel an
/// event leaves out isn't offered for it.
const NOTIFICATION_EVENTS: &[(NotificationEvent, &[(NotificationChannel, bool)])] = &[
    (
        NotificationEvent::AgentWaiting,
        &[(InApp, true), (Sound, true), (Banner, true)],
    ),
    (
        NotificationEvent::AgentDone,
        &[(InApp, false), (Sound, true), (Banner, true)],
    ),
    (
        NotificationEvent::AgentError,
        &[(InApp, false), (Sound, true), (Banner, true)],
    ),
    (
        NotificationEvent::Automation,
        &[(InApp, true), (Banner, true)],
    ),
    (NotificationEvent::AutoPull, &[(InApp, true)]),
    (NotificationEvent::Peers, &[(InApp, true)]),
    (NotificationEvent::SendLater, &[(InApp, true), (Banner, true)]),
    (NotificationEvent::KeepAwake, &[(InApp, true), (Banner, true)]),
    (NotificationEvent::Ci, &[(InApp, true), (Banner, true)]),
];

impl NotificationEvent {
    fn id(self) -> &'static str {
        match self {
            Self::AgentWaiting => "agentWaiting",
            Self::AgentDone => "agentDone",
            Self::AgentError => "agentError",
            Self::Automation => "automation",
            Self::AutoPull => "autoPull",
            Self::Peers => "peers",
            Self::SendLater => "sendLater",
            Self::KeepAwake => "keepAwake",
            Self::Ci => "ci",
        }
    }

    /// The event an agent's status transition is, for the statuses worth
    /// telling anyone about.
    pub fn of_status(value: &str) -> Option<Self> {
        match value {
            STATUS_WAITING => Some(Self::AgentWaiting),
            STATUS_DONE => Some(Self::AgentDone),
            STATUS_ERROR => Some(Self::AgentError),
            _ => None,
        }
    }

    fn default_for(self, channel: NotificationChannel) -> Option<bool> {
        let (_, offered) = NOTIFICATION_EVENTS
            .iter()
            .find(|(event, _)| *event == self)?;
        offered
            .iter()
            .find_map(|(offered, on)| (*offered == channel).then_some(*on))
    }
}

impl NotificationChannel {
    const ALL: [Self; 3] = [InApp, Sound, Banner];

    fn id(self) -> &'static str {
        match self {
            InApp => "inApp",
            Sound => "sound",
            Banner => "banner",
        }
    }

    /// The one switch that covered this channel for every event before the
    /// per-event table.
    fn legacy_switch(self) -> Option<&'static str> {
        match self {
            InApp => None,
            Sound => Some("soundNotifications"),
            Banner => Some("systemNotifications"),
        }
    }
}

/// Whether the switch that once covered `channel` for every event is on. It
/// still decides for an event the user hasn't chosen for.
fn legacy_switch_on(settings: &Value, channel: NotificationChannel) -> bool {
    channel
        .legacy_switch()
        .is_none_or(|key| settings.get(key).and_then(Value::as_bool) != Some(false))
}

/// Whether `event` reaches the user through `channel`: their choice for that
/// event, else the old switch for the channel when it's off, else the event's
/// default. A channel the event doesn't offer is never used.
pub fn enabled_in(
    settings: &Value,
    event: NotificationEvent,
    channel: NotificationChannel,
) -> bool {
    let Some(default) = event.default_for(channel) else {
        return false;
    };
    settings
        .get(SETTINGS_KEY)
        .and_then(|events| events.get(event.id()))
        .and_then(|channels| channels.get(channel.id()))
        .and_then(Value::as_bool)
        .unwrap_or_else(|| default && legacy_switch_on(settings, channel))
}

/// Whether `value` is something `notificationChannels` may hold: known events,
/// each mapping known channels to true or false.
pub fn is_valid_choices(value: &Value) -> bool {
    let known_event = |id: &str| {
        NOTIFICATION_EVENTS
            .iter()
            .any(|(event, _)| event.id() == id)
    };
    let known_channel = |id: &str| {
        NotificationChannel::ALL
            .iter()
            .any(|channel| channel.id() == id)
    };
    value.as_object().is_some_and(|events| {
        events.iter().all(|(event, channels)| {
            known_event(event)
                && channels.as_object().is_some_and(|channels| {
                    channels
                        .iter()
                        .all(|(channel, on)| known_channel(channel) && on.is_boolean())
                })
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use NotificationEvent::*;

    const EVENTS: [NotificationEvent; 9] = [
        AgentWaiting,
        AgentDone,
        AgentError,
        Automation,
        AutoPull,
        Peers,
        SendLater,
        KeepAwake,
        Ci,
    ];

    #[test]
    fn every_event_is_in_the_table_once() {
        for event in EVENTS {
            let rows = NOTIFICATION_EVENTS
                .iter()
                .filter(|(e, _)| *e == event)
                .count();
            assert_eq!(rows, 1, "{event:?}");
        }
        assert_eq!(NOTIFICATION_EVENTS.len(), EVENTS.len());
    }

    #[test]
    fn defaults_apply_when_nothing_is_set() {
        let none = json!({});
        assert!(enabled_in(&none, AgentWaiting, Banner));
        assert!(enabled_in(&none, AgentWaiting, Sound));
        assert!(enabled_in(&none, AgentDone, Sound));
        assert!(!enabled_in(&none, AgentDone, InApp));
        assert!(enabled_in(&none, AgentError, Banner));
        assert!(enabled_in(&none, Automation, Banner));
        assert!(enabled_in(&none, AutoPull, InApp));
    }

    #[test]
    fn a_channel_the_event_does_not_offer_is_never_used() {
        let chosen = json!({ SETTINGS_KEY: { "automation": { "sound": true }, "peers": { "banner": true } } });
        assert!(!enabled_in(&chosen, Automation, Sound));
        assert!(!enabled_in(&chosen, Peers, Banner));
        assert!(!enabled_in(&json!({}), AutoPull, Banner));
    }

    #[test]
    fn the_choice_for_an_event_wins() {
        let settings = json!({
            "systemNotifications": false,
            "soundNotifications": false,
            SETTINGS_KEY: {
                "agentDone": { "banner": true, "inApp": true },
                "agentWaiting": { "sound": false },
            },
        });
        assert!(enabled_in(&settings, AgentDone, Banner));
        assert!(enabled_in(&settings, AgentDone, InApp));
        assert!(!enabled_in(&settings, AgentWaiting, Sound));
    }

    #[test]
    fn a_legacy_switch_that_is_off_silences_its_channel_by_default() {
        let settings = json!({ "systemNotifications": false, "soundNotifications": false });
        assert!(!enabled_in(&settings, AgentWaiting, Banner));
        assert!(!enabled_in(&settings, Automation, Banner));
        assert!(!enabled_in(&settings, AgentDone, Sound));
        assert!(enabled_in(&settings, AgentWaiting, InApp));
        assert!(!legacy_switch_on(&settings, Banner));
        assert!(legacy_switch_on(&settings, InApp));
        let on = json!({ "systemNotifications": true });
        assert!(enabled_in(&on, AgentWaiting, Banner));
        assert!(legacy_switch_on(&on, Banner));
    }

    #[test]
    fn unknown_and_malformed_choices_fall_back() {
        let settings = json!({
            SETTINGS_KEY: {
                "agentDone": { "banner": "no", "phone": false },
                "agentWaiting": false,
                "deploys": { "banner": false },
            },
        });
        assert!(enabled_in(&settings, AgentDone, Banner));
        assert!(enabled_in(&settings, AgentWaiting, Banner));
        assert!(enabled_in(&json!({ SETTINGS_KEY: [] }), AgentError, Sound));
        assert!(enabled_in(&json!(null), AgentError, Sound));
    }

    #[test]
    fn statuses_that_notify_are_agent_events() {
        assert_eq!(
            NotificationEvent::of_status(STATUS_WAITING),
            Some(AgentWaiting)
        );
        assert_eq!(NotificationEvent::of_status(STATUS_DONE), Some(AgentDone));
        assert_eq!(NotificationEvent::of_status(STATUS_ERROR), Some(AgentError));
        assert_eq!(NotificationEvent::of_status("Running"), None);
        assert_eq!(NotificationEvent::of_status(""), None);
    }

    #[test]
    fn only_the_table_shape_is_valid_choices() {
        assert!(is_valid_choices(&json!({})));
        assert!(is_valid_choices(&json!({
            "agentDone": { "inApp": true, "sound": false, "banner": true },
            "autoPull": {},
        })));
        for bad in [
            json!([]),
            json!("off"),
            json!({ "agentDone": true }),
            json!({ "agentDone": { "banner": "yes" } }),
            json!({ "agentDone": { "phone": false } }),
            json!({ "deploys": { "banner": false } }),
            json!({ "agentDone": { "banner": null } }),
        ] {
            assert!(!is_valid_choices(&bad), "{bad} was accepted");
        }
    }
}
