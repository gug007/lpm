//! The popups made lately, so a card opens on what it showed last instead of
//! waiting on its commands, and a run that fails doesn't take good data off
//! the card. One per action, kept in memory for a day; one made from a config
//! since changed doesn't count.
use crate::popup_content::PopupContent;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const KEEP: Duration = Duration::from_secs(24 * 3600);

struct Saved {
    at: Instant,
    config: u64,
    content: PopupContent,
}

fn saved() -> &'static Mutex<HashMap<String, Saved>> {
    static SAVED: OnceLock<Mutex<HashMap<String, Saved>>> = OnceLock::new();
    SAVED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn turns() -> &'static Mutex<HashMap<String, Arc<Mutex<()>>>> {
    static TURNS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    TURNS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The last result for `key` made from the config fingerprinted `config`, and
/// how long ago it was made or last tried.
pub(crate) fn get(key: &str, config: u64) -> Option<(Duration, PopupContent)> {
    let saved = saved().lock().unwrap();
    let entry = saved.get(key).filter(|entry| entry.config == config)?;
    Some((entry.at.elapsed(), entry.content.clone()))
}

pub(crate) fn remember(key: String, config: u64, content: PopupContent) {
    let mut saved = saved().lock().unwrap();
    saved.retain(|_, entry| entry.at.elapsed() < KEEP);
    turns()
        .lock()
        .unwrap()
        .retain(|key, turn| saved.contains_key(key) || Arc::strong_count(turn) > 1);
    saved.insert(
        key,
        Saved {
            at: Instant::now(),
            config,
            content,
        },
    );
}

/// Held while `key`'s commands run, so a second ask waits for that run
/// instead of starting its own.
pub(crate) fn turn(key: &str) -> Arc<Mutex<()>> {
    turns()
        .lock()
        .unwrap()
        .entry(key.to_string())
        .or_default()
        .clone()
}

/// What to show after a run: the new result, unless it failed while the last
/// one was good, which then stays with the failure beside it.
pub(crate) fn keep_last_good(previous: Option<PopupContent>, made: PopupContent) -> PopupContent {
    if made.failure().is_empty() {
        return made;
    }
    match previous {
        Some(good) if good.failure().is_empty() => PopupContent {
            refresh_error: made.failure().to_string(),
            ..good
        },
        _ => made,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good(at: i64) -> PopupContent {
        PopupContent {
            html: Some("<p></p>".into()),
            data: serde_json::json!({ "total": 1 }),
            updated_at: at,
            ..Default::default()
        }
    }

    #[test]
    fn a_new_good_result_replaces_the_last() {
        let made = good(2);
        assert_eq!(keep_last_good(Some(good(1)), made.clone()), made);
    }

    #[test]
    fn a_failed_run_keeps_the_last_good_result_and_says_why() {
        let failed = PopupContent {
            html: Some("<p></p>".into()),
            data_error: "The data command exited with 1: rate limited.".into(),
            updated_at: 2,
            ..Default::default()
        };
        let kept = keep_last_good(Some(good(1)), failed);
        assert_eq!(kept.updated_at, 1);
        assert_eq!(kept.data, serde_json::json!({ "total": 1 }));
        assert_eq!(kept.refresh_error, "The data command exited with 1: rate limited.");
    }

    #[test]
    fn a_failure_with_nothing_good_before_shows_the_failure() {
        let failed = PopupContent {
            error: "Can't find page.html.".into(),
            ..Default::default()
        };
        assert_eq!(keep_last_good(None, failed.clone()), failed);
        let bad_before = PopupContent {
            error: "Can't find page.html.".into(),
            ..Default::default()
        };
        assert_eq!(keep_last_good(Some(bad_before), failed.clone()), failed);
    }

    #[test]
    fn a_saved_result_comes_back_with_its_age_until_the_config_changes() {
        remember("popup-cache-test".into(), 1, good(7));
        let (age, content) = get("popup-cache-test", 1).unwrap();
        assert!(age < Duration::from_secs(5));
        assert_eq!(content.updated_at, 7);
        assert!(get("popup-cache-test", 2).is_none());
        assert!(get("popup-cache-missing", 1).is_none());
    }
}
