use super::*;
use serde_json::json;

fn ask_of(v: Value) -> Ask {
    Ask::new(100, parse_request(&v).unwrap(), false)
}

#[test]
fn reads_the_three_kinds_and_numbers_unnamed_questions() {
    let req = parse_request(&json!({ "questions": [
        { "type": "confirm", "text": "Deploy to staging?", "yes": "Deploy", "no": "Not now" },
        { "text": "Which region?", "options": ["us-east", { "label": "eu-west", "description": "Frankfurt" }] },
        { "id": "notes", "text": "Release notes?", "multiline": true, "optional": true },
    ], "timeout": 3600 }))
    .unwrap();
    assert_eq!(req.timeout_secs, Some(3600));
    let kinds: Vec<(&str, &str)> = req
        .questions
        .iter()
        .map(|q| (q.id.as_str(), q.kind.as_str()))
        .collect();
    assert_eq!(kinds, [("q1", CONFIRM), ("q2", CHOICE), ("notes", TEXT)]);
    assert_eq!(req.questions[1].options[1].description.as_deref(), Some("Frankfurt"));
}

#[test]
fn refuses_what_it_cannot_ask() {
    let bad = [
        json!({}),
        json!({ "questions": [] }),
        json!({ "questions": [{ "text": "  " }] }),
        json!({ "questions": [{ "type": "choice", "text": "Pick", "options": ["only"] }] }),
        json!({ "questions": [{ "type": "choice", "text": "Pick", "options": ["a", "A"] }] }),
        json!({ "questions": [{ "type": "confirm", "text": "Ok?", "options": ["a", "b"] }] }),
        json!({ "questions": [{ "type": "slider", "text": "How much?" }] }),
        json!({ "questions": [{ "text": "A" }, { "text": "B" }, { "text": "C" }, { "text": "D" }, { "text": "E" }] }),
        json!({ "questions": [{ "id": "x", "text": "A" }, { "id": "x", "text": "B" }] }),
        json!({ "questions": [{ "text": "A" }], "timeout": 5 }),
        json!({ "questions": [{ "text": "A" }], "timeout": 366 * 86_400 }),
        json!({ "questions": [{ "text": "A" }], "timeout": u64::MAX }),
        json!({ "questions": [{ "type": "confirm", "text": "Ok?", "default": "maybe" }] }),
    ];
    for v in bad {
        assert!(parse_request(&v).is_err(), "accepted {v}");
    }
}

#[test]
fn a_choice_with_other_can_offer_a_single_option() {
    let req = parse_request(&json!({ "questions": [
        { "type": "choice", "text": "Name it", "options": ["main"], "other": true },
    ]}));
    assert!(req.is_ok());
}

#[test]
fn confirm_answers_take_booleans_words_and_the_button_labels() {
    let ask = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy?", "yes": "Ship it", "no": "Hold" },
    ]}));
    let q = &ask.questions[0];
    for (given, expected) in [
        (json!(true), true),
        (json!("yes"), true),
        (json!("ship it"), true),
        (json!("N"), false),
        (json!("Hold"), false),
    ] {
        assert_eq!(normalize_one(q, &given).unwrap(), Some(json!(expected)), "{given}");
    }
    assert!(normalize_one(q, &json!("perhaps")).is_err());
    assert_eq!(normalize_one(q, &json!("")).unwrap(), None);
}

#[test]
fn choice_answers_match_labels_and_take_own_words_only_with_other() {
    let ask = ask_of(json!({ "questions": [
        { "type": "choice", "text": "Region?", "options": ["us-east", "eu-west"] },
        { "type": "choice", "text": "Tags?", "options": ["a", "b", "c"], "multiple": true, "other": true },
    ]}));
    let (one, many) = (&ask.questions[0], &ask.questions[1]);
    assert_eq!(normalize_one(one, &json!("EU-WEST")).unwrap(), Some(json!(["eu-west"])));
    assert!(normalize_one(one, &json!("ap-south")).is_err());
    assert!(normalize_one(one, &json!(["us-east", "eu-west"])).is_err());
    assert_eq!(
        normalize_one(many, &json!(["b", "a", "b", " mine "])).unwrap(),
        Some(json!(["b", "a", "mine"]))
    );
    assert_eq!(normalize_one(many, &json!([])).unwrap(), None);
}

#[test]
fn every_required_question_needs_an_answer() {
    let ask = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy?" },
        { "id": "notes", "text": "Notes?", "optional": true },
    ]}));
    assert!(normalize_answers(&ask.questions, &json!({})).is_err());
    assert!(normalize_answers(&ask.questions, &json!("yes")).is_err());
    let answers = normalize_answers(&ask.questions, &json!({ "q1": "yes", "notes": "  " })).unwrap();
    assert_eq!(Value::Object(answers), json!({ "q1": true }));
}

#[test]
fn expiry_uses_the_defaults_only_when_they_cover_everything() {
    let mut covered = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy?", "default": "no" },
        { "text": "Notes?", "optional": true },
    ]}));
    covered.expire(500);
    assert_eq!(covered.status, ANSWERED);
    assert!(covered.auto);
    assert_eq!(Value::Object(covered.answers.clone()), json!({ "q1": false }));

    let mut uncovered = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy?", "default": "no" },
        { "text": "Why?" },
    ]}));
    uncovered.expire(500);
    assert_eq!(uncovered.status, UNANSWERED);
    assert_eq!(uncovered.answered_at, Some(500));
}

#[test]
fn the_agent_reads_its_answers_by_label() {
    let mut ask = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy to staging?", "yes": "Deploy", "no": "Not now" },
        { "type": "choice", "text": "Regions?", "options": ["us-east", "eu-west"], "multiple": true },
        { "text": "Notes?", "optional": true },
    ]}));
    let answers =
        normalize_answers(&ask.questions, &json!({ "q1": true, "q2": ["eu-west", "us-east"] })).unwrap();
    ask.answer(answers, 200, false);
    assert_eq!(
        ask.answer_text(),
        "The user answered your question:\n- Deploy to staging? → Deploy\n- Regions? → eu-west, us-east\n- Notes? → (no answer)"
    );
}

#[test]
fn a_plain_reply_is_passed_on_as_written() {
    let mut ask = ask_of(json!({ "questions": [{ "type": "confirm", "text": "Deploy?" }] }));
    ask.answer_in_words("Only after the migration lands.", 300);
    assert_eq!(ask.status, ANSWERED);
    assert_eq!(ask.answer_text(), "Only after the migration lands.");
}

#[test]
fn outlines_and_summaries_fit_text_only_places() {
    let ask = ask_of(json!({ "questions": [
        { "type": "confirm", "text": "Deploy?" },
        { "type": "choice", "text": "Region?", "options": ["us", "eu"] },
    ]}));
    assert_eq!(ask.summary(), "Deploy? (+1 more)");
    assert_eq!(ask.outline(), "Deploy? (Yes / No)\nRegion? (us / eu)");
}

#[test]
fn only_a_waiting_command_counts_time_held_up() {
    let mut ask = ask_of(json!({ "questions": [{ "text": "Name?" }] }));
    assert_eq!(ask.waited_secs(160), 0);
    ask.blocking = true;
    assert_eq!(ask.waited_secs(160), 60);
    ask.close(DISMISSED, 130);
    assert_eq!(ask.waited_secs(900), 30);
}

#[test]
fn a_state_file_from_a_newer_build_still_loads() {
    let stored = json!({
        "id": "abc", "askedAt": 1, "status": "snoozed",
        "questions": [{ "id": "q1", "type": "rating", "text": "How was it?", "stars": 5 }],
    });
    let ask: Ask = serde_json::from_value(stored).unwrap();
    assert_eq!(ask.questions[0].kind, "rating");
    assert_eq!(
        normalize_one(&ask.questions[0], &json!(4)).unwrap(),
        Some(json!("4"))
    );
}
