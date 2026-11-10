use super::*;
use crate::jobs::askform::{DISMISSED, OPEN};
use serde_json::json;

fn keyed_ask(id: &str, key: &str, at: u64) -> Ask {
    let request =
        askform::parse_request(&json!({ "questions": [{ "type": "confirm", "text": "Send?" }] }))
            .unwrap();
    let mut a = Ask::new(at, request, false);
    a.id = id.to_string();
    a.key = Some(key.to_string());
    a
}

fn answered(questions: Value, answers: Value) -> Ask {
    let mut a = Ask::new(
        10,
        askform::parse_request(&json!({ "questions": questions })).unwrap(),
        false,
    );
    a.answer(answers.as_object().unwrap().clone(), 20, false);
    a
}

#[test]
fn a_key_is_one_trimmed_line() {
    assert_eq!(parse_key("  tg:42 "), Ok("tg:42".into()));
    assert!(
        parse_key("").is_err(),
        "an empty variable must not ask unkeyed"
    );
    assert!(parse_key("a\nb").is_err());
    assert!(parse_key(&"x".repeat(121)).is_err());
}

#[test]
fn asking_again_under_a_key_replaces_its_open_question_only() {
    let mut st = JobState::default();
    assert!(file(&mut st, keyed_ask("a1", "tg:alice", 10), 10).is_none());
    assert!(file(&mut st, keyed_ask("b1", "tg:bob", 11), 11).is_none());
    let replaced = file(&mut st, keyed_ask("a2", "tg:alice", 12), 12).unwrap();
    assert_eq!(replaced.id, "a1");
    assert_eq!(replaced.status, REPLACED);
    let open: Vec<&str> = waiting(&st).map(|a| a.id.as_str()).collect();
    assert_eq!(open, ["b1", "a2"]);

    file(&mut st, keyed_ask("a3", "tg:alice", 13), 13);
    let alice: Vec<(&str, &str)> = st
        .keyed
        .iter()
        .filter(|a| a.key.as_deref() == Some("tg:alice"))
        .map(|a| (a.id.as_str(), a.status.as_str()))
        .collect();
    assert_eq!(
        alice,
        [("a2", REPLACED), ("a3", OPEN)],
        "a key keeps one closed question"
    );
}

#[test]
fn closed_keyed_questions_go_after_a_day() {
    let mut st = JobState::default();
    let mut old = keyed_ask("old", "k1", 0);
    old.close(DISMISSED, 10);
    let mut recent = keyed_ask("recent", "k2", 0);
    recent.close(DISMISSED, KEEP_CLOSED_SECS);
    st.keyed = vec![old, recent];
    file(
        &mut st,
        keyed_ask("new", "k3", KEEP_CLOSED_SECS + 20),
        KEEP_CLOSED_SECS + 20,
    );
    let kept: Vec<&str> = st.keyed.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(kept, ["recent", "new"]);
}

#[test]
fn keyed_questions_leave_the_job_free_but_still_show_as_waiting() {
    let mut st = JobState::default();
    file(&mut st, keyed_ask("a", "tg:1", 10), 10);
    file(&mut st, keyed_ask("b", "tg:2", 11), 11);
    assert!(
        ask::open_in(&st).is_none(),
        "scheduled runs and Run now go ahead"
    );
    let rows = ask::waiting_json(&st, "web");
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["key"], json!("tg:1"));
    assert_eq!(rows[0]["project"], json!("web"));
    assert_eq!(rows[0]["status"], json!(OPEN));
}

#[test]
fn the_question_holding_the_job_up_leads_the_row() {
    let mut st = JobState::default();
    file(&mut st, keyed_ask("k", "tg:1", 10), 10);
    st.history.push(HistoryEntry {
        at: 50,
        result: COMPLETED.into(),
        asks: vec![Ask::new(
            40,
            askform::parse_request(&json!({ "questions": [{ "text": "Which?" }] })).unwrap(),
            false,
        )],
        ..HistoryEntry::default()
    });
    let mut row = json!({});
    add_waiting(&mut row, ask::waiting_json(&st, "web"));
    assert!(row["ask"].get("key").is_none());
    assert_eq!(row["asks"].as_array().unwrap().len(), 2);

    let mut only_keyed = json!({});
    st.history.clear();
    add_waiting(&mut only_keyed, ask::waiting_json(&st, "web"));
    assert_eq!(
        only_keyed["ask"]["key"],
        json!("tg:1"),
        "older clients still see it"
    );

    let mut none = json!({});
    add_waiting(&mut none, Vec::new());
    assert!(none.get("ask").is_none() && none.get("asks").is_none());
}

#[test]
fn the_answer_reads_the_way_lpm_ask_prints_it() {
    let confirm = json!([{ "id": "q1", "type": "confirm", "text": "Send?" }]);
    assert_eq!(
        answer_value(&answered(confirm.clone(), json!({ "q1": true }))),
        "yes"
    );
    assert_eq!(
        answer_value(&answered(confirm, json!({ "q1": false }))),
        "no"
    );
    let pick = json!([{ "id": "q1", "type": "choice", "text": "Which?", "options": ["a", "b"], "multiple": true }]);
    assert_eq!(
        answer_value(&answered(pick, json!({ "q1": ["a", "b"] }))),
        "a\nb"
    );
    let text = json!([{ "id": "q1", "type": "text", "text": "Reply?" }]);
    assert_eq!(
        answer_value(&answered(text, json!({ "q1": "Hi Bob" }))),
        "Hi Bob"
    );
    let two = json!([{ "id": "a", "text": "A?" }, { "id": "b", "type": "confirm", "text": "B?" }]);
    let both = answer_value(&answered(two, json!({ "a": "x", "b": true })));
    assert_eq!(
        serde_json::from_str::<Value>(&both).unwrap(),
        json!({ "a": "x", "b": true })
    );
}

#[test]
fn the_command_hears_the_key_and_the_answer() {
    let mut a = keyed_ask("q9", "tg:7", 10);
    a.answer(
        json!({ "q1": true }).as_object().unwrap().clone(),
        20,
        false,
    );
    let env: std::collections::HashMap<String, String> = answer_env(&a).into_iter().collect();
    assert_eq!(env["LPM_ASK_KEY"], "tg:7");
    assert_eq!(env["LPM_ASK_ID"], "q9");
    assert_eq!(env["LPM_ANSWER"], "yes");
    assert_eq!(env["LPM_ANSWERS"], r#"{"q1":true}"#);
}

#[test]
fn an_answer_sent_on_is_not_news_but_its_failure_is() {
    let sent = HistoryEntry {
        at: 1,
        result: COMPLETED.into(),
        asks: vec![keyed_ask("k", "tg:1", 0)],
        ..HistoryEntry::default()
    };
    assert!(sent.on_answer() && !sent.is_news());
    let failed = HistoryEntry {
        result: ERROR.into(),
        ..sent.clone()
    };
    assert!(failed.is_news());
    let run = HistoryEntry {
        asks: Vec::new(),
        ..sent
    };
    assert!(!run.on_answer() && run.is_news());
}

#[test]
fn a_keyed_question_round_trips_and_older_state_reads_without_one() {
    let a = keyed_ask("a", "tg:1", 10);
    let back: Ask = serde_json::from_value(json!(a)).unwrap();
    assert_eq!(back, a);
    let old: JobState = serde_json::from_value(json!({ "history": [] })).unwrap();
    assert!(old.keyed.is_empty());
    assert!(json!(old).get("keyed").is_none());
}

#[test]
fn an_editor_that_never_showed_on_answer_keeps_it() {
    let yaml = |text: &str| serde_norway::from_str::<serde_norway::Value>(text).unwrap();
    let stored = yaml("label: Replies\nonAnswer: tg-send\n");
    let mut from_phone = yaml("label: Renamed\n");
    keep_unseen_fields(&mut from_phone, &stored);
    assert_eq!(from_phone, yaml("label: Renamed\nonAnswer: tg-send\n"));
    let mut changed = yaml("label: Renamed\nonAnswer: other\n");
    keep_unseen_fields(&mut changed, &stored);
    assert_eq!(changed["onAnswer"], yaml("other"));
}
