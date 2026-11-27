// A turn paused beside background shells (donehold.rs) for long enough that it
// may never carry on: a shell that runs until stopped but didn't look like one,
// or one that hangs. The user hears it is still paused — on this Mac, the Mac
// they use, and their phones, under the switches a finish would ring — and
// marks it finished from the tab, the sidebar or the phone when it is.
use crate::sound::{StatusSound, PAUSED_NEWS};
use tauri::AppHandle;

/// Tell the user the turn behind `key` on `pane_id` is still paused, `age` ms
/// after it stopped, naming the shells it waits on. Nothing when every one of
/// them was named before: earlier in this pause, or in a session woken now and
/// then beside the same shell.
pub fn notice(app: &AppHandle, project: &str, key: &str, pane_id: &str, age: i64) {
    let Some(shells) = crate::bgtasks::take_unnoticed(project, key) else {
        return;
    };
    let news = StatusSound {
        value: PAUSED_NEWS.to_string(),
        project: crate::config::project_display_name(project),
        terminal: crate::remote::terminal_label(app, pane_id).unwrap_or_default(),
        elapsed_ms: Some(whole_minutes(age)),
        answer: Some(shells.join(" · ")),
    };
    crate::statusroute::announce_news(app, project, pane_id, &news);
    crate::remote::push_pause_notice(app, project, key, pane_id, &news);
}

/// "15m", not the "15m 1s" a tick late would say.
fn whole_minutes(ms: i64) -> u64 {
    (ms.max(0) / 60_000 * 60_000) as u64
}

/// The user says the paused agents behind `keys` are done: each finish goes
/// out now.
#[tauri::command]
pub fn finish_paused_agent(app: AppHandle, project: String, keys: Vec<String>) {
    for key in &keys {
        crate::donehold::finish_paused(&app, &project, key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_notice_counts_whole_minutes() {
        assert_eq!(whole_minutes(15 * 60_000 + 999), 15 * 60_000);
        assert_eq!(whole_minutes(-5), 0);
    }
}
