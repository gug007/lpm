use super::*;
use clap::Parser;

#[derive(Parser)]
struct Cli {
    #[command(flatten)]
    fields: JobFields,
}

fn fields(args: &[&str]) -> JobFields {
    Cli::try_parse_from(std::iter::once("t").chain(args.iter().copied()))
        .unwrap()
        .fields
}

fn yaml(map: &Mapping) -> String {
    serde_norway::to_string(map).unwrap()
}

fn applied(start: &str, args: &[&str]) -> Result<String, String> {
    let mut job: Mapping = serde_norway::from_str(start).unwrap();
    fields(args).apply(&mut job)?;
    Ok(yaml(&job))
}

#[test]
fn a_new_entry_reads_like_one_the_app_wrote() {
    let out = applied(
        "{}",
        &[
            "--prompt",
            "Find outdated deps",
            "--agent",
            "claude",
            "--at",
            "09:00",
            "--days",
            "mon,thu",
            "--label",
            "Deps",
            "--check",
            "npm outdated",
            "--duplicate",
            "worktree",
            "--send-to",
            "lpm,telegram",
            "--quiet",
            "--memory",
        ],
    )
    .unwrap();
    assert_eq!(
        out,
        "label: Deps\nschedule:\n  at: 09:00\n  days:\n  - mon\n  - thu\ncheck: npm outdated\nduplicate:\n  mode: worktree\nrun:\n  prompt: Find outdated deps\n  agent: claude\n  quiet: true\n  memory: true\nsendTo:\n- lpm\n- telegram\n"
    );
}

#[test]
fn schedule_flags_replace_the_whole_schedule() {
    let start = "schedule: { at: '09:00', days: [mon] }\nrun: { cmd: x }\n";
    assert_eq!(
        applied(start, &["--every", "6h"]).unwrap(),
        "schedule:\n  every: 6h\nrun:\n  cmd: x\n"
    );
    assert_eq!(
        applied(start, &["--at", "09:00,17:30", "--days", "1,15,last"]).unwrap(),
        "schedule:\n  at:\n  - 09:00\n  - 17:30\n  days:\n  - 1\n  - 15\n  - last\nrun:\n  cmd: x\n"
    );
    assert_eq!(
        applied(start, &["--days", "First Mon", "--at", "10:00"]).unwrap(),
        "schedule:\n  at: 10:00\n  days: first mon\nrun:\n  cmd: x\n"
    );
    assert_eq!(
        applied(start, &["--manual"]).unwrap(),
        "schedule:\n  manual: true\nrun:\n  cmd: x\n"
    );
}

#[test]
fn edits_keep_other_fields_and_their_order() {
    let start = "label: Old\nschedule: { manual: true }\nrun: { prompt: task, agent: codex, model: m }\nsendTo: telegram\n";
    assert_eq!(
        applied(start, &["--model", "", "--effort", "high", "--label", "New", "--send-to", ""]).unwrap(),
        "label: New\nschedule:\n  manual: true\nrun:\n  prompt: task\n  agent: codex\n  effort: high\n"
    );
}

#[test]
fn run_targets_switch_cleanly() {
    let ai = "run: { prompt: task, agent: codex, quiet: true, memory: true }\n";
    assert_eq!(
        applied(ai, &["--cmd", "make"]).unwrap(),
        "run:\n  cmd: make\n"
    );
    assert_eq!(
        applied(ai, &["--action", "deploy"]).unwrap(),
        "run:\n  action: deploy\n"
    );
    let action = "run: { action: agent }\n";
    assert_eq!(
        applied(action, &["--prompt", "go"]).unwrap(),
        "run:\n  action: agent\n  prompt: go\n"
    );
    assert_eq!(
        applied(
            action,
            &["--action", "", "--prompt", "go", "--agent", "claude"]
        )
        .unwrap(),
        "run:\n  prompt: go\n  agent: claude\n"
    );
    assert_eq!(
        applied("run: { cmd: make }\n", &["--prompt", "go"]).unwrap(),
        "run:\n  prompt: go\n"
    );
}

#[test]
fn copy_settings_follow_the_app_shapes() {
    assert_eq!(
        applied("{}", &["--duplicate", "copy"]).unwrap(),
        "duplicate: true\n"
    );
    assert_eq!(
        applied("duplicate: true\n", &["--reinstall-deps"]).unwrap(),
        "duplicate:\n  reinstallDeps: true\n"
    );
    assert_eq!(
        applied(
            "duplicate: { mode: worktree, reinstallDeps: true }\n",
            &["--duplicate", "copy"]
        )
        .unwrap(),
        "duplicate:\n  reinstallDeps: true\n"
    );
    assert_eq!(
        applied("duplicate: true\n", &["--duplicate", "off"]).unwrap(),
        "{}\n"
    );
    assert!(applied("{}", &["--pull-latest", "false"]).is_err());
    assert_eq!(
        applied(
            "duplicate: { pullLatest: false, reinstallDeps: true }\n",
            &["--duplicate", "worktree"]
        )
        .unwrap(),
        "duplicate:\n  reinstallDeps: true\n  mode: worktree\n"
    );
    assert!(applied("{}", &["--duplicate", "worktree", "--pull-latest"]).is_err());
}

#[test]
fn conflicting_flags_are_refused() {
    for args in [
        &["--manual", "--every", "6h"][..],
        &["--cron", "@daily", "--at", "09:00"],
        &["--cmd", "x", "--prompt", "y"],
        &["--cmd", "x", "--agent", "claude"],
    ] {
        assert!(
            Cli::try_parse_from(std::iter::once("t").chain(args.iter().copied())).is_err(),
            "{args:?}"
        );
    }
}

#[test]
fn emptiness_and_targets() {
    assert!(fields(&[]).is_empty());
    assert!(!fields(&["--label", ""]).is_empty());
    assert!(!fields(&["--prompt", " "]).run_target_given());
    assert!(fields(&["--action", "deploy"]).run_target_given());
    assert!(fields(&["--days", "mon"]).schedule_given());
}

#[test]
fn machines_are_a_list_the_app_resolves() {
    assert_eq!(
        applied("{}", &["--machines", "this, Studio,any"]).unwrap(),
        "machines:\n- this\n- Studio\n- any\n"
    );
    assert_eq!(
        applied("machines: [abc]\n", &["--machines", ""]).unwrap(),
        "machines: []\n"
    );
    assert!(!fields(&["--machines", "any"]).is_empty());
}

#[test]
fn claude_account_names_one_the_main_login_or_the_projects() {
    let ai = "run: { prompt: task }\n";
    assert_eq!(
        applied(ai, &["--claude-account", "work"]).unwrap(),
        "run:\n  prompt: task\n  claudeAccount: work\n"
    );
    assert_eq!(
        applied(ai, &["--claude-account", "default"]).unwrap(),
        "run:\n  prompt: task\n  claudeAccount: ''\n"
    );
    let pinned = "run: { prompt: task, claudeAccount: work }\n";
    assert_eq!(
        applied(pinned, &["--claude-account", ""]).unwrap(),
        "run:\n  prompt: task\n"
    );
    assert_eq!(
        applied(pinned, &["--action", "deploy"]).unwrap(),
        "run:\n  action: deploy\n"
    );
    assert!(!fields(&["--claude-account", "work"]).is_empty());
}

#[test]
fn on_answer_sits_with_the_other_steps_and_an_empty_one_removes_it() {
    let out = applied("{}", &["--cmd", "tg-draft-all", "--every", "5m", "--on-answer", "tg-send"]).unwrap();
    assert_eq!(
        out,
        "schedule:\n  every: 5m\nonAnswer: tg-send\nrun:\n  cmd: tg-draft-all\n"
    );
    let start = "onAnswer: tg-send\nrun: { cmd: x }\n";
    assert_eq!(applied(start, &["--on-answer", ""]).unwrap(), "run:\n  cmd: x\n");
    assert!(!fields(&["--on-answer", "x"]).is_empty());
}
