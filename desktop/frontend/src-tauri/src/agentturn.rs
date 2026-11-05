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
//   banner). Output that keeps flowing at a working agent's pace after an
//   answer means the agent went back to work, so Waiting becomes Running. A
//   dialog that is still open draws too — a Bash approval blinks its bullet —
//   but slower, and a watch that sees neither leaves the entry alone.
// - A sweep, running only while some agent is live, retires an entry whose
//   terminal is gone or back at its shell prompt, a working one whose terminal
//   has drawn nothing for SILENCE_MS since the agent last reported — unless its
//   transcript shows the turn still going, as it does while Claude's fullscreen
//   view is scrolled away from its spinner (claude_turn.rs) — and any entry
//   whose reported pid is dead. A session whose finish is being held
//   (donehold.rs) or whose sub-agents still work draws nothing while it waits,
//   and is left alone.
//
// Either way an entry changes only if it still holds the report that was
// observed: a hook that reported in the meantime always wins.
use crate::agentkind::AgentKind;
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
/// A click is no answer we can read: it may pick an option or land anywhere,
/// and a Bash approval still open blinks its bullet every 0.6 s. So work resumed
/// after a click is a working agent's pace — Claude's spinner draws at most
/// 0.45 s apart — kept up through the last CADENCE_MS.
const CADENCE_MS: i64 = 2_000;
const CADENCE_GAP_MS: i64 = 500;
/// A watch that has seen neither the quiet of an ended turn nor work resuming
/// by then leaves the entry as it is.
const GIVE_UP_MS: i64 = 30_000;
/// A click this close to the pane taking focus is what focused it.
const FOCUS_CLICK_MS: i64 = 300;
/// A working agent silent this long has stopped, hook or not. Generous, because
/// an agent in a tmux window that isn't showing draws nothing either.
const SILENCE_MS: i64 = 30_000;
/// A tool call draws nothing of its own, and Claude's fullscreen view scrolled
/// away from its spinner draws nothing at all: a call, or a turn its transcript
/// shows going on, silent this long — Bash's own timeout — has stopped.
const TOOL_SILENCE_MS: i64 = 600_000;
/// While any background agent or teammate works, Claude redraws its footer
/// every second: a pane silent this long has none left, whatever their stops
/// said — Ctrl+C at the prompt stops them all without one. (Codex's sub-agents
/// work without drawing anything.)
const CHILDREN_SILENCE_MS: i64 = 120_000;
const SWEEP_EVERY: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, PartialEq)]
enum Key {
    /// Stops a working agent: Esc and Ctrl+C, raw or in the kitty keyboard
    /// encoding Claude Code switches the terminal to.
    Interrupt,
    /// Ctrl+C, which at Claude's idle prompt also stops every background agent
    /// — without a SubagentStop.
    CtrlC,
    /// Picks an answer in a dialog: Enter or an option number.
    Answer,
    /// A left click (SGR mouse report), on an option or anywhere else.
    Click,
    /// Codex's approval hotkeys (y/n/a). Only an answer to Codex: in a Claude
    /// dialog with a text field they are just letters being typed.
    CodexAnswer,
}

fn classify(input: &[u8]) -> Option<Key> {
    match input {
        b"\x1b" | b"\x1b[27u" => Some(Key::Interrupt),
        b"\x03" | b"\x1b[99;5u" => Some(Key::CtrlC),
        b"\r" | b"\x1b[13u" => Some(Key::Answer),
        b"y" | b"Y" | b"n" | b"N" | b"a" => Some(Key::CodexAnswer),
        [digit] if (b'1'..=b'9').contains(digit) => Some(Key::Answer),
        _ if input.starts_with(b"\x1b[<0;") && input.ends_with(b"M") => Some(Key::Click),
        _ => None,
    }
}

const FOCUS_IN: &[u8] = b"\x1b[I";

/// Whether `key` can end or answer what `entry` reports. A dialog of several
/// steps takes several answers, and an MCP dialog only its own hooks end; an
/// interrupt closes either — and is the way out of one whose agent died.
fn concerns(key: Key, entry: &StatusEntry) -> bool {
    match key {
        Key::Interrupt | Key::CtrlC => true,
        _ if entry.held => false,
        Key::Answer | Key::Click => entry.value == STATUS_WAITING && !entry.form,
        Key::CodexAnswer => {
            entry.value == STATUS_WAITING && AgentKind::of_key(&entry.key) == Some(AgentKind::Codex)
        }
    }
}

/// Whether `key` leaves `entry` alone because its session is idle at the prompt
/// while its finish is held for background work: Esc interrupts nothing there.
/// Ctrl+C does — it stops the background agents.
fn idle_key(key: Key, project: &str, entry: &StatusEntry) -> bool {
    key == Key::Interrupt && entry.value == crate::status::STATUS_RUNNING && crate::donehold::idle(project, &entry.key)
}

struct Watch {
    project: String,
    since: i64,
    seen: Vec<StatusEntry>,
    click: bool,
}

fn watches() -> &'static Mutex<HashMap<String, Watch>> {
    static WATCHES: OnceLock<Mutex<HashMap<String, Watch>>> = OnceLock::new();
    WATCHES.get_or_init(Default::default)
}

/// When each terminal last took focus.
fn focused() -> &'static Mutex<HashMap<String, i64>> {
    static FOCUSED: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();
    FOCUSED.get_or_init(Default::default)
}

/// Called with every input written to a terminal. Costs a byte comparison for
/// anything but a turn key, and a store lookup for those.
pub fn on_input(app: &AppHandle, sess: &PtySession, input: &[u8]) {
    let now = now_millis();
    if input == FOCUS_IN {
        took_focus(&sess.id, now);
        return;
    }
    let Some(key) = classify(input) else {
        return;
    };
    if key == Key::Click && focusing_click(&sess.id, now) {
        return;
    }
    if matches!(key, Key::Interrupt | Key::CtrlC) {
        crate::claude_turn::stop_key(&sess.id, now);
    }
    crate::approvalgrace::answered(&sess.id);
    let project = &sess.project_name;
    let seen: Vec<StatusEntry> = app
        .state::<Arc<StatusStore>>()
        .live_agent_entries_on(project, &sess.id)
        .into_iter()
        .filter(|e| concerns(key, e) && !idle_key(key, project, e))
        .collect();
    if key == Key::CtrlC {
        for e in seen.iter().filter(|e| crate::donehold::idle(project, &e.key)) {
            crate::agentchildren::forget(project, &e.key);
        }
    }
    if seen.is_empty() {
        return;
    }
    let watch = Watch {
        project: sess.project_name.clone(),
        since: now,
        seen,
        click: key == Key::Click,
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

/// Clicking into a terminal reports the click as well as the focus, in either
/// order: a click that only focused the pane answers nothing.
fn took_focus(pane: &str, now: i64) {
    focused().lock().unwrap().insert(pane.to_string(), now);
    let mut watches = watches().lock().unwrap();
    if watches
        .get(pane)
        .is_some_and(|w| w.click && now - w.since < FOCUS_CLICK_MS)
    {
        watches.remove(pane);
    }
}

fn focusing_click(pane: &str, now: i64) -> bool {
    focused()
        .lock()
        .unwrap()
        .get(pane)
        .is_some_and(|at| now - at < FOCUS_CLICK_MS)
}

enum Outcome {
    Ended,
    Resumed,
    Unsure,
}

/// What a watch since `since` has seen by `now`: output last at `drew`, and the
/// times of the latest chunks, `recent`. After a click only a working pace
/// counts as work resumed.
fn outcome(since: i64, drew: i64, recent: &[i64], click: bool, now: i64) -> Option<Outcome> {
    if now - drew.max(since) >= QUIET_MS {
        Some(Outcome::Ended)
    } else if now - since >= WINDOW_MS && (!click || steady(recent, now)) {
        Some(Outcome::Resumed)
    } else if now - since >= GIVE_UP_MS {
        Some(Outcome::Unsure)
    } else {
        None
    }
}

/// Whether output kept coming at a working agent's pace through CADENCE_MS.
fn steady(recent: &[i64], now: i64) -> bool {
    let from = now - CADENCE_MS;
    let Some(first) = recent.iter().position(|at| *at >= from) else {
        return false;
    };
    let mut last = from;
    for at in &recent[first..] {
        if at - last >= CADENCE_GAP_MS {
            return false;
        }
        last = *at;
    }
    now - last < CADENCE_GAP_MS
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
        let click = watches().lock().unwrap().get(pane).is_some_and(|w| w.click);
        let recent = sess.outputs_since(now - CADENCE_MS);
        let Some(outcome) = outcome(since, drew, &recent, click, now) else {
            let wait = (drew + QUIET_MS - now).min(250);
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
    let project = &watch.project;
    let mut changed = false;
    for seen in &watch.seen {
        // Questions shown one at a time: the key answered the first of several.
        if seen.value == STATUS_WAITING && seen.askers.len() > 1 {
            if !matches!(outcome, Outcome::Unsure) {
                store.amend_if_unchanged(project, seen, |e| {
                    e.askers.remove(0);
                });
            }
            continue;
        }
        changed |= match outcome {
            Outcome::Ended => {
                let cleared = store.clear_if_unchanged(project, &seen.key, seen);
                // An interrupted turn: whatever its held finish waited on was
                // cut short. A dismissed question leaves the finish to come.
                if cleared && seen.value == crate::status::STATUS_RUNNING {
                    crate::donehold::cancel(project, &seen.key);
                }
                cleared
            }
            Outcome::Resumed if seen.value == STATUS_WAITING => {
                store.replace_if_unchanged(project, seen, running(seen))
            }
            Outcome::Resumed | Outcome::Unsure => false,
        };
    }
    if changed {
        let _ = app.emit("status-changed", project);
    }
}

/// The Running report the agent's own hooks would have sent.
pub(crate) fn running(waiting: &StatusEntry) -> StatusEntry {
    let (icon, color) = AgentKind::of_key(&waiting.key)
        .unwrap_or(AgentKind::Claude)
        .running_look();
    StatusEntry {
        key: waiting.key.clone(),
        value: STATUS_RUNNING.into(),
        icon: icon.into(),
        color: color.into(),
        priority: waiting.priority,
        timestamp: now_millis(),
        pane_id: waiting.pane_id.clone(),
        reporter_pid: waiting.reporter_pid,
        ..Default::default()
    }
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
        let claude = AgentKind::of_key(&entry.key) == Some(AgentKind::Claude);
        if claude && sess.as_deref().is_some_and(|s| now - s.last_output().max(entry.reported_at) >= CHILDREN_SILENCE_MS) {
            crate::agentchildren::forget(&project, &entry.key);
        }
        let waiting_on_work = crate::agentchildren::busy(&project, &entry.key)
            || crate::donehold::held(&project, &entry.key);
        let heard = entry.reported_at.max(entry.timestamp);
        let account = sess.as_deref().and_then(|s| s.claude_account.as_deref());
        let goes_on =
            || crate::claude_turn::goes_on(&project, &entry.key, &entry.pane_id, account, heard);
        if is_stale(sess.as_deref(), &entry, waiting_on_work, now, goes_on) {
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

/// `waiting_on_work`: sub-agents it spawned are still working, or it waits on a
/// background shell, which draws nothing. `goes_on` is asked only of a working
/// entry gone quiet: whether its turn is still going, by more than the pane.
fn is_stale(
    sess: Option<&PtySession>,
    entry: &StatusEntry,
    waiting_on_work: bool,
    now: i64,
    goes_on: impl FnOnce() -> bool,
) -> bool {
    let Some(sess) = sess else {
        return true;
    };
    // A shell without job control keeps its jobs in its own group, and `exec
    // claude` leaves no shell at all, so only an agent outside that group is gone.
    if sess.shell_at_prompt() == Some(true) && !sess.holds_terminal(entry.reporter_pid) {
        return true;
    }
    entry.value == STATUS_RUNNING
        && !waiting_on_work
        && !sess.output_paused()
        && silent(entry, sess.last_output(), now, goes_on)
}

/// Whether a working entry has gone quiet for longer than it can while at work:
/// nothing drawn, and nothing reported, since.
fn silent(entry: &StatusEntry, last_output: i64, now: i64, goes_on: impl FnOnce() -> bool) -> bool {
    let quiet = now - last_output.max(entry.timestamp).max(entry.reported_at);
    if entry.tool || quiet >= TOOL_SILENCE_MS {
        return quiet >= TOOL_SILENCE_MS;
    }
    quiet >= SILENCE_MS && !goes_on()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interrupts_in_every_encoding() {
        for key in [&b"\x1b"[..], b"\x1b[27u"] {
            assert!(classify(key) == Some(Key::Interrupt), "{key:?}");
        }
        for key in [&b"\x03"[..], b"\x1b[99;5u"] {
            assert!(classify(key) == Some(Key::CtrlC), "{key:?}");
        }
    }

    #[test]
    fn dialog_answers() {
        for key in [&b"\r"[..], b"1", b"9", b"\x1b[13u"] {
            assert!(classify(key) == Some(Key::Answer), "{key:?}");
        }
        assert!(classify(b"\x1b[<0;12;5M") == Some(Key::Click));
        for key in [&b"y"[..], b"n", b"a"] {
            assert!(classify(key) == Some(Key::CodexAnswer), "{key:?}");
        }
    }

    fn every(from: i64, gap: i64, to: i64) -> Vec<i64> {
        (0..).map(|i| from + i * gap).take_while(|at| *at <= to).collect()
    }

    // wl-w8b: a click in the pane during a Bash approval read as an answer, and
    // the bullet's 0.6 s blink as the agent back at work.
    #[test]
    fn a_blinking_dialog_is_not_work_resumed() {
        let since = 1_000;
        let now = since + WINDOW_MS;
        let blink = every(since + 60, 604, now);
        assert!(outcome(since, *blink.last().unwrap(), &blink, true, now).is_none(), "a blink");
        let spinner = every(since + 60, 400, now);
        let drew = *spinner.last().unwrap();
        assert!(matches!(outcome(since, drew, &spinner, true, now), Some(Outcome::Resumed)));
        assert!(matches!(outcome(since, since + 100, &[], true, since + 2_100), Some(Outcome::Ended)));
        assert!(matches!(outcome(since, since + 29_900, &blink, true, since + GIVE_UP_MS), Some(Outcome::Unsure)));
    }

    // wl-w9b: Enter on a background sub-agent's dialog, after which only the
    // 1 s footer drew: an answer, so work resumed at whatever pace.
    #[test]
    fn an_answer_followed_by_any_output_is_work_resumed() {
        let since = 1_000;
        let now = since + WINDOW_MS;
        let footer = every(since + 970, 1_000, now);
        assert!(matches!(outcome(since, *footer.last().unwrap(), &footer, false, now), Some(Outcome::Resumed)));
    }

    #[test]
    fn a_working_pace_has_no_gap_of_half_a_second() {
        assert!(steady(&every(0, 450, 2_000), 2_000));
        assert!(!steady(&every(0, 600, 2_000), 2_000));
        assert!(!steady(&every(0, 300, 1_200), 2_000), "stopped drawing");
        assert!(!steady(&[], 2_000));
    }

    #[test]
    fn a_tool_call_may_run_quiet_for_longer() {
        let running = StatusEntry {
            value: STATUS_RUNNING.into(),
            timestamp: 0,
            reported_at: 50_000,
            ..Default::default()
        };
        assert!(!silent(&running, 10_000, 70_000, || false), "it reported 20 s ago");
        assert!(silent(&running, 10_000, 80_000, || false));
        let tool = StatusEntry {
            tool: true,
            ..running
        };
        assert!(!silent(&tool, 10_000, 80_000, || false));
        assert!(silent(&tool, 10_000, 50_000 + TOOL_SILENCE_MS, || false));
    }

    // Issue #150: a fullscreen Claude scrolled away from its spinner, writing
    // one long answer, drew nothing and reported nothing for 40 s; the sweep
    // dropped its row until the next tool call brought it back.
    #[test]
    fn a_quiet_turn_its_transcript_shows_going_on_is_not_silent() {
        let running = StatusEntry {
            value: STATUS_RUNNING.into(),
            reported_at: 50_000,
            ..Default::default()
        };
        assert!(!silent(&running, 10_000, 90_000, || true));
        assert!(!silent(&running, 10_000, 50_000 + TOOL_SILENCE_MS - 1, || true));
        assert!(silent(&running, 10_000, 50_000 + TOOL_SILENCE_MS, || true), "capped like a tool call");
        assert!(silent(&running, 10_000, 90_000, || false), "a turn that ended goes quiet");
        let mut asked = false;
        assert!(!silent(&running, 10_000, 60_000, || {
            asked = true;
            true
        }));
        assert!(!asked, "the transcript is read only once the pane has gone quiet");
    }

    #[test]
    fn work_resumed_after_an_answer_keeps_who_reported_it() {
        let asked = StatusEntry {
            reporter_pid: 42,
            ..waiting("claude_code_s1")
        };
        assert_eq!(running(&asked).reporter_pid, 42);
    }

    #[test]
    fn a_question_form_takes_more_than_one_answer() {
        let form = StatusEntry {
            form: true,
            ..waiting("claude_code_s1")
        };
        assert!(!concerns(Key::Answer, &form));
        assert!(!concerns(Key::Click, &form));
        assert!(concerns(Key::Interrupt, &form), "Esc still closes it");
    }

    // An MCP dialog whose agent died can't end by its hooks: Esc is the way out.
    #[test]
    fn an_mcp_dialog_still_takes_an_interrupt() {
        let held = StatusEntry {
            held: true,
            ..waiting("claude_code_s1")
        };
        assert!(concerns(Key::Interrupt, &held) && concerns(Key::CtrlC, &held));
        assert!(!concerns(Key::Answer, &held));
    }

    #[test]
    fn a_click_that_focused_the_pane_answers_nothing() {
        took_focus("t-focus", 1_000);
        assert!(focusing_click("t-focus", 1_200));
        assert!(!focusing_click("t-focus", 1_000 + FOCUS_CLICK_MS));
        assert!(!focusing_click("t-other", 1_200));
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
        assert!(!concerns(Key::Click, &held));
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
