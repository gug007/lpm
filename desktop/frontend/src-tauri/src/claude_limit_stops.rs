//! The limit a Claude tab stopped at, kept while the tab shows it: the account
//! that ran out, why, and the account the conversation could carry on with. The
//! tab offers that move and makes it only on the user's click; nothing here
//! moves anything. Phones and paired Macs get the same stop with each terminal
//! they list.
use crate::agent_limits::now_secs;
use crate::claude_dirs::MAIN_LOGIN;
use crate::claude_limit_hits::Stop;
use crate::claude_pool_pick::{live, Member, Pick, PickKind, Skip, Win};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();
static STOPS: Mutex<Vec<TabStop>> = Mutex::new(Vec::new());

#[derive(Clone, Debug)]
struct TabStop {
    project: String,
    terminal: String,
    session: String,
    account: String,
    stop: Stop,
}

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

/// Phones, paired Macs and the tab itself list terminals again on this. Off the
/// caller's thread: the listing runs in the event's listeners, and the callers
/// answer an agent's hook or move a tab.
fn changed(project: &str) {
    if let Some(app) = APP.get().cloned() {
        let project = project.to_string();
        std::thread::spawn(move || {
            let _ = app.emit(crate::remote::TERMINALS_CHANGED_EVENT, project);
        });
    }
}

fn stops() -> std::sync::MutexGuard<'static, Vec<TabStop>> {
    STOPS.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn add(project: &str, terminal: &str, session: &str, account: &str, stop: Stop) {
    if terminal.is_empty() {
        return;
    }
    {
        let mut stops = stops();
        stops.retain(|s| s.terminal != terminal && s.session != session);
        stops.push(TabStop {
            project: project.to_string(),
            terminal: terminal.to_string(),
            session: session.to_string(),
            account: account.to_string(),
            stop,
        });
    }
    changed(project);
}

fn remove(matches: impl Fn(&TabStop) -> bool) -> Option<TabStop> {
    let mut stops = stops();
    let at = stops.iter().position(matches)?;
    Some(stops.remove(at))
}

/// A new turn started in the session `key` names, so its tab moved on.
pub fn on_running(key: &str) {
    let Some(sid) = key.strip_prefix(crate::agentkind::AgentKind::Claude.key_prefix()) else {
        return;
    };
    if let Some(gone) = remove(|s| s.session == sid) {
        changed(&gone.project);
    }
}

/// Retire the stop `terminal` showed: its tab moved to another account, or the
/// user put the bar away.
pub(crate) fn take(terminal: &str) {
    if let Some(gone) = remove(|s| s.terminal == terminal) {
        changed(&gone.project);
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Limit,
    Hold,
    Model,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub account: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly: Option<f64>,
    /// Every account with room is close to a limit; this one has the most.
    pub near: bool,
}

/// With no account to move to: the one that resets first.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirstFree {
    pub account: String,
    pub label: String,
    pub resets_at: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StopView {
    pub kind: Kind,
    pub account: String,
    pub account_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window: Option<Win>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Unix seconds; 0 when Claude Code gave none.
    pub resets_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offer: Option<Offer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_free: Option<FirstFree>,
}

/// What `terminal`'s tab shows about the limit it stopped at, while that still
/// holds: the terminal runs, switching is on, the limit hasn't reset and a hold
/// hasn't been lifted. A stop that no longer holds is forgotten.
pub fn view(terminal: &str) -> Option<StopView> {
    let stop = stops().iter().find(|s| s.terminal == terminal).cloned()?;
    let shown = APP
        .get()
        .is_some_and(|app| {
            crate::pty::session_exists(&app.state::<crate::pty::PtyState>(), terminal)
        })
        .then(|| view_of(&stop))
        .flatten();
    if shown.is_none() {
        remove(|s| s.terminal == terminal);
    }
    shown
}

fn view_of(stop: &TabStop) -> Option<StopView> {
    let file = crate::claude_pool_store::load();
    if !crate::claude_pool::active(&file) {
        return None;
    }
    let now = now_secs();
    let names = crate::remote_claude::labels();
    let label = |id: &str| label(id, &names);
    let base = |kind| StopView {
        kind,
        account: stop.account.clone(),
        account_label: label(&stop.account),
        window: None,
        model: None,
        resets_at: 0,
        offer: None,
        first_free: None,
    };
    match &stop.stop {
        Stop::Hold => file.held.is_some().then(|| base(Kind::Hold)),
        Stop::Model { name, until } => (!passed(*until, now)).then(|| StopView {
            model: Some(name.clone()),
            resets_at: *until,
            ..base(Kind::Model)
        }),
        Stop::Limit { window, until } => {
            if passed(*until, now) {
                return None;
            }
            let picked = crate::claude_pool::pick_without(&stop.project, &stop.account, &file);
            let (offer, first_free) = offer_from(picked, now, label);
            Some(StopView {
                window: Some(*window),
                resets_at: *until,
                offer,
                first_free,
                ..base(Kind::Limit)
            })
        }
    }
}

fn passed(until: i64, now: i64) -> bool {
    until > 0 && until <= now
}

/// The name lpm shows for an account, as the desktop's account menus do.
fn label(id: &str, names: &HashMap<String, String>) -> String {
    if id == MAIN_LOGIN {
        return "Main login".into();
    }
    names
        .get(id)
        .filter(|l| !l.is_empty())
        .cloned()
        .or_else(|| {
            let email = crate::claude_pool_members::ident_of(id).email;
            (!email.is_empty()).then_some(email)
        })
        .unwrap_or_else(|| "Removed account".into())
}

fn offer_from(
    picked: Option<(Pick, Member)>,
    now: i64,
    label: impl Fn(&str) -> String,
) -> (Option<Offer>, Option<FirstFree>) {
    let Some((pick, member)) = picked else {
        return (None, None);
    };
    match pick.kind {
        PickKind::First | PickKind::MostRoom => (
            Some(Offer {
                label: label(&pick.id),
                five_hour: live(&member.five_hour, now).map(|w| w.used.round()),
                weekly: live(&member.weekly, now).map(|w| w.used.round()),
                near: pick.kind == PickKind::MostRoom,
                account: pick.id,
            }),
            None,
        ),
        PickKind::SoonestReset => {
            let resets_at = pick
                .skipped
                .iter()
                .find_map(|s| match &s.skip {
                    Skip::Hit { resets_at, .. } if s.id == pick.id => Some(*resets_at),
                    _ => None,
                })
                .unwrap_or(0);
            (
                None,
                Some(FirstFree {
                    label: label(&pick.id),
                    account: pick.id,
                    resets_at,
                }),
            )
        }
        PickKind::Fallback => (None, None),
    }
}

/// "Main login hit its weekly limit", "Main login was put on hold".
fn headline(v: &StopView) -> String {
    let who = &v.account_label;
    match v.kind {
        Kind::Hold => format!("{who} was put on hold"),
        Kind::Model => format!(
            "{who} hit its weekly {} limit",
            v.model.as_deref().unwrap_or("model")
        ),
        Kind::Limit => {
            let window = match v.window {
                Some(Win::FiveHour) => "5-hour",
                _ => "weekly",
            };
            format!("{who} hit its {window} limit")
        }
    }
}

/// The stop as one line for a notification, `open` saying how to reach the tab
/// ("Open the tab", "Tap").
fn sentence(v: &StopView, now: i64, open: &str) -> String {
    let what = headline(v);
    match v.kind {
        Kind::Hold => format!("{what}. Account switching is paused."),
        Kind::Model => format!("{what}. Type /model to switch models."),
        Kind::Limit => match (&v.offer, &v.first_free) {
            (Some(offer), _) => format!("{what}. {open} to continue on {}.", offer.label),
            (None, Some(first)) => match span(first.resets_at, now) {
                Some(span) => format!(
                    "{what}. Every account is at a limit; {} resets first, in {span}.",
                    first.label
                ),
                None => format!("{what}. Every account is at a limit."),
            },
            (None, None) => match span(v.resets_at, now) {
                Some(span) => format!("{what}. It resets in {span}."),
                None => format!("{what}."),
            },
        },
    }
}

/// "12m", "1h 20m", "2d 14h": how long until `resets_at`; None when unknown or
/// already past.
fn span(resets_at: i64, now: i64) -> Option<String> {
    let delta = resets_at - now;
    if resets_at <= 0 || delta <= 0 {
        return None;
    }
    let mins = (delta + 30) / 60;
    if mins < 60 {
        return Some(format!("{}m", mins.max(1)));
    }
    let (hours, rem) = (mins / 60, mins % 60);
    if hours < 24 {
        return Some(if rem > 0 {
            format!("{hours}h {rem}m")
        } else {
            format!("{hours}h")
        });
    }
    let (days, rem_h) = (hours / 24, hours % 24);
    Some(if rem_h > 0 {
        format!("{days}d {rem_h}h")
    } else {
        format!("{days}d")
    })
}

/// For a notification about the failed turn in the session `key` names: the
/// stop it ran into, once its transcript has been read. Blocks a few seconds at
/// most, so keep it off any thread someone is waiting on.
pub fn notice(key: &str, open: &str) -> Option<String> {
    let sid = key.strip_prefix(crate::agentkind::AgentKind::Claude.key_prefix())?;
    crate::claude_limit_hits::await_verdict(sid);
    let terminal = stops().iter().find(|s| s.session == sid)?.terminal.clone();
    view(&terminal).map(|v| sentence(&v, now_secs(), open))
}

/// The limit a Claude tab stopped at, for its bar; None when it shows none.
#[tauri::command(async)]
pub fn claude_limit_stop(terminal_id: String) -> Option<StopView> {
    view(&terminal_id)
}

/// Put a tab's limit bar away.
#[tauri::command(async)]
pub fn dismiss_claude_limit_stop(terminal_id: String) {
    take(&terminal_id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_pool_pick::{Skipped, Window};

    const NOW: i64 = 1_800_000_000;

    fn limit_view(offer: Option<Offer>, first_free: Option<FirstFree>) -> StopView {
        StopView {
            kind: Kind::Limit,
            account: "default".into(),
            account_label: "Main login".into(),
            window: Some(Win::Weekly),
            model: None,
            resets_at: NOW + 2 * 86_400 + 14 * 3600,
            offer,
            first_free,
        }
    }

    fn member(id: &str, five_hour: f64, weekly: f64) -> Member {
        Member {
            id: id.into(),
            signed_in: true,
            five_hour: Some(Window {
                used: five_hour,
                resets_at: NOW + 3600,
            }),
            weekly: Some(Window {
                used: weekly,
                resets_at: NOW + 86_400,
            }),
            ..Default::default()
        }
    }

    fn pick(id: &str, kind: PickKind, skipped: Vec<Skipped>) -> Pick {
        Pick {
            id: id.into(),
            kind,
            skipped,
        }
    }

    #[test]
    fn spans_read_like_the_usage_meters() {
        assert_eq!(span(NOW + 12 * 60, NOW).as_deref(), Some("12m"));
        assert_eq!(span(NOW + 80 * 60, NOW).as_deref(), Some("1h 20m"));
        assert_eq!(span(NOW + 2 * 3600, NOW).as_deref(), Some("2h"));
        assert_eq!(span(NOW + 62 * 3600, NOW).as_deref(), Some("2d 14h"));
        assert_eq!(span(NOW - 5, NOW), None);
        assert_eq!(span(0, NOW), None);
    }

    #[test]
    fn an_account_with_room_is_offered_with_its_usage() {
        let (offer, first) = offer_from(
            Some((
                pick("acct-2", PickKind::First, vec![]),
                member("acct-2", 18.4, 41.0),
            )),
            NOW,
            |_| "Claude 2".into(),
        );
        let offer = offer.expect("an offer");
        assert_eq!(offer.account, "acct-2");
        assert_eq!(offer.five_hour, Some(18.0));
        assert_eq!(offer.weekly, Some(41.0));
        assert!(!offer.near && first.is_none());
    }

    #[test]
    fn with_every_account_stopped_the_first_to_reset_is_named() {
        let skipped = vec![Skipped {
            id: "acct-2".into(),
            skip: Skip::Hit {
                window: Some(Win::FiveHour),
                resets_at: NOW + 80 * 60,
            },
        }];
        let (offer, first) = offer_from(
            Some((
                pick("acct-2", PickKind::SoonestReset, skipped),
                member("acct-2", 100.0, 50.0),
            )),
            NOW,
            |_| "Claude 2".into(),
        );
        assert!(offer.is_none());
        let first = first.expect("the first to reset");
        assert_eq!(
            (first.label.as_str(), first.resets_at),
            ("Claude 2", NOW + 80 * 60)
        );
    }

    #[test]
    fn a_signed_out_fallback_offers_nothing() {
        let (offer, first) = offer_from(
            Some((
                pick("acct-3", PickKind::Fallback, vec![]),
                member("acct-3", 0.0, 0.0),
            )),
            NOW,
            |_| "Claude 3".into(),
        );
        assert!(offer.is_none() && first.is_none());
    }

    #[test]
    fn notifications_say_what_the_tab_offers() {
        let offer = Offer {
            account: "acct-2".into(),
            label: "Claude 2".into(),
            five_hour: Some(18.0),
            weekly: Some(41.0),
            near: false,
        };
        assert_eq!(
            sentence(&limit_view(Some(offer), None), NOW, "Tap"),
            "Main login hit its weekly limit. Tap to continue on Claude 2."
        );
        let first = FirstFree {
            account: "acct-2".into(),
            label: "Claude 2".into(),
            resets_at: NOW + 80 * 60,
        };
        assert_eq!(
            sentence(&limit_view(None, Some(first)), NOW, "Tap"),
            "Main login hit its weekly limit. Every account is at a limit; Claude 2 resets first, in 1h 20m."
        );
        assert_eq!(
            sentence(&limit_view(None, None), NOW, "Tap"),
            "Main login hit its weekly limit. It resets in 2d 14h."
        );
    }

    #[test]
    fn holds_and_model_limits_point_elsewhere() {
        let hold = StopView {
            kind: Kind::Hold,
            window: None,
            resets_at: 0,
            ..limit_view(None, None)
        };
        assert_eq!(
            sentence(&hold, NOW, "Tap"),
            "Main login was put on hold. Account switching is paused."
        );
        let model = StopView {
            kind: Kind::Model,
            model: Some("Opus".into()),
            window: None,
            ..limit_view(None, None)
        };
        assert_eq!(
            sentence(&model, NOW, "Tap"),
            "Main login hit its weekly Opus limit. Type /model to switch models."
        );
    }

    #[test]
    fn a_five_hour_limit_says_so() {
        let v = StopView {
            window: Some(Win::FiveHour),
            ..limit_view(None, None)
        };
        assert_eq!(headline(&v), "Main login hit its 5-hour limit");
    }
}
