use super::*;

fn window(records: &[&str]) -> String {
    records.iter().map(|r| format!("{r}\n")).collect()
}

const PROMPT: &str = r#"{"type":"user","message":{"role":"user","content":"fix the bug"}}"#;
const REQUEST: &str = r#"{"type":"api-request","timestamp":"2026-11-04T17:35:47.526Z"}"#;
const THINKING: &str = r#"{"type":"assistant","message":{"stop_reason":null,"content":[{"type":"thinking","thinking":"…"}]}}"#;
const TOOL_USE: &str = r#"{"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","name":"Bash"}]}}"#;
const TOOL_RESULT: &str = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}"#;
const ANSWER: &str = r#"{"type":"assistant","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Done."}]}}"#;
const STOP_SUMMARY: &str = r#"{"type":"system","subtype":"stop_hook_summary"}"#;
const TURN_DURATION: &str = r#"{"type":"system","subtype":"turn_duration"}"#;
const METADATA: [&str; 5] = [
    r#"{"type":"last-prompt"}"#,
    r#"{"type":"mode"}"#,
    r#"{"type":"permission-mode"}"#,
    r#"{"type":"attachment"}"#,
    r#"{"type":"ai-title"}"#,
];

// Claude 2.1.318, a fullscreen view scrolled away: a turn writing one long
// answer drew nothing and reported nothing for 40 s, and the sweep dropped it.
#[test]
fn a_turn_still_thinking_or_writing_goes_on() {
    assert_eq!(verdict(&window(&[PROMPT])), Some(true));
    assert_eq!(verdict(&window(&[PROMPT, REQUEST])), Some(true));
    assert_eq!(verdict(&window(&[PROMPT, REQUEST, THINKING])), Some(true));
    let mut tail = vec![PROMPT, REQUEST];
    tail.extend(METADATA);
    assert_eq!(verdict(&window(&tail)), Some(true), "metadata says nothing");
}

// Claude carries on by itself after a reply cut at the output limit.
#[test]
fn a_reply_cut_off_at_its_limit_goes_on() {
    let cut_off = r#"{"type":"assistant","message":{"stop_reason":"max_tokens"}}"#;
    assert_eq!(verdict(&window(&[PROMPT, cut_off])), Some(true));
}

#[test]
fn a_turn_running_a_tool_or_reading_its_result_goes_on() {
    assert_eq!(verdict(&window(&[PROMPT, TOOL_USE])), Some(true));
    assert_eq!(
        verdict(&window(&[PROMPT, TOOL_USE, TOOL_RESULT])),
        Some(true)
    );
}

#[test]
fn a_finished_turn_is_over() {
    assert_eq!(verdict(&window(&[PROMPT, ANSWER])), Some(false));
    assert_eq!(
        verdict(&window(&[PROMPT, ANSWER, STOP_SUMMARY, TURN_DURATION])),
        Some(false)
    );
    let refused = r#"{"type":"assistant","message":{"stop_reason":"refusal"}}"#;
    assert_eq!(verdict(&window(&[PROMPT, refused])), Some(false));
    let mut tail = vec![PROMPT, ANSWER, TURN_DURATION];
    tail.extend(METADATA);
    assert_eq!(verdict(&window(&tail)), Some(false));
}

// Esc wrote these within 60 ms of the key, mid-answer and mid-tool.
#[test]
fn an_interrupted_turn_is_over() {
    let mid_answer = r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#;
    let mid_tool = r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]}}"#;
    let rejected = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"User rejected tool use"}]}}"#;
    assert_eq!(
        verdict(&window(&[PROMPT, THINKING, mid_answer])),
        Some(false)
    );
    assert_eq!(
        verdict(&window(&[PROMPT, TOOL_USE, rejected, mid_tool])),
        Some(false)
    );
    let plain =
        r#"{"type":"user","message":{"role":"user","content":"[Request interrupted by user]"}}"#;
    assert_eq!(verdict(&window(&[PROMPT, plain])), Some(false));
}

#[test]
fn a_sub_agents_records_and_claudes_own_notes_say_nothing() {
    let sidechain =
        r#"{"type":"assistant","isSidechain":true,"message":{"stop_reason":"end_turn"}}"#;
    let meta = r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>"}}"#;
    assert_eq!(verdict(&window(&[PROMPT, TOOL_USE, sidechain])), Some(true));
    assert_eq!(verdict(&window(&[PROMPT, ANSWER, meta])), Some(false));
}

// Anything else falls back to judging the pane by its silence, as before.
#[test]
fn a_transcript_that_says_nothing_decides_nothing() {
    assert_eq!(verdict(""), None);
    assert_eq!(verdict(&window(&METADATA)), None);
    assert_eq!(
        verdict(&window(&[r#"{"type":"system","subtype":"api_error"}"#])),
        None
    );
    assert_eq!(verdict("not json\n"), None);
    assert_eq!(verdict(PROMPT), None, "a record still being written");
}

// Claude 2.1.318 after a manual /compact: what it writes starts no turn, so the
// turn before it still speaks (on /model, /effort and /clear alike).
#[test]
fn a_slash_command_and_what_it_printed_say_nothing() {
    let typed = r#"{"type":"user","message":{"role":"user","content":"/compact"}}"#;
    let summary = r#"{"type":"user","isCompactSummary":true,"isVisibleInTranscriptOnly":true,"message":{"role":"user","content":"This session is being continued from a previous conversation"}}"#;
    let name = r#"{"type":"user","message":{"role":"user","content":"<command-name>/compact</command-name>"}}"#;
    let printed = r#"{"type":"user","message":{"role":"user","content":"<local-command-stdout>Compacted</local-command-stdout>"}}"#;
    let reminder = r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>…</system-reminder>"}]}}"#;
    let bash =
        r#"{"type":"user","message":{"role":"user","content":"<bash-input>ls</bash-input>"}}"#;
    let orphan = r#"{"type":"user","queueTranscriptOnly":true,"message":{"role":"user","content":"<task-notification>shell exited</task-notification>"}}"#;
    let tail = [
        PROMPT,
        ANSWER,
        TURN_DURATION,
        typed,
        summary,
        name,
        printed,
        reminder,
        bash,
        orphan,
    ];
    assert_eq!(verdict(&window(&tail)), Some(false));
    let skill = r#"{"type":"user","message":{"role":"user","content":"<command-message>review</command-message>"}}"#;
    assert_eq!(
        verdict(&window(&[TURN_DURATION, skill, REQUEST])),
        Some(true),
        "a skill's turn shows its request"
    );
}

// A background task reporting back starts a turn only when Claude queries for
// it, which it records right away.
#[test]
fn what_wakes_a_session_goes_on() {
    let notification = r#"{"type":"user","message":{"role":"user","content":"<task-notification>build finished</task-notification>"}}"#;
    let image_first = r#"{"type":"user","message":{"role":"user","content":[{"type":"image"},{"type":"text","text":"what is this"}]}}"#;
    assert_eq!(
        verdict(&window(&[ANSWER, TURN_DURATION, notification])),
        Some(false)
    );
    assert_eq!(
        verdict(&window(&[ANSWER, TURN_DURATION, notification, REQUEST])),
        Some(true)
    );
    assert_eq!(
        verdict(&window(&[ANSWER, TURN_DURATION, image_first])),
        Some(true)
    );
}

// Esc before the answer's first word left the transcript on its request.
#[test]
fn a_stop_key_counts_only_after_the_agents_last_report() {
    stop_key("t-stop", 2_000);
    assert!(stop_key_since("t-stop", 1_000));
    assert!(!stop_key_since("t-stop", 2_000), "it reported since");
    assert!(!stop_key_since("t-other", 1_000));
    stop_key("t-later", 2_000 + STOP_KEY_KEPT_MS);
    assert!(!stop_key_since("t-stop", 1_000), "old keys are let go");
}

// A Claude killed mid-turn leaves a transcript that reads as going on for good.
#[test]
fn a_turn_is_believed_only_with_its_agent_alive() {
    assert!(!goes_on(
        "p",
        "claude_code_0f8c2a51-6a8e-4c43-9a1e-2b7f3f5d9c10",
        "t-unwatched",
        None,
        0
    ));
}

#[test]
fn a_reading_holds_while_the_file_is_unchanged() {
    let path = PathBuf::from("/nowhere/s1.jsonl");
    remember(path.clone(), (10, None), Some(true));
    assert_eq!(read_before(&path, (10, None)), Some(Some(true)));
    assert_eq!(read_before(&path, (11, None)), None, "it grew");
}

#[test]
fn only_a_claude_session_key_has_a_transcript() {
    assert_eq!(transcript_says("p", "codex_p-1", None), None);
    assert_eq!(
        transcript_says("p", "claude_code_../../etc/passwd", None),
        None
    );
    assert_eq!(transcript_says("p", "deploy", None), None);
}
