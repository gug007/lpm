//! The send-later schedule's data and its clock rules, kept apart from the
//! store and thread that drive them so the rules can be tested on their own.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::Duration;

/// How late a prompt may still go out. Past this the Mac was asleep or lpm was
/// closed at its time, and a prompt typed long after the moment it was meant for
/// can land in the wrong conversation, so it waits for the user instead.
pub const GRACE_MS: i64 = 5 * 60 * 1000;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PromptState {
    Scheduled,
    Due,
    Missed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledPrompt {
    pub id: String,
    pub project_name: String,
    /// The terminal tab's persisted key; its pty id changes on every launch.
    pub history_key: String,
    #[serde(default)]
    pub terminal_label: String,
    /// The agent the prompt was written for ("claude", "codex"…), empty for a
    /// plain shell: it decides what the terminal must be running to take it.
    #[serde(default)]
    pub agent: String,
    pub text: String,
    #[serde(default)]
    pub images: BTreeMap<String, String>,
    pub due_at: i64,
    pub created_at: i64,
    pub state: PromptState,
    /// "limit" when it was set for the agent's usage limit to reset, "done" when
    /// it waits for the agent to finish its turn, else "time".
    #[serde(default)]
    pub kind: String,
    /// Send now: goes out without waiting for the agent to finish its turn.
    #[serde(default)]
    pub force: bool,
    /// Sent again this long after each time it goes out; 0 sends it once.
    #[serde(default)]
    pub repeat_ms: i64,
}

impl ScheduledPrompt {
    /// Waits again for the repeating prompt's next time after `now`.
    pub fn repeat_after(&mut self, now: i64) {
        self.state = PromptState::Scheduled;
        self.force = false;
        self.due_at = next_repeat(self.due_at, self.repeat_ms, now);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPrompt {
    pub project_name: String,
    pub history_key: String,
    #[serde(default)]
    pub terminal_label: String,
    #[serde(default)]
    pub agent: String,
    pub text: String,
    #[serde(default)]
    pub images: BTreeMap<String, String>,
    pub due_at: i64,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub repeat_ms: i64,
}

/// The list as windows see it. `rev` orders snapshots, so one that arrives late
/// never replaces a newer one; `sender` says whether this copy of lpm is the one
/// sending (another copy sharing the data directory may hold that role).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub rev: u64,
    pub sender: bool,
    pub items: Vec<ScheduledPrompt>,
}

/// Move every prompt whose time has come to Due, or to Missed when the tick that
/// noticed it came too late for it to count as on time. A repeating prompt
/// skips a time it missed and waits for its next one instead.
pub fn settle(items: &mut [ScheduledPrompt], now: i64) -> bool {
    let mut changed = false;
    for item in items.iter_mut() {
        if item.state != PromptState::Scheduled || item.due_at > now {
            continue;
        }
        if now - item.due_at <= GRACE_MS {
            item.state = PromptState::Due;
        } else if item.repeat_ms > 0 {
            item.due_at = next_repeat(item.due_at, item.repeat_ms, now);
        } else {
            item.state = PromptState::Missed;
        }
        changed = true;
    }
    changed
}

/// On launch lpm was, by definition, closed for a while: anything already past
/// its time, and anything that was still waiting on its agent, is Missed. A
/// repeating prompt carries on from its next time.
pub fn settle_after_launch(items: &mut [ScheduledPrompt], now: i64) -> bool {
    let mut changed = false;
    for item in items.iter_mut() {
        let overdue = item.state == PromptState::Scheduled && now - item.due_at > GRACE_MS;
        if !overdue && item.state != PromptState::Due {
            continue;
        }
        if item.repeat_ms > 0 {
            item.repeat_after(now);
        } else {
            item.force = false;
            item.state = PromptState::Missed;
        }
        changed = true;
    }
    changed
}

/// The first of a repeating prompt's times that is still ahead of `now`.
pub fn next_repeat(due_at: i64, repeat_ms: i64, now: i64) -> i64 {
    if due_at > now {
        return due_at;
    }
    due_at + ((now - due_at) / repeat_ms + 1) * repeat_ms
}

/// The shortest gap a prompt may repeat at.
pub const MIN_REPEAT_MS: i64 = 5 * 60 * 1000;

/// A repeat a prompt can be set to: none, or at least MIN_REPEAT_MS apart, and
/// only for a prompt set for a time.
pub fn check_repeat(kind: &str, repeat_ms: i64) -> Result<(), String> {
    if repeat_ms == 0 {
        return Ok(());
    }
    if !(kind.is_empty() || kind == "time") {
        return Err("Only a prompt set for a time can repeat.".into());
    }
    if repeat_ms < MIN_REPEAT_MS {
        return Err("A prompt can repeat at most every 5 minutes.".into());
    }
    Ok(())
}

/// How long to sleep before the next prompt comes due; None when nothing is
/// scheduled, so an empty list costs no wake-ups at all.
pub fn next_wait(items: &[ScheduledPrompt], now: i64) -> Option<Duration> {
    items
        .iter()
        .filter(|i| i.state == PromptState::Scheduled)
        .map(|i| (i.due_at - now).max(0) as u64)
        .min()
        .map(Duration::from_millis)
}

pub const PAST_TIME: &str = "That time has already passed. Pick a time ahead of now.";

/// A prompt queued to go out once its agent finishes the turn it's on.
pub const KIND_DONE: &str = "done";

/// A time a prompt can be set for: still ahead of the clock.
pub fn check_due_at(due_at: i64, now: i64) -> Result<(), String> {
    if due_at > now {
        Ok(())
    } else {
        Err(PAST_TIME.into())
    }
}

/// When a new prompt is due and the state it starts in. One queued for when its
/// agent is done is due at once: the sending window holds it while the agent
/// works, so it goes out the moment the turn ends.
pub fn first_state(kind: &str, due_at: i64, now: i64) -> Result<(i64, PromptState), String> {
    if kind == KIND_DONE {
        return Ok((now, PromptState::Due));
    }
    check_due_at(due_at, now)?;
    Ok((due_at, PromptState::Scheduled))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60 * 1000;

    fn prompt(id: &str, due_at: i64, state: PromptState) -> ScheduledPrompt {
        ScheduledPrompt {
            id: id.into(),
            project_name: "lpm".into(),
            history_key: "k".into(),
            terminal_label: "Claude".into(),
            agent: "claude".into(),
            text: "run the tests".into(),
            images: BTreeMap::new(),
            due_at,
            created_at: 0,
            state,
            kind: "time".into(),
            force: false,
            repeat_ms: 0,
        }
    }

    fn repeating(id: &str, due_at: i64, state: PromptState) -> ScheduledPrompt {
        ScheduledPrompt {
            repeat_ms: 30 * MIN,
            ..prompt(id, due_at, state)
        }
    }

    #[test]
    fn a_repeating_prompt_skips_a_missed_time_to_its_next_one() {
        let mut items = vec![repeating("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + 95 * MIN));
        assert_eq!(items[0].state, PromptState::Scheduled);
        assert_eq!(items[0].due_at, 1_000 * MIN + 120 * MIN);
    }

    #[test]
    fn a_repeating_prompt_reached_on_time_is_due_like_any_other() {
        let mut items = vec![repeating("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + MIN));
        assert_eq!(items[0].state, PromptState::Due);
        assert_eq!(items[0].due_at, 1_000 * MIN);
    }

    #[test]
    fn launch_moves_a_repeating_prompt_on_instead_of_missing_it() {
        let mut due = repeating("due", 990 * MIN, PromptState::Due);
        due.force = true;
        let mut items = vec![repeating("overdue", 900 * MIN, PromptState::Scheduled), due];
        assert!(settle_after_launch(&mut items, 1_000 * MIN));
        assert_eq!(items[0].state, PromptState::Scheduled);
        assert_eq!(items[0].due_at, 1_020 * MIN);
        assert_eq!(items[1].state, PromptState::Scheduled);
        assert_eq!(items[1].due_at, 1_020 * MIN);
        assert!(!items[1].force);
    }

    #[test]
    fn the_next_repeat_is_strictly_ahead() {
        assert_eq!(next_repeat(1_000, 100, 1_000), 1_100);
        assert_eq!(next_repeat(1_000, 100, 1_099), 1_100);
        assert_eq!(next_repeat(1_000, 100, 1_100), 1_200);
        assert_eq!(next_repeat(2_000, 100, 1_000), 2_000);
    }

    #[test]
    fn only_a_timed_prompt_repeats_and_never_faster_than_five_minutes() {
        assert!(check_repeat("time", 0).is_ok());
        assert!(check_repeat("done", 0).is_ok());
        assert!(check_repeat("time", 30 * MIN).is_ok());
        assert!(check_repeat("", MIN_REPEAT_MS).is_ok());
        assert!(check_repeat("time", MIN).is_err());
        assert!(check_repeat("done", 30 * MIN).is_err());
        assert!(check_repeat("limit", 30 * MIN).is_err());
    }

    #[test]
    fn a_prompt_reached_on_time_is_due() {
        let mut items = vec![prompt("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + 30_000));
        assert_eq!(items[0].state, PromptState::Due);
    }

    #[test]
    fn a_prompt_noticed_after_the_grace_is_missed() {
        let mut items = vec![prompt("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + GRACE_MS + 1));
        assert_eq!(items[0].state, PromptState::Missed);
    }

    #[test]
    fn settle_leaves_future_and_finished_prompts_alone() {
        let mut items = vec![
            prompt("future", 2_000 * MIN, PromptState::Scheduled),
            prompt("due", 10 * MIN, PromptState::Due),
            prompt("missed", 10 * MIN, PromptState::Missed),
        ];
        assert!(!settle(&mut items, 1_000 * MIN));
        assert_eq!(items[0].state, PromptState::Scheduled);
        assert_eq!(items[1].state, PromptState::Due);
    }

    #[test]
    fn launch_misses_overdue_and_waiting_prompts_but_keeps_future_ones() {
        let mut due = prompt("due", 990 * MIN, PromptState::Due);
        due.force = true;
        let mut items = vec![
            prompt("overdue", 900 * MIN, PromptState::Scheduled),
            due,
            prompt("future", 1_100 * MIN, PromptState::Scheduled),
            prompt("just", 1_000 * MIN - MIN, PromptState::Scheduled),
        ];
        assert!(settle_after_launch(&mut items, 1_000 * MIN));
        assert_eq!(items[0].state, PromptState::Missed);
        assert_eq!(items[1].state, PromptState::Missed);
        assert!(!items[1].force);
        assert_eq!(items[2].state, PromptState::Scheduled);
        assert_eq!(items[3].state, PromptState::Scheduled);
    }

    #[test]
    fn next_wait_is_the_soonest_scheduled_prompt() {
        let items = vec![
            prompt("later", 1_060 * MIN, PromptState::Scheduled),
            prompt("sooner", 1_010 * MIN, PromptState::Scheduled),
            prompt("due", 900 * MIN, PromptState::Due),
        ];
        assert_eq!(
            next_wait(&items, 1_000 * MIN),
            Some(Duration::from_millis(10 * MIN as u64))
        );
        assert_eq!(next_wait(&items[2..], 1_000 * MIN), None);
    }

    #[test]
    fn overdue_scheduled_prompts_wait_zero() {
        let items = vec![prompt("a", 900 * MIN, PromptState::Scheduled)];
        assert_eq!(next_wait(&items, 1_000 * MIN), Some(Duration::ZERO));
    }

    #[test]
    fn a_time_must_still_be_ahead() {
        assert!(check_due_at(1_001, 1_000).is_ok());
        assert_eq!(check_due_at(1_000, 1_000), Err(PAST_TIME.to_string()));
        assert!(check_due_at(0, 1_000).is_err());
    }

    #[test]
    fn a_prompt_for_when_the_agent_is_done_is_due_at_once() {
        assert_eq!(
            first_state(KIND_DONE, 0, 1_000),
            Ok((1_000, PromptState::Due))
        );
    }

    #[test]
    fn a_timed_prompt_starts_scheduled_for_a_time_ahead() {
        assert_eq!(
            first_state("time", 2_000, 1_000),
            Ok((2_000, PromptState::Scheduled))
        );
        assert_eq!(first_state("limit", 900, 1_000), Err(PAST_TIME.to_string()));
    }

    #[test]
    fn serializes_camel_case_with_lowercase_state() {
        let json = serde_json::to_value(prompt("a", 5, PromptState::Due)).unwrap();
        assert_eq!(json["historyKey"], "k");
        assert_eq!(json["dueAt"], 5);
        assert_eq!(json["state"], "due");
    }

    #[test]
    fn missing_optional_fields_read_as_defaults() {
        let raw = r#"[{"id":"a","projectName":"p","historyKey":"k","text":"t","dueAt":1,"createdAt":0,"state":"scheduled"}]"#;
        let items: Vec<ScheduledPrompt> = serde_json::from_str(raw).unwrap();
        assert!(items[0].images.is_empty());
        assert!(!items[0].force);
        assert_eq!(items[0].terminal_label, "");
        assert_eq!(items[0].agent, "");
    }
}
