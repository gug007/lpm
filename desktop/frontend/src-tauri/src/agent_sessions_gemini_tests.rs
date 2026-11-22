use super::*;
use tempfile::TempDir;

const SESSION: &str = "22fcb53d-7747-4fb3-8751-2564c720e765";
const ROOT: &str = "/work/shop";

fn chats(gemini: &Path, name: &str) -> PathBuf {
    let dir = gemini.join("tmp").join(name).join("chats");
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn register(gemini: &Path, root: &str, name: &str) {
    std::fs::write(
        gemini.join("projects.json"),
        serde_json::json!({ "projects": { root: name } }).to_string(),
    )
    .unwrap();
}

fn jsonl(records: &[Value]) -> String {
    records.iter().map(|r| format!("{r}\n")).collect()
}

fn header(id: &str, kind: &str) -> Value {
    serde_json::json!({
        "sessionId": id, "projectHash": "h", "startTime": "2026-11-22T08:00:00Z",
        "lastUpdated": "2026-11-22T08:00:00Z", "kind": kind,
    })
}

fn user(id: &str, text: &str) -> Value {
    serde_json::json!({ "id": id, "type": "user", "content": [{ "text": text }] })
}

#[test]
fn a_chat_lists_its_opening_prompt_past_the_injected_context() {
    let home = TempDir::new().unwrap();
    register(home.path(), ROOT, "shop");
    let dir = chats(home.path(), "shop");
    std::fs::write(
        dir.join("session-2026-11-22T08-00-22fcb53d.jsonl"),
        jsonl(&[
            header(SESSION, "main"),
            serde_json::json!({ "$set": { "messages": [user("a", "<session_context>\nThis is the Gemini CLI.")] } }),
            user("b", "/model"),
            user("c", "Add Apple Pay to checkout"),
            serde_json::json!({ "id": "d", "type": "gemini", "content": "On it." }),
        ]),
    )
    .unwrap();

    let page = page(Some(home.path()), ROOT, "", 40);
    assert_eq!(page.rows.len(), 1);
    let row = &page.rows[0];
    assert_eq!(row.provider, "gemini");
    assert_eq!(row.session_id, SESSION);
    assert_eq!(row.preview.as_deref(), Some("Add Apple Pay to checkout"));
    assert!(row.title.is_none());
    assert!(row.updated_at > 0);
}

#[test]
fn the_newest_summary_names_the_chat() {
    let home = TempDir::new().unwrap();
    register(home.path(), ROOT, "shop");
    let dir = chats(home.path(), "shop");
    std::fs::write(
        dir.join("session-2026-11-22T08-00-22fcb53d.jsonl"),
        jsonl(&[
            header(SESSION, "main"),
            user("a", "Add Apple Pay"),
            serde_json::json!({ "$set": { "summary": "Payments" } }),
            serde_json::json!({ "$set": { "summary": "Apple Pay in checkout" } }),
        ]),
    )
    .unwrap();

    let row = &page(Some(home.path()), ROOT, "", 40).rows[0];
    assert_eq!(row.title.as_deref(), Some("Apple Pay in checkout"));
}

#[test]
fn sub_agents_empty_starts_and_other_folders_are_left_out() {
    let home = TempDir::new().unwrap();
    register(home.path(), ROOT, "shop");
    let dir = chats(home.path(), "shop");
    std::fs::write(
        dir.join("session-2026-11-22T08-00-aaaaaaaa.jsonl"),
        jsonl(&[
            header("aaaaaaaa-1", "subagent"),
            user("a", "Look for tests"),
        ]),
    )
    .unwrap();
    std::fs::write(
        dir.join("session-2026-11-22T08-01-bbbbbbbb.jsonl"),
        jsonl(&[header("bbbbbbbb-1", "main"), user("a", "/help")]),
    )
    .unwrap();
    let other = chats(home.path(), "elsewhere");
    std::fs::write(
        other.join("session-2026-11-22T08-02-cccccccc.jsonl"),
        jsonl(&[header("cccccccc-1", "main"), user("a", "Hello")]),
    )
    .unwrap();

    assert!(page(Some(home.path()), ROOT, "", 40).rows.is_empty());
}

#[test]
fn a_folder_gemini_never_registered_is_found_by_its_hash() {
    let home = TempDir::new().unwrap();
    let hash = hex::encode(Sha256::digest(ROOT.as_bytes()));
    let dir = chats(home.path(), &hash);
    std::fs::write(
        dir.join("session-2026-11-22T08-00-22fcb53d.json"),
        serde_json::json!({
            "sessionId": SESSION, "projectHash": hash,
            "messages": [user("a", "Fix the flaky login test")],
        })
        .to_string(),
    )
    .unwrap();

    let rows = page(Some(home.path()), ROOT, "flaky", 40).rows;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].preview.as_deref(), Some("Fix the flaky login test"));
    assert!(page(Some(home.path()), ROOT, "checkout", 40)
        .rows
        .is_empty());
}

#[test]
fn a_registry_name_cannot_point_outside_gemini_tmp() {
    let home = TempDir::new().unwrap();
    register(home.path(), ROOT, "../../etc");
    let dirs = chats_dirs(home.path(), ROOT);
    assert!(dirs.iter().all(|d| d.starts_with(home.path().join("tmp"))));
    assert!(!dirs.iter().any(|d| d.to_string_lossy().contains("..")));
}
