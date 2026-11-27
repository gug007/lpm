use super::*;

fn shell(id: &str, description: &str, command: &str) -> String {
    serde_json::json!({ "id": id, "type": "shell", "status": "running", "description": description, "command": command })
        .to_string()
}

fn tasks(entries: &[String]) -> String {
    format!("[{}]", entries.join(","))
}

#[test]
fn a_build_left_running_is_waited_on() {
    let bg = tasks(&[shell(
        "b1",
        "Build the debug desktop app",
        "cargo build 2>&1 | tail -3 > /dev/null",
    )]);
    assert!(waits_on_shells("w1", "claude_code_s1", &bg));
}

#[test]
fn a_server_or_a_watcher_settles_the_turn() {
    for (description, command) in [
        (
            "Start the website dev server on port 3917",
            "cd website && npx next dev -p 3917",
        ),
        (
            "Serve the canvas boards locally",
            "python3 -I -m http.server 8765",
        ),
        (
            "Launch the isolated test app",
            "./lpm-desktop > app.log 2>&1",
        ),
        ("Follow the app log", "tail -f app.log"),
        ("Run unit tests", "npx vitest --watch"),
    ] {
        let bg = tasks(&[shell("s1", description, command)]);
        assert!(
            !waits_on_shells("w2", "claude_code_s1", &bg),
            "{description}"
        );
    }
}

#[test]
fn only_running_shells_are_waited_on() {
    let agent = serde_json::json!({ "id": "a1", "type": "agent", "status": "running", "description": "Build it" });
    let monitor = serde_json::json!({ "id": "m1", "type": "monitor", "status": "running", "description": "comments" });
    let done = serde_json::json!({ "id": "b2", "type": "shell", "status": "completed", "description": "Build" });
    let bg = format!("[{agent},{monitor},{done}]");
    assert!(!waits_on_shells("w3", "claude_code_s1", &bg));
    assert!(!waits_on_shells("w3", "claude_code_s1", "not json"));
}

// A dev server that doesn't look like one keeps the turn it was started in
// waiting, but once the user moves on it is the background they work beside.
#[test]
fn a_shell_running_when_the_user_prompts_again_settles_later_turns() {
    let server = tasks(&[shell(
        "x1",
        "Run the recording socket",
        "python3 listener.py",
    )]);
    stopped_beside("w4", "claude_code_s1", &server);
    assert!(waits_on_shells("w4", "claude_code_s1", &server));
    settle("w4", "claude_code_s1");
    assert!(!waits_on_shells("w4", "claude_code_s1", &server));
    let build = tasks(&[
        shell("x1", "Run the recording socket", "python3 listener.py"),
        shell("x2", "Run the tests", "cargo test"),
    ]);
    assert!(
        waits_on_shells("w4", "claude_code_s1", &build),
        "a new one is waited on"
    );
}

// A shell seen at a Stop that only paused counts too: the user prompting
// after it means it is background they work beside.
#[test]
fn a_shell_seen_at_a_paused_stop_settles_with_the_next_prompt() {
    let agent =
        serde_json::json!({ "id": "a1", "type": "subagent", "status": "running" }).to_string();
    let paused = tasks(&[shell("y1", "Run the API", "go run ./cmd/api"), agent]);
    stopped_beside("w6", "claude_code_s1", &paused);
    settle("w6", "claude_code_s1");
    let later = tasks(&[shell("y1", "Run the API", "go run ./cmd/api")]);
    assert!(!waits_on_shells("w6", "claude_code_s1", &later));
}

// bg-b4b: each event of a Monitor wakes the session; it stays one piece of work
// until the watch ends.
#[test]
fn a_wake_up_leaves_the_shell_waited_on() {
    let watch = tasks(&[shell(
        "m2",
        "Watch 3-tick sleep loop",
        "for i in 1 2 3; do sleep 12; echo tick $i; done",
    )]);
    assert!(waits_on_shells("w5", "claude_code_s1", &watch));
    assert!(waits_on_shells("w5", "claude_code_s1", &watch));
    let flag = tasks(&[shell(
        "m3",
        "Waiting for bg-flag.txt to exist",
        "until [ -f bg-flag.txt ]; do sleep 2; done",
    )]);
    assert!(waits_on_shells("w5", "claude_code_s1", &flag));
}

#[test]
fn long_lived_matches_words_not_parts_of_them() {
    assert!(!long_lived(
        "Build debug devices list",
        "cargo build > /dev/null"
    ));
    assert!(!long_lived("Restart the job", "sleep 40"));
    assert!(long_lived(
        "Run the relay dev server locally",
        "npx wrangler dev --port 8788"
    ));
}

// subagent-s6: Ctrl+C stopped the background agent with no SubagentStop. The
// next Stop listed none, and every later finish was held behind it.
#[test]
fn a_stop_listing_no_sub_agent_says_none_is_alive() {
    crate::agentchildren::started("w7", "claude_code_s1", "abb0");
    stopped_beside("w7", "claude_code_s1", "[]");
    assert!(!crate::agentchildren::busy("w7", "claude_code_s1"));

    crate::agentchildren::started("w7", "claude_code_s2", "abb1");
    crate::agentchildren::started("w7", "claude_code_s2", "abb2");
    let listed =
        serde_json::json!([{ "id": "abb2", "type": "subagent", "status": "running" }]).to_string();
    stopped_beside("w7", "claude_code_s2", &listed);
    assert!(crate::agentchildren::busy("w7", "claude_code_s2"));
    stopped_beside("w7", "claude_code_s2", "[]");
    assert!(!crate::agentchildren::busy("w7", "claude_code_s2"));
}

// multi-t1: a teammate is listed under an id of its own, never its agent id.
#[test]
fn a_listed_teammate_keeps_every_sub_agent() {
    crate::agentchildren::started("w8", "claude_code_s1", "aalpha-e44d");
    let team = serde_json::json!([{ "id": "t6e9bvryi", "type": "teammate", "status": "running" }])
        .to_string();
    stopped_beside("w8", "claude_code_s1", &team);
    assert!(crate::agentchildren::busy("w8", "claude_code_s1"));
}

// What a paused tab names: the shells its finish is held for, not the server
// the session works beside.
#[test]
fn a_stop_records_what_the_turn_waits_on() {
    let bg = tasks(&[
        shell(
            "b1",
            "Wait for Screen Recording permission",
            "until ./granted; do sleep 2; done",
        ),
        shell(
            "s1",
            "Start the website dev server on port 3917",
            "npx next dev -p 3917",
        ),
        shell("b2", "", "cargo build --release\n  && echo built"),
    ]);
    stopped_beside("w10", "claude_code_s1", &bg);
    assert_eq!(
        waited_on("w10", "claude_code_s1"),
        [
            "Wait for Screen Recording permission",
            "cargo build --release"
        ]
    );
    assert!(waited_on("w10", "claude_code_other").is_empty());
}

#[test]
fn a_pause_notice_names_its_shells_once_and_again_for_a_new_one() {
    let (project, agent) = ("w11", "claude_code_s1");
    let one = tasks(&[shell("b1", "Run the test suite", "npm test")]);
    stopped_beside(project, agent, &one);
    assert_eq!(
        take_unnoticed(project, agent),
        Some(vec!["Run the test suite".to_string()])
    );
    stopped_beside(project, agent, &one);
    assert_eq!(take_unnoticed(project, agent), None);
    let two = tasks(&[
        shell("b1", "Run the test suite", "npm test"),
        shell("b2", "Build the app", "cargo build"),
    ]);
    stopped_beside(project, agent, &two);
    assert_eq!(
        take_unnoticed(project, agent),
        Some(vec!["Run the test suite".to_string(), "Build the app".to_string()])
    );
}

#[test]
fn a_turn_marked_finished_keeps_no_later_finish_back() {
    let (project, agent) = ("w12", "claude_code_s1");
    let bg = tasks(&[shell("b1", "Run the test suite", "npm test")]);
    stopped_beside(project, agent, &bg);
    assert!(waits_on_shells(project, agent, &bg));
    settle(project, agent);
    assert!(!waits_on_shells(project, agent, &bg));
}
