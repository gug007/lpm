use super::*;
use crate::jobs::askform::{Choice, OPEN};

fn ask(q: Question) -> Ask {
    Ask {
        id: "a1b2c3d4e5f6".into(),
        asked_at: 0,
        questions: vec![q],
        blocking: false,
        key: None,
        expires_at: None,
        status: OPEN.into(),
        answers: Map::new(),
        reply: None,
        answered_at: None,
        auto: false,
    }
}

fn choice(labels: &[&str], multiple: bool, other: bool) -> Question {
    Question {
        id: "q1".into(),
        kind: CHOICE.into(),
        text: "Which?".into(),
        options: labels
            .iter()
            .map(|l| Choice {
                label: l.to_string(),
                description: None,
            })
            .collect(),
        multiple,
        other,
        ..Question::default()
    }
}

fn confirm() -> Question {
    Question {
        id: "q1".into(),
        kind: CONFIRM.into(),
        text: "Post it?".into(),
        yes: Some("Post now".into()),
        ..Question::default()
    }
}

fn texts(keyboard: &Value) -> Vec<String> {
    keyboard["inline_keyboard"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|row| row.as_array().unwrap().iter())
        .map(|b| b["text"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn callback_data_fits_telegrams_64_bytes_and_reads_back() {
    for tap in [
        Tap::Yes,
        Tap::No,
        Tap::Pick(11),
        Tap::Write,
        Tap::Send,
        Tap::Skip,
        Tap::Status,
    ] {
        let data = encode("a1b2c3d4e5f6", tap);
        assert!(data.len() <= 64, "{data}");
        assert_eq!(decode(&data), Some(("a1b2c3d4e5f6".to_string(), tap)));
    }
}

#[test]
fn reads_only_data_lpm_wrote() {
    for data in [
        "",
        "lpm1",
        "lpm1:abc",
        "lpm2:abc:y",
        "lpm1:abc:z",
        "lpm1:ab c:y",
        "lpm1:abc:y:extra",
        "lpm1::y",
        "lpm1:abc:p-1",
        "other",
    ] {
        assert_eq!(decode(data), None, "{data}");
    }
}

#[test]
fn a_yes_or_no_answers_on_the_tap_with_the_questions_labels() {
    let a = ask(confirm());
    assert_eq!(
        texts(&keyboard(&a, &[], true)),
        ["Post now", "No", "Skip question"]
    );
    assert_eq!(
        tap(&a, &[], Tap::Yes),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(true))]))
    );
    assert_eq!(
        tap(&a, &[], Tap::No),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(false))]))
    );
    assert_eq!(tap(&a, &[], Tap::Skip), Outcome::Dismiss);
}

#[test]
fn a_single_pick_answers_on_the_tap_and_an_index_out_of_range_is_refused() {
    let a = ask(choice(&["Record", "Skip today"], false, true));
    assert_eq!(
        texts(&keyboard(&a, &[], true)),
        ["Record", "Skip today", "Something else…", "Skip question"]
    );
    assert_eq!(
        tap(&a, &[], Tap::Pick(1)),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(["Skip today"]))]))
    );
    assert!(matches!(tap(&a, &[], Tap::Pick(2)), Outcome::Refuse(_)));
    assert!(matches!(tap(&a, &[], Tap::Yes), Outcome::Refuse(_)));
}

#[test]
fn several_picks_toggle_then_send() {
    let a = ask(choice(&["lint", "test", "build"], true, false));
    assert_eq!(tap(&a, &[], Tap::Pick(2)), Outcome::Draft(vec![2]));
    assert_eq!(tap(&a, &[2], Tap::Pick(0)), Outcome::Draft(vec![0, 2]));
    assert_eq!(tap(&a, &[0, 2], Tap::Pick(2)), Outcome::Draft(vec![0]));
    assert_eq!(
        texts(&keyboard(&a, &[0], true)),
        ["✓ lint", "test", "build", "Send answer", "Skip question"]
    );
    assert!(matches!(tap(&a, &[], Tap::Send), Outcome::Refuse(_)));
    assert_eq!(
        tap(&a, &[0, 2], Tap::Send),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(["lint", "build"]))]))
    );
}

#[test]
fn own_words_are_asked_for_only_where_the_question_takes_them() {
    let other = ask(choice(&["A", "B"], false, true));
    assert_eq!(tap(&other, &[], Tap::Write), Outcome::Prompt);
    assert!(matches!(
        tap(&ask(choice(&["A", "B"], false, false)), &[], Tap::Write),
        Outcome::Refuse(_)
    ));
    let text = ask(Question {
        id: "q1".into(),
        kind: "text".into(),
        text: "Name?".into(),
        ..Question::default()
    });
    assert_eq!(
        texts(&keyboard(&text, &[], true)),
        ["Write an answer…", "Skip question"]
    );
    assert_eq!(texts(&keyboard(&text, &[], false)), ["Skip question"]);
    assert_eq!(tap(&text, &[], Tap::Write), Outcome::Prompt);
}

#[test]
fn a_reply_answers_with_a_label_or_words_where_they_are_allowed() {
    let strict = ask(choice(&["Record", "Skip today"], false, false));
    assert_eq!(
        reply(&strict, " record "),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(["Record"]))]))
    );
    assert!(matches!(
        reply(&strict, "tomorrow please"),
        Outcome::Refuse(_)
    ));
    let open = ask(choice(&["Record", "Skip today"], false, true));
    assert_eq!(
        reply(&open, "Record Opus vs Sonnet instead"),
        Outcome::Submit(Map::from_iter([(
            "q1".into(),
            json!(["Record Opus vs Sonnet instead"])
        )]))
    );
    assert_eq!(
        reply(&ask(confirm()), "yes"),
        Outcome::Submit(Map::from_iter([("q1".into(), json!(true))]))
    );
    assert_eq!(reply(&open, "/start"), Outcome::Ignore);
    assert_eq!(reply(&open, "   "), Outcome::Ignore);
}

#[test]
fn the_closed_button_reads_like_the_app() {
    let mut a = ask(confirm());
    a.status = ANSWERED.into();
    a.answers.insert("q1".into(), json!(true));
    assert_eq!(status_text(&a, true), "Answered: Post now");
    assert_eq!(status_text(&a, false), "Answered");
    a.auto = true;
    assert_eq!(
        status_text(&a, true),
        "No answer in time — the default was used: Post now"
    );
    assert_eq!(status_text(&a, false), "No answer in time — the default was used");
    a.status = DISMISSED.into();
    assert_eq!(status_text(&a, true), "Skipped");
    a.status = REPLACED.into();
    assert_eq!(status_text(&a, true), "Replaced by a newer question");
    a.status = "unanswered".into();
    assert_eq!(status_text(&a, true), "No answer");
    let mut long = ask(Question {
        id: "q1".into(),
        kind: "text".into(),
        text: "?".into(),
        ..Question::default()
    });
    long.status = ANSWERED.into();
    long.answers.insert("q1".into(), json!("x".repeat(200)));
    assert_eq!(status_text(&long, true).chars().count(), 60);
}

#[test]
fn only_one_question_at_a_time_gets_buttons() {
    let mut a = ask(confirm());
    assert!(supported(&a));
    a.questions.push(confirm());
    assert!(!supported(&a));
}
