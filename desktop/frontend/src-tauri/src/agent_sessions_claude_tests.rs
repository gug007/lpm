use super::*;
use serde_json::json;
use std::fs;
use std::time::Duration;
use tempfile::TempDir;

const SESSION_A: &str = "019fac59-0da4-7160-b104-5b8429ba1054";
const SESSION_B: &str = "019fac59-0da4-7160-b104-5b8429ba1055";

fn transcript(dir: &Path, session_id: &str, lines: &[Value]) -> PathBuf {
    let path = dir.join(format!("{session_id}.jsonl"));
    let body = lines
        .iter()
        .map(|line| line.to_string())
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&path, format!("{body}\n")).unwrap();
    path
}

fn user_line(text: &str, branch: &str) -> Value {
    json!({
        "type": "user",
        "gitBranch": branch,
        "message": {"role": "user", "content": [{"type": "text", "text": text}]},
    })
}

fn set_mtime(path: &Path, unix_seconds: u64) {
    let times = fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(unix_seconds));
    fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(times)
        .unwrap();
}

fn candidate(path: PathBuf, session_id: &str) -> Candidate {
    Candidate {
        path,
        session_id: session_id.to_string(),
        updated_at: 1_700_000_000_000,
    }
}

#[test]
fn head_reads_the_first_real_prompt_and_branch() {
    let dir = TempDir::new().unwrap();
    let path = transcript(
        dir.path(),
        SESSION_A,
        &[
            json!({"type": "mode", "mode": "normal"}),
            user_line("<command-name>/clear</command-name>", "main"),
            user_line("<system-reminder>be nice</system-reminder>", "main"),
            user_line("  wire up the resume picker  ", "feat/resume"),
            user_line("second prompt", "feat/resume"),
        ],
    );

    let head = head(&path);
    assert_eq!(head.preview.as_deref(), Some("wire up the resume picker"));
    assert_eq!(head.git_branch.as_deref(), Some("feat/resume"));
    assert!(head.interactive);
}

#[test]
fn head_skips_sidechain_records() {
    let dir = TempDir::new().unwrap();
    let mut sidechain = user_line("subagent prompt", "main");
    sidechain["isSidechain"] = json!(true);
    let path = transcript(
        dir.path(),
        SESSION_A,
        &[sidechain, user_line("the real prompt", "main")],
    );

    assert_eq!(
        head(&path).preview.as_deref(),
        Some("the real prompt")
    );
}

#[test]
fn tail_title_takes_the_newest_record() {
    let dir = TempDir::new().unwrap();
    let path = transcript(
        dir.path(),
        SESSION_A,
        &[
            json!({"type": "ai-title", "aiTitle": "First guess"}),
            user_line("hello", "main"),
            json!({"type": "ai-title", "aiTitle": "Resume session picker"}),
        ],
    );
    let len = fs::metadata(&path).unwrap().len();

    assert_eq!(
        tail_title(&path, len).as_deref(),
        Some("Resume session picker")
    );
}

#[test]
fn tail_title_prefers_a_custom_title_and_falls_back_when_cleared() {
    let dir = TempDir::new().unwrap();
    let renamed = transcript(
        dir.path(),
        SESSION_A,
        &[
            json!({"type": "ai-title", "aiTitle": "Generated"}),
            json!({"type": "custom-title", "customTitle": "My name for it"}),
        ],
    );
    let len = fs::metadata(&renamed).unwrap().len();
    assert_eq!(
        tail_title(&renamed, len).as_deref(),
        Some("My name for it")
    );

    let cleared = transcript(
        dir.path(),
        SESSION_B,
        &[
            json!({"type": "ai-title", "aiTitle": "Generated"}),
            json!({"type": "custom-title", "customTitle": Value::Null}),
        ],
    );
    let len = fs::metadata(&cleared).unwrap().len();
    assert_eq!(tail_title(&cleared, len).as_deref(), Some("Generated"));
}

/// The seek lands mid-record in a file past the tail window; the partial first
/// line must not poison the scan.
#[test]
fn tail_title_survives_a_partial_leading_record() {
    let dir = TempDir::new().unwrap();
    let filler = json!({"type": "assistant", "text": "x".repeat(TAIL_SCAN_BYTES as usize)});
    let path = transcript(
        dir.path(),
        SESSION_A,
        &[
            json!({"type": "ai-title", "aiTitle": "Too old to see"}),
            filler,
            json!({"type": "ai-title", "aiTitle": "Recent title"}),
        ],
    );
    let len = fs::metadata(&path).unwrap().len();

    assert_eq!(tail_title(&path, len).as_deref(), Some("Recent title"));
}

#[test]
fn candidates_are_newest_first_and_ignore_non_transcripts() {
    let dir = TempDir::new().unwrap();
    let older = transcript(dir.path(), SESSION_A, &[user_line("older", "main")]);
    let newer = transcript(dir.path(), SESSION_B, &[user_line("newer", "main")]);
    fs::write(dir.path().join("notes.txt"), "ignored").unwrap();
    fs::write(dir.path().join("empty.jsonl"), "").unwrap();
    fs::create_dir(dir.path().join("subagents")).unwrap();
    set_mtime(&older, 1_700_000_000);
    set_mtime(&newer, 1_700_000_100);

    let found = candidates(dir.path());
    let ids = found
        .iter()
        .map(|c| c.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec![SESSION_B, SESSION_A]);
    assert_eq!(found[0].updated_at, 1_700_000_100_000);
}

#[test]
fn summaries_stop_at_the_page_size_without_a_search() {
    let dir = TempDir::new().unwrap();
    let a = candidate(
        transcript(dir.path(), SESSION_A, &[user_line("first", "main")]),
        SESSION_A,
    );
    let b = candidate(
        transcript(dir.path(), SESSION_B, &[user_line("second", "main")]),
        SESSION_B,
    );

    let (page, scanned) = summaries(&[a, b], "", 1);
    assert_eq!(page.len(), 1);
    assert_eq!(scanned, 1);
}

#[test]
fn summaries_keep_scanning_for_a_search_match() {
    let dir = TempDir::new().unwrap();
    let a = candidate(
        transcript(dir.path(), SESSION_A, &[user_line("unrelated work", "main")]),
        SESSION_A,
    );
    let b = candidate(
        transcript(
            dir.path(),
            SESSION_B,
            &[user_line("Fix the RESUME picker", "main")],
        ),
        SESSION_B,
    );

    let (page, scanned) = summaries(&[a, b], "resume", 10);
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].session_id, SESSION_B);
    assert_eq!(scanned, 2);
}

/// lpm's own generators run `claude -p` in the project directory, so their
/// transcripts land beside real conversations. They aren't ones to resume.
#[test]
fn summaries_drop_headless_runs() {
    let dir = TempDir::new().unwrap();
    let mut headless = user_line("Given the following git diff, write a message", "main");
    headless["entrypoint"] = json!("sdk-cli");
    let candidate = candidate(transcript(dir.path(), SESSION_A, &[headless]), SESSION_A);

    assert!(summaries(&[candidate], "", 10).0.is_empty());
}

#[test]
fn summaries_drop_transcripts_with_nothing_to_show() {
    let dir = TempDir::new().unwrap();
    let empty = candidate(
        transcript(
            dir.path(),
            SESSION_A,
            &[json!({"type": "mode", "mode": "normal"})],
        ),
        SESSION_A,
    );

    assert!(summaries(&[empty], "", 10).0.is_empty());
}
