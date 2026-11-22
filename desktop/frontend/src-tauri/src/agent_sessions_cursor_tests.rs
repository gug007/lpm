use super::*;
use rusqlite::{params, Connection};
use tempfile::TempDir;

const ROOT: &str = "/work/shop";
const CHAT: &str = "462566dd-e43d-4d12-b0e7-9540704b8399";

fn chat(cursor: &Path, workspace: &str, id: &str, meta: Value) -> PathBuf {
    let dir = cursor.join("chats").join(workspace).join(id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("meta.json"), meta.to_string()).unwrap();
    dir
}

fn meta(cwd: &str, updated: i64, conversation: bool) -> Value {
    serde_json::json!({
        "schemaVersion": 1, "createdAtMs": updated - 5, "hasConversation": conversation,
        "updatedAtMs": updated, "cwd": cwd,
    })
}

fn store(dir: &Path, name: &str, blobs: &[Value]) {
    let connection = Connection::open(dir.join("store.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB);
             CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();
    let value = hex::encode(serde_json::json!({ "agentId": "x", "name": name }).to_string());
    connection
        .execute("INSERT INTO meta VALUES ('0', ?1)", params![value])
        .unwrap();
    for (i, blob) in blobs.iter().enumerate() {
        connection
            .execute(
                "INSERT INTO blobs VALUES (?1, ?2)",
                params![format!("b{i}"), blob.to_string().into_bytes()],
            )
            .unwrap();
    }
}

#[test]
fn a_chat_lists_with_its_name_and_the_question_asked() {
    let home = TempDir::new().unwrap();
    let dir = chat(home.path(), "w1", CHAT, meta(ROOT, 2000, true));
    store(
        &dir,
        "Checkout bug",
        &[
            serde_json::json!({ "role": "system", "content": "You are an agent" }),
            serde_json::json!({ "role": "user", "content": "<user_info>\nOS Version: darwin\n</user_info>" }),
            serde_json::json!({ "role": "user", "content": [{ "type": "text",
                "text": "<timestamp>Friday</timestamp>\n<user_query>\nFix the checkout total\n</user_query>" }] }),
        ],
    );

    let page = page(Some(home.path()), ROOT, "", 40);
    assert_eq!(page.rows.len(), 1);
    let row = &page.rows[0];
    assert_eq!(row.provider, "cursor");
    assert_eq!(row.session_id, CHAT);
    assert_eq!(row.title.as_deref(), Some("Checkout bug"));
    assert_eq!(row.preview.as_deref(), Some("Fix the checkout total"));
    assert_eq!(row.updated_at, 2000);
}

#[test]
fn empty_chats_and_other_folders_are_left_out_and_the_newest_leads() {
    let home = TempDir::new().unwrap();
    let older = chat(home.path(), "w1", "aaaaaaaa-1", meta(ROOT, 1000, true));
    store(&older, "New Agent", &[]);
    chat(home.path(), "w1", "bbbbbbbb-1", meta(ROOT, 3000, false));
    let newer = chat(home.path(), "w1", "cccccccc-1", meta(ROOT, 2000, true));
    store(&newer, "Second", &[]);
    let elsewhere = chat(
        home.path(),
        "w2",
        "dddddddd-1",
        meta("/work/other", 4000, true),
    );
    store(&elsewhere, "Other", &[]);

    let rows = page(Some(home.path()), ROOT, "", 40).rows;
    let ids = rows
        .iter()
        .map(|r| r.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, ["cccccccc-1", "aaaaaaaa-1"]);
    // "New Agent" is Cursor's placeholder, not a name.
    assert!(rows[1].title.is_none());
}

#[test]
fn search_reads_the_name_and_the_question() {
    let home = TempDir::new().unwrap();
    let dir = chat(home.path(), "w1", CHAT, meta(ROOT, 2000, true));
    store(
        &dir,
        "Checkout bug",
        &[serde_json::json!({ "role": "user", "content": "<user_query>add tests</user_query>" })],
    );
    assert_eq!(page(Some(home.path()), ROOT, "checkout", 40).rows.len(), 1);
    assert_eq!(page(Some(home.path()), ROOT, "tests", 40).rows.len(), 1);
    assert!(page(Some(home.path()), ROOT, "deploy", 40).rows.is_empty());
}

#[test]
fn user_query_takes_what_was_asked_and_nothing_around_it() {
    assert_eq!(
        user_query(r#"{"role":"user","content":"<a>x</a><user_query> hi </user_query>tail"}"#)
            .as_deref(),
        Some("hi")
    );
    assert!(user_query(r#"{"role":"user","content":"<user_info>os</user_info>"}"#).is_none());
}
