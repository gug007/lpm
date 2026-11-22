use super::*;
use crate::githook_text::{clean, summarize};

fn event(sid: &str, body: &str) -> String {
    format!(r#"{{"event":{body},"sid":"{sid}","thread":"main","time":"2026-11-22T10:00:00Z"}}"#)
}

#[test]
fn names_the_hook_that_exited_with_an_error() {
    let trace = [
        event("root", r#""version","evt":"3","exe":"2.47.0""#),
        event("root", r#""child_start","child_id":0,"child_class":"hook","hook_name":"pre-commit","argv":[".husky/_/pre-commit"]"#),
        event("root/nested", r#""child_start","child_id":0,"child_class":"hook","hook_name":"post-checkout","argv":["x"]"#),
        event("root/nested", r#""child_exit","child_id":0,"pid":9,"code":1"#),
        event("root", r#""child_exit","child_id":0,"pid":8,"code":1"#),
    ]
    .join("\n");
    assert_eq!(failed_hook(&trace).as_deref(), Some("pre-commit"));
}

#[test]
fn a_hook_that_passed_or_another_process_failing_is_no_hook_failure() {
    let trace = [
        event("root", r#""version","evt":"3","exe":"2.47.0""#),
        event("root", r#""child_start","child_id":0,"child_class":"hook","hook_name":"pre-commit","argv":["h"]"#),
        event("root", r#""child_exit","child_id":0,"pid":8,"code":0"#),
        event("root", r#""child_start","child_id":1,"child_class":"gpg","argv":["gpg"]"#),
        event("root", r#""child_exit","child_id":1,"pid":9,"code":2"#),
        event("root/x", r#""child_start","child_id":0,"child_class":"hook","hook_name":"pre-commit","argv":["h"]"#),
        event("root/x", r#""child_exit","child_id":0,"pid":10,"code":1"#),
    ]
    .join("\n");
    assert_eq!(failed_hook(&trace), None);
    assert_eq!(failed_hook(""), None);
    assert_eq!(failed_hook("not json\n{\"broken\""), None);
}

#[test]
fn falls_back_to_the_hook_file_name() {
    let trace = [
        event("r", r#""child_start","child_id":3,"child_class":"hook","argv":["/repo/.git/hooks/commit-msg",".git/COMMIT_EDITMSG"]"#),
        event("r", r#""child_exit","child_id":3,"pid":8,"code":1"#),
    ]
    .join("\n");
    assert_eq!(failed_hook(&trace).as_deref(), Some("commit-msg"));
}

#[test]
fn cleans_colours_spinners_and_blank_runs() {
    let raw = "\u{1b}[33m⠋ Running\r\u{1b}[31m✖ eslint --fix\u{1b}[39m\n\n\n\nsrc/a.ts\u{1b}]8;;file:///a\u{7}\n  1:1  error  x  rule  \n\n";
    assert_eq!(clean(raw), "✖ eslint --fix\n\nsrc/a.ts\n  1:1  error  x  rule");
}

#[test]
fn keeps_the_end_of_long_output() {
    let raw: String = (1..=450).map(|n| format!("line {n}\n")).collect();
    let out = clean(&raw);
    assert!(out.starts_with("… 50 earlier lines\nline 51\n"));
    assert!(out.ends_with("line 450"));
}

const LINT_STAGED: &str = "[STARTED] Running tasks for staged files...
[STARTED] *.ts — 1 file
[STARTED] eslint --fix
[FAILED] eslint --fix [FAILED]
[FAILED] *.ts — 1 file
✖ eslint --fix:

/repo/src/billing.ts
  14:7  error  'total' is never reassigned. Use 'const' instead  prefer-const
  31:3  error  Unexpected console statement                       no-console
  40:1  error  Missing return type                                 ts/explicit
✖ 3 problems (3 errors, 0 warnings)

husky - pre-commit script failed (code 1)";

#[test]
fn summarizes_lint_staged_running_eslint() {
    assert_eq!(
        summarize(&clean(LINT_STAGED), "/repo").as_deref(),
        Some("eslint · 3 errors in src/billing.ts")
    );
}

#[test]
fn summarizes_the_pre_commit_framework() {
    let out = "trim trailing whitespace.................................................Failed
- hook id: trailing-whitespace
- exit code: 1
- files were modified by this hook

Fixing src/app.py

check yaml...............................................................Passed
ruff.....................................................................Failed
- hook id: ruff
src/app.py:3:1: F401 [*] `os` imported but unused
src/util.py:9:5: F841 Local variable `x` is assigned to but never used
Found 2 errors.";
    assert_eq!(
        summarize(out, "/repo").as_deref(),
        Some("trim trailing whitespace, ruff · 2 errors in 2 files")
    );
}

#[test]
fn summarizes_tsc() {
    let out = "src/index.ts(4,7): error TS2322: Type 'string' is not assignable to type 'number'.
src/index.ts(9,1): error TS2304: Cannot find name 'foo'.

Found 2 errors in the same file, starting at: src/index.ts:4";
    assert_eq!(summarize(out, "/repo").as_deref(), Some("2 errors in src/index.ts"));
}

#[test]
fn falls_back_to_the_first_error_line() {
    let out = "husky - commit-msg script failed (code 1)\nRunning commitlint\n⧗   input: wip\n✖   subject may not be empty [subject-empty]\n";
    assert_eq!(
        summarize(out, "/repo").as_deref(),
        Some("✖   subject may not be empty [subject-empty]")
    );
    assert_eq!(summarize("all good, nothing to see", "/repo"), None);
}

#[test]
fn the_message_leads_with_the_hook_and_summary() {
    let failure = HookFailure {
        hook: "pre-commit".into(),
        summary: Some("eslint · 3 errors in src/billing.ts".into()),
        output: "a\nb".into(),
        changed: vec![],
    };
    assert_eq!(
        failure.message(),
        "The pre-commit hook stopped this commit: eslint · 3 errors in src/billing.ts\n\na\nb"
    );
}

#[cfg(unix)]
mod real_git {
    use super::super::*;
    use crate::git::git_out;
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    fn repo(hook: &str, script: &str) -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        let hooks = dir.path().join("hooks");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&hooks).unwrap();
        let cwd = root.to_string_lossy().into_owned();
        git_out(&cwd, &["init", "-q"]).unwrap();
        git_out(&cwd, &["config", "user.email", "t@example.com"]).unwrap();
        git_out(&cwd, &["config", "user.name", "T"]).unwrap();
        git_out(&cwd, &["config", "commit.gpgsign", "false"]).unwrap();
        git_out(&cwd, &["config", "core.hooksPath", &hooks.to_string_lossy()]).unwrap();
        let path = hooks.join(hook);
        std::fs::write(&path, script).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(root.join("a.txt"), "one\n").unwrap();
        (dir, cwd)
    }

    fn files() -> Vec<String> {
        vec!["a.txt".to_string()]
    }

    #[test]
    fn a_failing_pre_commit_hook_is_reported_as_one() {
        let (_dir, cwd) = repo(
            "pre-commit",
            "#!/bin/sh\necho 'src/a.ts:1:1: error boom' >&2\ngit status --short >/dev/null\nexit 1\n",
        );
        match crate::git::commit_files(&cwd, "add a", &files(), false) {
            Err(Stopped::Hook(failure)) => {
                assert_eq!(failure.hook, "pre-commit");
                assert!(failure.output.contains("error boom"), "{}", failure.output);
                assert_eq!(failure.summary.as_deref(), Some("problems in src/a.ts"));
                assert!(failure.changed.is_empty());
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert!(git_out(&cwd, &["rev-parse", "--verify", "-q", "HEAD"]).is_err());
    }

    #[test]
    fn skipping_hooks_commits() {
        let (_dir, cwd) = repo("pre-commit", "#!/bin/sh\nexit 1\n");
        crate::git::commit_files(&cwd, "add a", &files(), true).unwrap();
        assert_eq!(git_out(&cwd, &["log", "-1", "--format=%s"]).unwrap(), "add a");
    }

    #[test]
    fn names_the_files_a_formatter_hook_rewrote() {
        let (_dir, cwd) = repo("pre-commit", "#!/bin/sh\nprintf 'formatted\\n' > a.txt\nexit 1\n");
        match crate::git::commit_files(&cwd, "add a", &files(), false) {
            Err(Stopped::Hook(failure)) => assert_eq!(failure.changed, files()),
            other => panic!("expected a hook failure, got {other:?}"),
        }
        crate::git::commit_files(&cwd, "add a", &files(), true).unwrap();
        assert_eq!(std::fs::read_to_string(Path::new(&cwd).join("a.txt")).unwrap(), "formatted\n");
        assert_eq!(git_out(&cwd, &["show", "HEAD:a.txt"]).unwrap(), "formatted");
    }

    #[test]
    fn a_commit_msg_hook_and_the_plain_error_say_so() {
        let (_dir, cwd) = repo("commit-msg", "#!/bin/sh\necho 'subject must be lower case' >&2\nexit 1\n");
        let message = crate::git::git_commit(cwd.clone(), "Add A".into(), files()).unwrap_err();
        assert!(
            message.starts_with("The commit-msg hook stopped this commit"),
            "{message}"
        );
        assert!(message.ends_with("subject must be lower case"), "{message}");
    }

    #[test]
    fn other_failures_stay_plain_errors() {
        let (_dir, cwd) = repo("pre-commit", "#!/bin/sh\nexit 0\n");
        match crate::git::commit_files(&cwd, "add", &["missing.txt".to_string()], false) {
            Err(Stopped::Other(_)) => {}
            other => panic!("expected a plain error, got {other:?}"),
        }
    }
}
