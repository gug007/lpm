// The cases of src/agentDialog.test.ts, so both readers agree on the same screens.
use super::fixtures::*;
use super::*;

const COLS: usize = 100;

fn option(
    key: &str,
    label: &str,
    description: &str,
    selected: bool,
    typed: bool,
) -> AgentDialogOption {
    AgentDialogOption {
        key: key.into(),
        label: label.into(),
        description: description.into(),
        selected,
        typed,
    }
}

fn labels(dialog: &AgentDialog) -> Vec<&str> {
    dialog.options.iter().map(|o| o.label.as_str()).collect()
}

#[test]
fn reads_claude_codes_bash_prompt_with_a_wrapped_label() {
    assert_eq!(
        parse(CLAUDE_BASH, COLS),
        Some(AgentDialog {
            question: "Do you want to proceed?".into(),
            details: vec![
                "Bash command".into(),
                "Write test string to out.txt".into(),
                "echo lpm-dialog-test > out.txt".into(),
            ],
            options: vec![
                option("1", "Yes", "", true, false),
                option(
                    "2",
                    "Yes, and always allow access to /Users/dev/projects/acme-platform/services/billing-api/handlerbilling-api/handlers/stripe/webhooks/v2/inbound from this project",
                    "",
                    false,
                    false,
                ),
                option(
                    "3",
                    "Yes, and switch to auto mode · auto mode handles these prompts for you",
                    "",
                    false,
                    false,
                ),
                option("4", "No", "", false, false),
            ],
        })
    );
}

#[test]
fn reads_claude_codes_file_prompt_and_drops_the_key_hint() {
    let dialog = parse(CLAUDE_WRITE, COLS).unwrap();
    assert_eq!(dialog.question, "Do you want to create notes.md?");
    assert_eq!(dialog.details, ["Create file", "notes.md", "1 hello"]);
    assert_eq!(
        labels(&dialog),
        [
            "Yes",
            "Yes, and switch to accept edits (auto-approve file edits and common file commands) for this session",
            "No",
        ]
    );
}

#[test]
fn reads_a_question_form_with_descriptions_apart_from_labels() {
    let dialog = parse(CLAUDE_ASK, COLS).unwrap();
    assert_eq!(dialog.question, "Which color do you prefer?");
    assert!(dialog.details.is_empty());
    assert_eq!(
        dialog.options,
        [
            option("1", "Red", "Choose red", true, false),
            option("2", "Green", "Choose green", false, false),
            option("3", "Blue", "Choose blue", false, false),
            option("4", "Type something.", "", false, true),
            option("5", "Chat about this", "", false, true),
        ]
    );
}

#[test]
fn reads_a_question_wrapped_beside_a_gutter_as_one_question() {
    let dialog = parse(CLAUDE_ASK_LONG, 70).unwrap();
    assert_eq!(
        dialog.question,
        "To ship the latest lpm Link Android code, the build needs the Play upload keystore (plus its 4 passwords in ~/.gradle/gradle.properties) and app/google-services.json from Firebase. Neither is on this Mac. The Oct 17 build was signed with them somewhere else. How do you want to get them?"
    );
    assert!(dialog.details.is_empty());
    assert_eq!(
        labels(&dialog),
        [
            "I'll put them back",
            "Reset the upload key",
            "Built on another computer",
            "Type something.",
            "Chat about this",
        ]
    );
}

#[test]
fn keeps_a_gutter_questions_paragraphs_apart() {
    let dialog = parse(CLAUDE_ASK_PARAGRAPHS, 70).unwrap();
    assert_eq!(
        dialog.question,
        "The staging deploy failed twice on the same migration step and the logs point at a lock held by the nightly backup job.\nWhich do you want me to try next?"
    );
    assert!(dialog.details.is_empty());
}

#[test]
fn joins_a_question_the_cli_wrapped_at_the_edge_without_a_gutter() {
    let lines = [
        "──────────────────────────────────────────────────",
        " Environment: local",
        "",
        " The migration holds a lock the nightly backup job",
        " needs. Do you want to stop the backup?",
        "",
        " ❯ 1. Yes",
        "   2. No",
    ];
    let dialog = parse(&lines, 50).unwrap();
    assert_eq!(
        dialog.question,
        "The migration holds a lock the nightly backup job needs. Do you want to stop the backup?"
    );
    assert_eq!(dialog.details, ["Environment: local"]);
}

#[test]
fn reads_codexs_command_approval() {
    assert_eq!(
        parse(CODEX_COMMAND, COLS),
        Some(AgentDialog {
            question: "Would you like to run the following command?".into(),
            details: vec![
                "Environment: local".into(),
                "Reason: Allow the exact requested command to write out.txt?".into(),
                "$ echo lpm-dialog-test > out.txt".into(),
            ],
            options: vec![
                option("1", "Yes, proceed", "", true, false),
                option(
                    "2",
                    "Yes, and don't ask again for commands that start with `echo lpm-dialog-test > out.txt`",
                    "",
                    false,
                    false,
                ),
                option("3", "No, and tell Codex what to do differently", "", false, false),
            ],
        })
    );
}

#[test]
fn finds_nothing_once_the_dialog_is_answered() {
    let rule = "─".repeat(100);
    let answered = [
        "⏺ Bash(echo lpm-dialog-test > out.txt)",
        "  ⎿  (No output)",
        "",
        rule.as_str(),
        "❯ ",
        rule.as_str(),
        "  ⏸ manual mode on · ? for shortcuts",
    ];
    assert_eq!(parse(&answered, COLS), None);
}

#[test]
fn ignores_a_numbered_list_in_the_agents_reply() {
    let rule = "─".repeat(100);
    let reply = [
        "⏺ Two ways to do it:",
        "  1. Add an index",
        "  2. Cache the query",
        "",
        "✻ Brewed for 7s",
        rule.as_str(),
        "❯ ",
        rule.as_str(),
    ];
    assert_eq!(parse(&reply, COLS), None);
}

#[test]
fn ignores_options_that_skip_a_number_or_sit_far_above_the_bottom() {
    assert_eq!(parse(&["Pick one?", "❯ 1. Yes", "  3. No"], COLS), None);
    assert_eq!(
        parse(
            &["Pick one?", "❯ 1. Yes", "  2. No", "a", "b", "c", "d"],
            COLS
        ),
        None
    );
}

#[test]
fn fingerprint_follows_the_question_and_choices_not_the_cursor() {
    let bash = parse(CLAUDE_BASH, COLS).unwrap();
    assert_eq!(
        fingerprint(&bash),
        fingerprint(&parse(CLAUDE_BASH, COLS).unwrap())
    );
    assert_ne!(
        fingerprint(&bash),
        fingerprint(&parse(CLAUDE_WRITE, COLS).unwrap())
    );

    let mut moved = bash.clone();
    moved.options[0].selected = false;
    moved.options[1].selected = true;
    assert_eq!(fingerprint(&bash), fingerprint(&moved));
}

#[test]
fn reads_the_dialog_off_a_replayed_screen() {
    let mut output = String::new();
    for i in 0..40 {
        output.push_str(&format!("⏺ earlier line {i}\r\n"));
    }
    output.push_str(&"─".repeat(60));
    output.push_str("\r\n Bash command\r\n   npm run build\r\n Do you want to proceed?\r\n");
    output.push_str(" ❯ 1. Yes\r\n   2. No\r\n\r\n Esc to cancel");
    let rows = screen_rows(&output, 60, 24);
    assert_eq!(rows.len(), 24);
    let dialog = parse(&rows, 60).unwrap();
    assert_eq!(dialog.question, "Do you want to proceed?");
    assert_eq!(dialog.details, ["Bash command", "npm run build"]);
    assert_eq!(labels(&dialog), ["Yes", "No"]);
}

#[test]
fn a_redrawn_dialog_replaces_the_one_under_it() {
    let mut output = String::from(" Pick one?\r\n ❯ 1. Red\r\n   2. Blue");
    output.push_str("\x1b[2A\r\x1b[J Pick a size?\r\n ❯ 1. Small\r\n   2. Large");
    let rows = screen_rows(&output, 40, 6);
    let dialog = parse(&rows, 40).unwrap();
    assert_eq!(dialog.question, "Pick a size?");
    assert_eq!(labels(&dialog), ["Small", "Large"]);
}
