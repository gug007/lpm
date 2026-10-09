//! The rule that decides which account a new Claude session starts on. Pure:
//! everything it knows arrives in `Member`s, so it is tested on plain values.
//!
//! 1. Go down the list. Skip accounts that are signed out, signed in as the
//!    same account as one higher up, not allowed (a team seat nobody approved),
//!    not confirmed as the user's own, stopped (limit hit or on hold), or at
//!    `SWITCH_AT`% of either limit. Use the first one left; no reading yet
//!    counts as room.
//! 2. Every usable account near a limit: the one with the most room that
//!    hasn't hit one, staying on the current account unless another has
//!    `KEEP_MARGIN` points more room.
//! 3. Every usable account stopped: the one that resets first.
use serde::Serialize;

pub const SWITCH_AT: f64 = 90.0;
/// How much more room another near-limit account needs before new sessions
/// leave the current one, so two accounts filling up together don't trade
/// places on every reading.
const KEEP_MARGIN: f64 = 3.0;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Window {
    pub used: f64,
    /// Unix seconds; 0 when the provider gave none.
    pub resets_at: i64,
}

#[derive(Clone, Debug, Default)]
pub struct Member {
    pub id: String,
    pub signed_in: bool,
    /// Same value for two dirs signed in as one Claude account.
    pub identity: Option<String>,
    pub allowed: bool,
    /// The user confirmed this account is theirs alone.
    pub confirmed: bool,
    pub five_hour: Option<Window>,
    pub weekly: Option<Window>,
    /// A reported hard stop until this time (unix seconds), 0 when none.
    pub stopped_until: i64,
    pub on_hold: bool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Win {
    FiveHour,
    Weekly,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Skip {
    SignedOut,
    SameAccount {
        #[serde(rename = "as")]
        as_id: String,
    },
    NotAllowed,
    Unconfirmed,
    OnHold,
    Hit {
        window: Option<Win>,
        #[serde(rename = "resetsAt")]
        resets_at: i64,
    },
    Near {
        window: Win,
        percent: f64,
        #[serde(rename = "resetsAt")]
        resets_at: i64,
    },
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PickKind {
    First,
    MostRoom,
    SoonestReset,
    /// Nothing usable, but an account that is only signed out: Claude Code
    /// asks the user to sign in there.
    Fallback,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Skipped {
    pub id: String,
    pub skip: Skip,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pick {
    pub id: String,
    pub kind: PickKind,
    /// Members passed over on the way, in list order.
    pub skipped: Vec<Skipped>,
}

fn live(w: &Option<Window>, now: i64) -> Option<&Window> {
    w.as_ref().filter(|w| w.resets_at == 0 || w.resets_at > now)
}

fn windows(m: &Member, now: i64) -> [(Win, Option<&Window>); 2] {
    [
        (Win::FiveHour, live(&m.five_hour, now)),
        (Win::Weekly, live(&m.weekly, now)),
    ]
}

/// Why `m` can't take new sessions, or None when it can.
fn skip_of(m: &Member, earlier: &[&Member], now: i64) -> Option<Skip> {
    if !m.signed_in {
        return Some(Skip::SignedOut);
    }
    if let Some(ident) = &m.identity {
        if let Some(first) = earlier
            .iter()
            .find(|e| e.signed_in && e.identity.as_ref() == Some(ident))
        {
            return Some(Skip::SameAccount {
                as_id: first.id.clone(),
            });
        }
    }
    if !m.allowed {
        return Some(Skip::NotAllowed);
    }
    if !m.confirmed {
        return Some(Skip::Unconfirmed);
    }
    if m.on_hold {
        return Some(Skip::OnHold);
    }
    if m.stopped_until > now {
        return Some(Skip::Hit {
            window: None,
            resets_at: m.stopped_until,
        });
    }
    let ws = windows(m, now);
    if let Some((win, w)) = ws
        .iter()
        .find_map(|(k, w)| w.filter(|w| w.used >= 100.0).map(|w| (*k, w)))
    {
        return Some(Skip::Hit {
            window: Some(win),
            resets_at: w.resets_at,
        });
    }
    ws.iter()
        .find_map(|(k, w)| w.filter(|w| w.used >= SWITCH_AT).map(|w| (*k, w)))
        .map(|(win, w)| Skip::Near {
            window: win,
            percent: w.used,
            resets_at: w.resets_at,
        })
}

fn worst(m: &Member, now: i64) -> f64 {
    windows(m, now)
        .iter()
        .filter_map(|(_, w)| w.map(|w| w.used))
        .fold(0.0, f64::max)
}

/// `current` is the account the pool's new sessions use now, if any.
pub fn pick(members: &[Member], now: i64, current: Option<&str>) -> Option<Pick> {
    let mut skipped = Vec::new();
    let mut near: Vec<&Member> = Vec::new();
    let mut hit: Vec<(&Member, i64)> = Vec::new();
    for (i, m) in members.iter().enumerate() {
        let earlier: Vec<&Member> = members[..i].iter().collect();
        match skip_of(m, &earlier, now) {
            None => {
                return Some(Pick {
                    id: m.id.clone(),
                    kind: PickKind::First,
                    skipped,
                })
            }
            Some(skip) => {
                match &skip {
                    Skip::Near { .. } => near.push(m),
                    Skip::Hit { resets_at, .. } => hit.push((m, *resets_at)),
                    _ => {}
                }
                skipped.push(Skipped {
                    id: m.id.clone(),
                    skip,
                });
            }
        }
    }
    if let Some(best) = near
        .iter()
        .min_by(|a, b| worst(a, now).total_cmp(&worst(b, now)))
    {
        let keep = near
            .iter()
            .find(|m| Some(m.id.as_str()) == current)
            .filter(|c| worst(c, now) - worst(best, now) < KEEP_MARGIN);
        return Some(Pick {
            id: keep.unwrap_or(best).id.clone(),
            kind: PickKind::MostRoom,
            skipped,
        });
    }
    let soonest = |r: i64| if r <= 0 { i64::MAX } else { r };
    if let Some((best, _)) = hit.iter().min_by_key(|(_, r)| soonest(*r)) {
        return Some(Pick {
            id: best.id.clone(),
            kind: PickKind::SoonestReset,
            skipped,
        });
    }
    let signed_out = skipped
        .iter()
        .find(|s| s.skip == Skip::SignedOut)
        .map(|s| s.id.clone())?;
    Some(Pick {
        id: signed_out,
        kind: PickKind::Fallback,
        skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;

    fn m(id: &str, five: Option<f64>, week: Option<f64>) -> Member {
        Member {
            id: id.into(),
            signed_in: true,
            identity: Some(format!("u-{id}")),
            allowed: true,
            confirmed: true,
            five_hour: five.map(|used| Window {
                used,
                resets_at: NOW + 3600,
            }),
            weekly: week.map(|used| Window {
                used,
                resets_at: NOW + 86_400,
            }),
            ..Default::default()
        }
    }

    fn ids(p: &Pick) -> Vec<&str> {
        p.skipped.iter().map(|s| s.id.as_str()).collect()
    }

    #[test]
    fn keeps_the_first_account_with_room() {
        let p = pick(
            &[m("a", Some(40.0), Some(60.0)), m("b", Some(0.0), None)],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!((p.id.as_str(), p.kind), ("a", PickKind::First));
        assert!(p.skipped.is_empty());
    }

    #[test]
    fn moves_on_at_ninety_percent_of_either_window() {
        let p = pick(
            &[m("a", Some(91.0), Some(10.0)), m("b", Some(5.0), Some(5.0))],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!(p.id, "b");
        assert_eq!(ids(&p), ["a"]);
        assert!(matches!(
            p.skipped[0].skip,
            Skip::Near {
                window: Win::FiveHour,
                ..
            }
        ));
        let p = pick(
            &[m("a", Some(10.0), Some(95.0)), m("b", None, None)],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!(p.id, "b");
        assert!(matches!(
            p.skipped[0].skip,
            Skip::Near {
                window: Win::Weekly,
                ..
            }
        ));
    }

    #[test]
    fn no_reading_counts_as_room() {
        let p = pick(&[m("a", None, None), m("b", Some(1.0), None)], NOW, None).unwrap();
        assert_eq!(p.id, "a");
    }

    #[test]
    fn a_reset_window_counts_as_room() {
        let mut a = m("a", Some(100.0), None);
        a.five_hour.as_mut().unwrap().resets_at = NOW - 1;
        assert_eq!(pick(&[a, m("b", None, None)], NOW, None).unwrap().id, "a");
    }

    #[test]
    fn all_near_takes_the_most_room() {
        let p = pick(
            &[
                m("a", Some(96.0), None),
                m("b", Some(93.0), Some(88.0)),
                m("c", Some(99.0), None),
            ],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!((p.id.as_str(), p.kind), ("b", PickKind::MostRoom));
    }

    #[test]
    fn a_near_account_beats_one_that_hit_its_limit() {
        let p = pick(
            &[m("a", Some(100.0), None), m("b", Some(97.0), None)],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!(p.id, "b");
    }

    #[test]
    fn all_stopped_takes_the_soonest_reset() {
        let mut a = m("a", None, Some(100.0));
        a.weekly.as_mut().unwrap().resets_at = NOW + 50_000;
        let mut b = m("b", Some(100.0), None);
        b.five_hour.as_mut().unwrap().resets_at = NOW + 600;
        let p = pick(&[a, b], NOW, None).unwrap();
        assert_eq!((p.id.as_str(), p.kind), ("b", PickKind::SoonestReset));
    }

    #[test]
    fn skips_signed_out_duplicate_unallowed_and_held_accounts() {
        let mut out = m("out", None, None);
        out.signed_in = false;
        let mut dup = m("dup", None, None);
        dup.identity = Some("u-main".into());
        let mut team = m("team", None, None);
        team.allowed = false;
        let mut held = m("held", None, None);
        held.on_hold = true;
        let p = pick(
            &[
                m("main", Some(95.0), None),
                out,
                dup,
                team,
                held,
                m("ok", None, None),
            ],
            NOW,
            None,
        )
        .unwrap();
        assert_eq!(p.id, "ok");
        assert_eq!(ids(&p), ["main", "out", "dup", "team", "held"]);
        assert_eq!(
            p.skipped[2].skip,
            Skip::SameAccount {
                as_id: "main".into()
            }
        );
    }

    #[test]
    fn a_reported_stop_skips_the_account_until_it_ends() {
        let mut a = m("a", Some(20.0), None);
        a.stopped_until = NOW + 60;
        assert_eq!(
            pick(&[a.clone(), m("b", None, None)], NOW, None)
                .unwrap()
                .id,
            "b"
        );
        a.stopped_until = NOW - 1;
        assert_eq!(pick(&[a, m("b", None, None)], NOW, None).unwrap().id, "a");
    }

    #[test]
    fn nothing_usable_falls_back_only_to_a_signed_out_account() {
        let mut team = m("team", None, None);
        team.allowed = false;
        let mut out = m("out", None, None);
        out.signed_in = false;
        let p = pick(&[team.clone(), out], NOW, None).unwrap();
        assert_eq!((p.id.as_str(), p.kind), ("out", PickKind::Fallback));
        assert!(pick(&[team], NOW, None).is_none());
        assert!(pick(&[], NOW, None).is_none());
    }

    #[test]
    fn an_unconfirmed_account_is_never_picked() {
        let mut new = m("new", None, None);
        new.confirmed = false;
        let p = pick(&[new, m("ok", Some(10.0), None)], NOW, None).unwrap();
        assert_eq!(p.id, "ok");
        assert_eq!(p.skipped[0].skip, Skip::Unconfirmed);
    }

    #[test]
    fn near_the_limit_it_stays_unless_another_has_clearly_more_room() {
        let members = [m("a", Some(92.0), None), m("b", Some(91.0), None)];
        assert_eq!(pick(&members, NOW, Some("a")).unwrap().id, "a");
        assert_eq!(pick(&members, NOW, None).unwrap().id, "b");
        let members = [m("a", Some(96.0), None), m("b", Some(91.0), None)];
        assert_eq!(pick(&members, NOW, Some("a")).unwrap().id, "b");
    }
}
