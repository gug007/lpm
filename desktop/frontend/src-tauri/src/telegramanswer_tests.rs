use super::*;
use crate::telegramlink::Chat;

const OWNER: i64 = 1001;
const TEXT: &str = "❓ \"tgtest\" is waiting for your answer.\n\nShip it? (Ship / No)";

fn link() -> Link {
    let mut link = Link::default();
    link.chats.push(Chat {
        key: "me".into(),
        chat_id: OWNER,
        name: "Me".into(),
        kind: "private".into(),
    });
    link.owner = Some(OWNER);
    link
}

fn keyboard() -> Value {
    json!({ "inline_keyboard": [[
        { "text": "Post now", "callback_data": "lpm1:a1:y" },
        { "text": "No", "callback_data": "lpm1:a1:n" }
    ]] })
}

fn entry() -> Entry {
    Entry {
        ask: "a1".into(),
        project: "lpm".into(),
        job: "daily-short".into(),
        chat: OWNER,
        replies: true,
        private: true,
        posted_at: 0,
        closed_at: None,
        posts: vec![Post {
            message: 7,
            keyboard: keyboard(),
            text: TEXT.into(),
        }],
        prompts: Vec::new(),
        picked: Vec::new(),
    }
}

fn tap(from: i64, text: &str, markup: Value, date: i64) -> Value {
    json!({
        "id": "t1",
        "from": { "id": from },
        "data": "lpm1:a1:y",
        "message": { "message_id": 7, "date": date, "text": text, "chat": { "id": OWNER }, "reply_markup": markup }
    })
}

const NOW: i64 = 1_700_000_000;

#[test]
fn the_user_tapping_lpms_own_message_may_answer() {
    assert_eq!(trusted_tap(&link(), &entry(), &tap(OWNER, TEXT, keyboard(), NOW)), Ok(()));
}

#[test]
fn anyone_else_is_refused() {
    assert!(trusted_tap(&link(), &entry(), &tap(2002, TEXT, keyboard(), NOW)).is_err());
}

#[test]
fn a_chat_no_longer_linked_is_refused() {
    let mut e = entry();
    e.chat = 9009;
    assert!(trusted_tap(&link(), &e, &tap(OWNER, TEXT, keyboard(), NOW)).is_err());
}

#[test]
fn relabelled_buttons_are_refused() {
    let swapped = json!({ "inline_keyboard": [[
        { "text": "No", "callback_data": "lpm1:a1:y" },
        { "text": "Post now", "callback_data": "lpm1:a1:n" }
    ]] });
    assert!(trusted_tap(&link(), &entry(), &tap(OWNER, TEXT, swapped, NOW)).is_err());
}

#[test]
fn an_edited_question_under_the_same_buttons_is_refused() {
    let edited = "❓ \"deploy\" is waiting for your answer.\n\nDeploy v1.2 to production? (Ship / No)";
    assert!(trusted_tap(&link(), &entry(), &tap(OWNER, edited, keyboard(), NOW)).is_err());
}

#[test]
fn a_message_too_old_to_show_is_refused() {
    assert!(trusted_tap(&link(), &entry(), &tap(OWNER, "", Value::Null, 0)).is_err());
}

#[test]
fn an_entry_from_before_texts_were_kept_checks_only_the_buttons() {
    let mut e = entry();
    e.posts[0].text.clear();
    assert_eq!(trusted_tap(&link(), &e, &tap(OWNER, "anything", keyboard(), NOW)), Ok(()));
}

#[test]
fn buttons_compare_by_text_and_data_and_ignore_a_tick() {
    let mut extra = keyboard();
    extra["inline_keyboard"][0][0]["url"] = json!("ignored-field");
    assert_eq!(buttons(&extra), buttons(&keyboard()));
    let mut ticked = keyboard();
    ticked["inline_keyboard"][0][0]["text"] = json!("✓ Post now");
    assert_eq!(buttons(&ticked), buttons(&keyboard()));
    assert_ne!(buttons(&json!({})), buttons(&keyboard()));
}

#[test]
fn only_the_user_in_a_linked_chat_counts_as_answering() {
    assert!(from_user(&link(), &json!({ "id": OWNER }), OWNER));
    assert!(!from_user(&link(), &json!({ "id": 2002 }), OWNER));
    assert!(!from_user(&link(), &json!({ "id": OWNER }), 5005));
}
