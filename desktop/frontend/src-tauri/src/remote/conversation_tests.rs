use super::*;
use crate::agent_conversation::Body;

fn item(id: &str, text: &str) -> Item {
    Item {
        id: id.into(),
        body: Body::Text { text: text.into() },
    }
}

fn session(id: &str) -> Option<AgentSession> {
    Some(AgentSession {
        provider: "claude".into(),
        session_id: id.into(),
    })
}

fn sent(id: &str, items: &[Item]) -> Sent {
    Sent {
        session: session(id),
        items: items.to_vec(),
        error: None,
    }
}

fn ids(items: &[Item]) -> Vec<&str> {
    items.iter().map(|item| item.id.as_str()).collect()
}

#[test]
fn only_changed_and_new_entries_are_sent() {
    let before = sent("s", &[item("a", "1"), item("b", "running")]);
    let now = sent("s", &[item("a", "1"), item("b", "done"), item("c", "3")]);
    assert_eq!(ids(&changes(&before, &now).unwrap()), ["b", "c"]);
    assert!(changes(&now, &now).unwrap().is_empty());
}

#[test]
fn a_list_that_is_not_the_same_one_further_on_is_sent_again() {
    let before = sent("s", &[item("a", "1"), item("b", "2")]);
    assert!(changes(&before, &sent("other", &[item("a", "1"), item("b", "2")])).is_none());
    assert!(changes(&before, &sent("s", &[item("a", "1")])).is_none());
    assert!(changes(&before, &sent("s", &[item("a", "1"), item("x", "2")])).is_none());
    assert!(changes(&sent("s", &[]), &before).is_none());
}

#[test]
fn the_newest_entries_fit_the_limit_and_the_budget() {
    let items = [item("a", "1"), item("b", "2"), item("c", "3")];
    assert_eq!(newest(&items, 2, 1 << 20), 1);
    assert_eq!(newest(&items, 10, 1 << 20), 0);
    assert_eq!(newest(&items, 10, 1), 2);
    assert_eq!(newest(&[], 10, 1), 0);
}

#[test]
fn a_terminal_without_a_session_has_an_empty_conversation() {
    let mut feed = Feed::new("t".into(), "app".into(), 10);
    feed.read(None);
    let (frame, now) = feed.frame().unwrap();
    assert_eq!(
        frame,
        json!({ "t": "conversation", "id": "t", "project": "app", "ok": true,
            "reset": true, "items": [], "more": false })
    );
    feed.sent(now);
    feed.read(None);
    assert!(feed.frame().is_none());
}

#[test]
fn the_list_keeps_its_start_as_it_grows() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.jsonl");
    let prompt = |id: &str| {
        format!(
            "{}\n",
            json!({"type": "user", "uuid": id, "message": {"content": id}})
        )
    };
    std::fs::write(&path, [prompt("a"), prompt("b"), prompt("c")].concat()).unwrap();
    let mut feed = Feed::new("t".into(), "app".into(), 2);
    feed.session = session("s");
    let transcript = crate::agent_conversation::Transcript {
        provider: crate::agent_session_titles::AgentProvider::Claude,
        path: path.clone(),
    };
    feed.reader = Some(Reader::open(transcript, 2).unwrap());
    let (frame, now) = feed.frame().unwrap();
    assert_eq!(ids(&now.items), ["b", "c"]);
    assert_eq!(frame["more"], json!(true));
    feed.sent(now);

    let all = [prompt("a"), prompt("b"), prompt("c"), prompt("d")].concat();
    std::fs::write(&path, all).unwrap();
    feed.read(session("s"));
    let (frame, now) = feed.frame().unwrap();
    assert_eq!(ids(&now.items), ["b", "c", "d"]);
    assert_eq!(frame["reset"], json!(false));
    assert_eq!(frame["items"].as_array().unwrap().len(), 1);
}

#[test]
fn a_list_sent_again_holds_the_newest_entries() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("s.jsonl");
    let said = |id: &str, parent: Option<&str>| {
        let record =
            json!({"type": "user", "uuid": id, "parentUuid": parent, "message": {"content": id}});
        format!("{record}\n")
    };
    let all = [said("a", None), said("b", Some("a")), said("c", Some("b"))].concat();
    std::fs::write(&path, &all).unwrap();
    let mut feed = Feed::new("t".into(), "app".into(), 2);
    feed.session = session("s");
    feed.first = Some("a".into());
    let transcript = crate::agent_conversation::Transcript {
        provider: crate::agent_session_titles::AgentProvider::Claude,
        path: path.clone(),
    };
    feed.reader = Some(Reader::open(transcript, 9).unwrap());
    let (_, now) = feed.frame().unwrap();
    assert_eq!(ids(&now.items), ["b", "c"]);
    feed.sent(now);
    std::fs::write(&path, [all, said("d", Some("b"))].concat()).unwrap();
    feed.read(session("s"));
    let (frame, now) = feed.frame().unwrap();
    assert_eq!(frame["reset"], json!(true));
    assert_eq!(ids(&now.items), ["b", "d"]);
    assert_eq!(frame["more"], json!(true));
}

#[test]
fn asked_limits_are_kept_in_range() {
    assert_eq!(limit(&json!({})), DEFAULT_LIMIT);
    assert_eq!(limit(&json!({"limit": 0})), 1);
    assert_eq!(limit(&json!({"limit": 9999})), MAX_LIMIT);
}
