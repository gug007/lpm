// Turns that end, or resume, without the agent saying so.
//
// Hooks are how an agent tells lpm what it is doing, and some turns change
// state without one: Claude Code runs no hook when a turn is interrupted (Esc,
// Ctrl+C) or a dialog is answered with "No", Codex none when a turn dies on an
// error, neither when its process is killed, and answering a permission prompt
// fires nothing either — so the Waiting it raised outlived the dialog for as
// long as the approved tool ran. The pane itself says what the hooks don't: a
// working agent animates several times a second, while a dialog, an idle prompt
// and a dead process draw nothing.
//
// - A watch follows a key that can end a turn — an interrupt to a working agent,
//   an answer to a waiting one. Output that goes quiet after it means the turn
//   ended, and the entry is cleared (not Done: nothing finished, so no chime or
//   banner). Output that keeps flowing after an answer means the agent went back
//   to work, so Waiting becomes Running.
// - A sweep, running only while some agent is live, retires an entry whose
//   terminal is gone or back at its shell prompt, a working one whose terminal
//   has drawn nothing for SILENCE_MS, and any entry whose reported pid is dead.
//
// Either way an entry changes only if it still holds the report that was
// observed: a hook that reported in the meantime always wins.
use crate::pty::{PtySession, PtyState};
use crate::status::{now_millis, StatusEntry, StatusStore, STATUS_RUNNING, STATUS_WAITING};
use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Longer than any working agent goes between frames (Claude ≤0.34 s, Codex
/// ≤0.11 s, a background-agent footer 1 s); shorter than a person notices.
const QUIET_MS: i64 = 2_000;
/// How long output must keep flowing after an answer to count as work resumed.
const WINDOW_MS: i64 = 4_000;
/// A working agent silent this long has stopped, hook or not. Generous, because
/// an agent in a tmux window that isn't showing draws nothing either.
const SILENCE_MS: i64 = 30_000;
const SWEEP_EVERY: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq)]
enum Key {
    /// Stops a working agent: Esc and Ctrl+C, raw or in the kitty keyboard
    /// encoding Claude Code switches the terminal to.
    Interrupt,
    /// Picks an answer in a dialog: Enter, an option number, or a left click
    /// (SGR mouse report) on an option.
    Answer,
    /// Codex's approval hotkeys (y/n/a). Only an answer to Codex: in a Claude
    /// dialog with a text field they are just letters being typed.
    CodexAnswer,
}

fn classify(input: &[u8]) -> Option<Key> {
    match input {
        b"\x1b" | b"\x1b[27u" | b"\x03" | b"\x1b[99;5u" => Some(Key::Interrupt),
        b"\r" | b"\x1b[13u" => Some(Key::Answer),
        b"y" | b"Y" | b"n" | b"N" | b"a" => Some(Key::CodexAnswer),
        [digit] if (b'1'..=b'9').contains(digit) => Some(Key::Answer),
        _ if input.starts_with(b"\x1b[<0;") && input.ends_with(b"M") => Some(Key::Answer),
        _ => None,
    }
}

/// Whether `key` can end or answer what `entry` reports.
fn concerns(key: Key, entry: &StatusEntry) -> bool {
    if entry.held {
        return false;
    }
    match key {
        Key::Interrupt => true,
        Key::Answer => entry.value == STATUS_WAITING,
        Key::CodexAnswer => entry.value == STATUS_WAITING && entry.key.starts_with("codex_"),
    }
}

struct Watch {
    project: String,
    since: i64,
    seen: Vec<StatusEntry>,
}

fn watches() -> &'static Mutex<HashMap<String, Watch>> {
    static WATCHES: OnceLock<Mutex<HashMap<String, Watch>>> = OnceLock::new();
    WATCHES.get_or_init(Default::default)
}

/// Called with every input written to a terminal. Costs a byte comparison for
/// anything but a turn key, and a store lookup for those.
pub fn on_input(app: &AppHandle, sess: &PtySession, input: &[u8]) {
    let Some(key) = classify(input) else {
        return;
    };
    crate::approvalgrace::answered(&sess.id);
    let seen: Vec<StatusEntry> = app
        .state::<Arc<StatusStore>>()
        .live_agent_entries_on(&sess.project_name, &sess.id)
        .into_iter()
        .filter(|e| concerns(key, e))
        .collect();
    if seen.is_empty() {
        return;
    }
    let watch = Watch {
        project: sess.project_name.clone(),
        since: now_millis(),
        seen,
    };
    let fresh = watches()
        .lock()
        .unwrap()
        .insert(sess.id.clone(), watch)
        .is_none();
    if fresh {
        let app = app.clone();
        let pane = sess.id.clone();
        std::thread::spawn(move || follow(&app, &pane));
    }
}

enum Outcome {
    Ended,
    Resumed,
}

/// Waits out one terminal's watch; a newer key restarts it rather than racing it.
fn follow(app: &AppHandle, pane: &str) {
    loop {
        let Some(since) = watches().lock().unwrap().get(pane).map(|w| w.since) else {
            return;
        };
        let Some(sess) = crate::pty::session(&app.state::<PtyState>(), pane) else {
            watches().lock().unwrap().remove(pane);
            return;
        };
        let now = now_millis();
        let drew = sess.last_output().max(since);
        let outcome = if now - drew >= QUIET_MS {
            Some(Outcome::Ended)
        } else if now - since >= WINDOW_MS {
            Some(Outcome::Resumed)
        } else {
            None
        };
        let Some(outcome) = outcome else {
            let wait = (drew + QUIET_MS).min(since + WINDOW_MS) - now;
            std::thread::sleep(Duration::from_millis(wait.max(50) as u64));
            continue;
        };
        let mut held = watches().lock().unwrap();
        if held.get(pane).is_some_and(|w| w.since != since) {
            continue;
        }
        let Some(watch) = held.remove(pane) else {
            return;
        };
        drop(held);
        settle(app, &watch, outcome);
        return;
    }
}

fn settle(app: &AppHandle, watch: &Watch, outcome: Outcome) {
    let store = app.state::<Arc<StatusStore>>();
    let mut changed = false;
    for seen in &watch.seen {
        changed |= match outcome {
            Outcome::Ended => store.clear_if_unchanged(&watch.project, &seen.key, seen),
            Outcome::Resumed if seen.value == STATUS_WAITING => {
                store.replace_if_unchanged(&watch.project, seen, running(seen))
            }
            Outcome::Resumed => false,
        };
    }
    if changed {
        let _ = app.emit("status-changed", &watch.project);
    }
}

/// The Running report the agent's own hooks would have sent.
fn running(waiting: &StatusEntry) -> StatusEntry {
    let (icon, color) = if waiting.key.starts_with("codex_") {
        ("sparkle", "#10A37F")
    } else {
        ("bolt", "#4C8DFF")
    };
    StatusEntry {
        key: waiting.key.clone(),
        value: STATUS_RUNNING.into(),
        icon: icon.into(),
        color: color.into(),
        priority: waiting.priority,
        timestamp: now_millis(),
        pane_id: waiting.pane_id.clone(),
        ..Default::default()
    }
}

/// A Stop that may not end the work. Claude starts a queued prompt's turn the
/// moment this one stops, its UserPromptSubmit having fired at queue time; Codex
/// starts a /goal's next turn, or carries on when another Stop hook blocks the
/// stop, with no hook at all. A plain Done would read "finished" (chime and
/// banner included) all through that work. Hold the Done while the pane shows
/// which happened: still animating means the work goes on and the session stays
/// Running until the pane goes quiet (sub-agents a Codex root left working end
/// with no hook of its own); a newer report from the agent takes over instead.
pub fn finish_unless_still_working(app: &AppHandle, project: &str, done: StatusEntry) {
    let store = app.state::<Arc<StatusStore>>();
    let Some(seen) = store.live_entry(project, &done.key) else {
        crate::socketsrv::publish(app, &store, project, done);
        return;
    };
    let app = app.clone();
    let project = project.to_string();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(QUIET_MS as u64));
        let store = app.state::<Arc<StatusStore>>();
        if !store.holds(&project, &seen) {
            return;
        }
        let drawing = crate::pty::session(&app.state::<PtyState>(), &done.pane_id)
            .is_some_and(|sess| now_millis() - sess.last_output() < QUIET_MS / 2);
        if drawing {
            continue;
        }
        let done = StatusEntry {
            timestamp: now_millis(),
            ..done
        };
        crate::socketsrv::publish(&app, &store, &project, done);
        return;
    });
}

fn sweep_signal() -> &'static (Mutex<bool>, Condvar) {
    static SIGNAL: OnceLock<(Mutex<bool>, Condvar)> = OnceLock::new();
    SIGNAL.get_or_init(Default::default)
}

/// Something an agent sweep should look at was just reported.
pub fn nudge() {
    let (live, wake) = sweep_signal();
    *live.lock().unwrap() = true;
    wake.notify_one();
}

/// The sweep thread. Sleeps on its signal while nothing is live, so an idle app
/// pays no wakeups for it.
pub fn start_sweep(app: AppHandle) {
    std::thread::spawn(move || {
        let (live, wake) = sweep_signal();
        loop {
            {
                let mut on = live.lock().unwrap();
                while !*on {
                    on = wake.wait(on).unwrap();
                }
            }
            std::thread::sleep(SWEEP_EVERY);
            if !sweep(&app) {
                *live.lock().unwrap() = false;
            }
        }
    });
}

/// One pass. Returns whether anything is left to look at next time.
fn sweep(app: &AppHandle) -> bool {
    let store = app.state::<Arc<StatusStore>>();
    let ptys = app.state::<PtyState>();
    let now = now_millis();
    let mut changed = BTreeSet::new();
    let mut left = false;
    for (project, entry) in store.live_agent_entries() {
        let sess = crate::pty::session(&ptys, &entry.pane_id);
        let children = crate::agentchildren::busy(&project, &entry.key);
        if is_stale(sess.as_deref(), &entry, children, now) {
            if store.clear_if_unchanged(&project, &entry.key, &entry) {
                changed.insert(project);
            }
        } else {
            left = true;
        }
    }
    for (project, entry) in store.pid_entries() {
        if !crate::osproc::is_alive(entry.agent_pid as u32) {
            if store.clear_if_unchanged(&project, &entry.key, &entry) {
                changed.insert(project);
            }
        } else {
            left = true;
        }
    }
    for project in changed {
        let _ = app.emit("status-changed", &project);
    }
    left
}

/// `children`: sub-agents it spawned are still working, which draws nothing.
fn is_stale(sess: Option<&PtySession>, entry: &StatusEntry, children: bool, now: i64) -> bool {
    let Some(sess) = sess else {
        return true;
    };
    if sess.shell_at_prompt() == Some(true) {
        return true;
    }
    entry.value == STATUS_RUNNING
        && !children
        && !sess.output_paused()
        && now - sess.last_output().max(entry.timestamp) >= SILENCE_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interrupts_in_every_encoding() {
        for key in [&b"\x1b"[..], b"\x1b[27u", b"\x03", b"\x1b[99;5u"] {
            assert!(classify(key) == Some(Key::Interrupt), "{key:?}");
        }
    }

    #[test]
    fn dialog_answers() {
        for key in [&b"\r"[..], b"1", b"9", b"\x1b[13u", b"\x1b[<0;12;5M"] {
            assert!(classify(key) == Some(Key::Answer), "{key:?}");
        }
        for key in [&b"y"[..], b"n", b"a"] {
            assert!(classify(key) == Some(Key::CodexAnswer), "{key:?}");
        }
    }

    fn waiting(key: &str) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: STATUS_WAITING.into(),
            ..Default::default()
        }
    }

    #[test]
    fn a_held_wait_is_left_to_its_hooks() {
        let held = StatusEntry {
            held: true,
            ..waiting("claude_code_s1")
        };
        assert!(!concerns(Key::Answer, &held));
        assert!(!concerns(Key::Interrupt, &held));
    }

    // Typing "yellow" into a Claude dialog's text field must not read as an answer.
    #[test]
    fn approval_letters_answer_only_codex() {
        assert!(concerns(Key::CodexAnswer, &waiting("codex_pane-1")));
        assert!(!concerns(Key::CodexAnswer, &waiting("claude_code_s1")));
        assert!(concerns(Key::Answer, &waiting("claude_code_s1")));
    }

    // Claude Code turns on mouse motion and focus reporting, so a pointer resting
    // on a waiting tab sends a stream of these; none of them answers anything.
    #[test]
    fn reports_and_typing_are_not_turn_keys() {
        for input in [
            &b"\x1b[<35;12;5M"[..],
            b"\x1b[<0;12;5m",
            b"\x1b[I",
            b"\x1b[O",
            b"0",
            b"hello",
            b"\x1b[A",
            b"fix the bug\r",
        ] {
            assert!(classify(input).is_none(), "{input:?}");
        }
    }
}
