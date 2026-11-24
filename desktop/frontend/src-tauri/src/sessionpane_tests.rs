use super::*;
use std::time::{Duration, Instant};

/// Closed even when the test fails, so its shell never outlives it.
struct Open(Arc<Pane>);

impl Drop for Open {
    fn drop(&mut self) {
        self.0.close();
    }
}

fn open(command: &str) -> Open {
    let spec = PaneSpec {
        service: "web".into(),
        command: command.into(),
        dir: ".".into(),
    };
    Open(Pane::open("%0".into(), &spec).unwrap())
}

fn ends_with(pane: &Pane, code: i32) -> i64 {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if let (true, Some(got), started) = pane.outcome() {
            assert_eq!(got, code);
            return started;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    panic!("the line never ended");
}

/// zsh and bash report each finished line (panehook.rs); other shells don't.
fn shell_reports_prompts() -> bool {
    let shell = crate::sys::login_shell();
    matches!(crate::shellwrap::shell_name(&shell), "zsh" | "bash")
}

#[test]
fn each_run_of_a_pane_starts_at_its_own_time() {
    if !shell_reports_prompts() {
        return;
    }
    let pane = open("sh -c 'exit 7'");
    let first = ends_with(&pane.0, 7);
    assert!(first > 0);
    assert_eq!(pane.0.outcome(), (true, Some(7), first));

    std::thread::sleep(Duration::from_millis(5));
    pane.0.send("sh -c 'sleep 1; exit 7'").unwrap();
    let (ended, code, second) = pane.0.outcome();
    assert_eq!((ended, code), (false, None));
    assert!(second > first);
    assert_eq!(ends_with(&pane.0, 7), second, "ending leaves its start as it was");
}

#[test]
fn a_stop_and_a_shell_that_goes_keep_the_runs_start() {
    if !shell_reports_prompts() {
        return;
    }
    let pane = open("sh -c 'exit 7'");
    let started = ends_with(&pane.0, 7);
    pane.0.interrupt().unwrap();
    assert_eq!(pane.0.outcome(), (true, Some(7), started));
    pane.0.close();
    let deadline = Instant::now() + Duration::from_secs(15);
    while pane.0.alive() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    let (ended, _, after) = pane.0.outcome();
    assert!(ended);
    assert_eq!(after, started);
}

#[test]
fn a_pane_nothing_ran_in_has_no_start() {
    let pane = open("");
    assert_eq!(pane.0.outcome(), (true, None, 0));
}
