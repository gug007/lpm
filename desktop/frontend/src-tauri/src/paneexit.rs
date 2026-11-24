//! Telling the app when a service's line ends. The session daemon only answers
//! questions, so this asks it every second which panes have ended and
//! re-announces the projects when that changes: a crash, an `exit`, a restart.
//! Without it a service that died kept its green dot until something else made
//! the projects reload.
use std::collections::BTreeSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_secs(1);

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = BTreeSet::new();
        loop {
            std::thread::sleep(POLL);
            let now = ended_panes();
            if now != last {
                last = now;
                let _ = app.emit("projects-changed", ());
            }
        }
    });
}

fn ended_panes() -> BTreeSet<(String, i64, Option<i32>)> {
    crate::sessions::all_panes()
        .into_iter()
        .filter(|pane| pane.ended)
        .map(|pane| (pane.id, pane.started, pane.code))
        .collect()
}
