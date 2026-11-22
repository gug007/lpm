use super::*;

fn session(title: Option<&str>, preview: Option<&str>) -> AgentSessionSummary {
    AgentSessionSummary {
        provider: "claude",
        session_id: "4f1c".into(),
        title: title.map(str::to_string),
        preview: preview.map(str::to_string),
        updated_at: 0,
        git_branch: Some("  ".into()),
        account: Some("default".into()),
    }
}

#[test]
fn image_placeholders_leave_the_words_around_them() {
    assert_eq!(
        clean_prompt(Some("fix this [Image #1] please")),
        "fix this please"
    );
    assert_eq!(clean_prompt(Some("  [Image #12]  ")), "Image prompt");
    assert_eq!(clean_prompt(Some("[Image #x] stays")), "[Image #x] stays");
    assert_eq!(clean_prompt(None), "");
}

#[test]
fn a_prompt_that_restates_the_title_is_an_echo() {
    assert!(echoes_title("Fix login bug", "fix login bug"));
    assert!(echoes_title("Linux host issue…", "linux host issue"));
    assert!(!echoes_title("Fix login", "fix login bug in the auth flow"));
    assert!(echoes_title("", "anything"));
}

#[test]
fn a_name_the_user_gave_the_tab_wins() {
    let s = session(Some("Agent title"), Some("first prompt"));
    let history = vec![json!({ "resumeCmd": "claude --resume 4f1c",
        "sessionTitle": "My name", "sessionTitleSource": "manual" })];
    assert_eq!(SessionRow::new(&s, &history).title, "My name");
}

#[test]
fn the_title_falls_back_to_the_prompt_then_the_tab() {
    let s = session(None, Some("first prompt"));
    let row = SessionRow::new(&s, &[]);
    assert_eq!(row.title, "first prompt");
    assert_eq!(row.preview, "");

    let s = session(None, None);
    let history =
        vec![json!({ "resumeCmd": "claude --resume 4f1c", "label": "Claude", "closedAt": 7 })];
    let row = SessionRow::new(&s, &history);
    assert_eq!(row.title, "Claude");
    assert_eq!(row.updated_at, 7);
    assert_eq!(SessionRow::new(&s, &[]).title, UNTITLED);
}

#[test]
fn rows_carry_only_what_they_have() {
    let s = session(Some("Title"), Some("a different first prompt"));
    let open = HashMap::from([("4f1c".to_string(), "t-1".to_string())]);
    let row = SessionRow::new(&s, &[]).to_json(&open, &HashMap::new());
    assert_eq!(row["key"], "claude:4f1c");
    assert_eq!(row["preview"], "a different first prompt");
    assert_eq!(row["openIn"], "t-1");
    assert!(row.get("gitBranch").is_none());
    assert!(row.get("account").is_none());
}

#[test]
fn another_account_shows_by_its_label() {
    let mut s = session(Some("Title"), None);
    s.account = Some("acct-1".into());
    let labels = HashMap::from([("acct-1".to_string(), "Work".to_string())]);
    let row = SessionRow::new(&s, &[]).to_json(&HashMap::new(), &labels);
    assert_eq!(row["account"], "Work");
    let row = SessionRow::new(&s, &[]).to_json(&HashMap::new(), &HashMap::new());
    assert_eq!(row["account"], "Removed account");
}

#[test]
fn a_plain_shell_carries_no_agent() {
    assert_eq!(launch_request(&json!({ "project": "p" })), None);
    assert_eq!(launch_request(&json!({ "agent": " " })), None);
    let req =
        launch_request(&json!({ "agent": "claude", "model": "opus", "prompt": "go" })).unwrap();
    assert_eq!(
        req,
        json!({ "agent": "claude", "model": "opus", "effort": "", "prompt": "go" })
    );
}

#[test]
fn a_resume_names_its_conversation() {
    assert_eq!(resume_request(&json!({ "provider": "claude" })), None);
    let req =
        resume_request(&json!({ "provider": "codex", "sessionId": "x", "title": "T" })).unwrap();
    assert_eq!(
        req,
        json!({ "provider": "codex", "sessionId": "x", "title": "T" })
    );
}

#[test]
fn a_tab_holding_a_resumed_conversation_counts_as_open() {
    note_tabs(&[
        json!({ "id": "shop-gem-1", "resumable": "gem-session-1" }),
        json!({ "id": "shop-shell-1", "resumable": null }),
    ]);
    let open = with_resumed(HashMap::new(), &["shop-gem-1".into(), "shop-shell-1".into()]);
    assert_eq!(open.get("gem-session-1").map(String::as_str), Some("shop-gem-1"));
    assert_eq!(open.len(), 1);

    // The tab's live session wins, and a tab that let go of it is no longer open.
    let live = HashMap::from([("gem-session-1".to_string(), "shop-other-1".to_string())]);
    let open = with_resumed(live, &["shop-gem-1".into()]);
    assert_eq!(open.get("gem-session-1").map(String::as_str), Some("shop-other-1"));
    note_tabs(&[json!({ "id": "shop-gem-1" })]);
    assert!(with_resumed(HashMap::new(), &["shop-gem-1".into()]).is_empty());
}

#[test]
fn a_tab_from_another_project_is_not_open_here() {
    note_tabs(&[json!({ "id": "other-oc-1", "resumable": "ses_abc" })]);
    assert!(with_resumed(HashMap::new(), &["shop-oc-1".into()]).is_empty());
}
