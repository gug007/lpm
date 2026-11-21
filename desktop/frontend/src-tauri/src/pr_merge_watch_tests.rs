use super::*;
use crate::pull_request::{MergeReadiness, PrCheck};

fn check(name: &str, state: &'static str) -> PrCheck {
    PrCheck {
        name: name.into(),
        workflow: "CI".into(),
        state,
        url: String::new(),
        commit: None,
    }
}

fn pr(state: &str, review: &str, checks: Vec<PrCheck>) -> PullRequestInfo {
    PullRequestInfo {
        number: 174,
        state: "OPEN".into(),
        checks,
        merge: MergeReadiness {
            mergeable: "MERGEABLE".into(),
            state: state.into(),
            review: review.into(),
            head: "9e7d031".into(),
            base: "main".into(),
        },
        ..Default::default()
    }
}

fn watch(bypass: bool) -> MergeWatch {
    MergeWatch {
        path: "/p".into(),
        number: 174,
        title: "Add merging".into(),
        method: "squash".into(),
        delete_branch: true,
        bypass,
        state: "waiting",
        reason: None,
        deleted_branch: false,
    }
}

const SOON: Duration = Duration::from_secs(60);

#[test]
fn waits_while_a_check_runs_then_merges_what_passed() {
    let running = pr(
        "BLOCKED",
        "",
        vec![check("test", "pass"), check("smoke", "pending")],
    );
    assert_eq!(decide(&running, &watch(false), SOON), Next::Wait);
    let green = pr(
        "CLEAN",
        "",
        vec![check("test", "pass"), check("smoke", "pass")],
    );
    assert_eq!(
        decide(&green, &watch(false), SOON),
        Next::Merge {
            head: "9e7d031".into(),
            bypass: false
        }
    );
}

#[test]
fn bypasses_rules_only_when_armed_to() {
    let held = pr("BLOCKED", "", vec![check("test", "pass")]);
    assert_eq!(
        decide(&held, &watch(true), SOON),
        Next::Merge {
            head: "9e7d031".into(),
            bypass: true
        }
    );
    assert_eq!(
        decide(&held, &watch(false), SOON),
        Next::Stop("The rules on main don't allow merging yet.".into())
    );
    let review = pr("BLOCKED", "REVIEW_REQUIRED", vec![check("test", "pass")]);
    assert_eq!(
        decide(&review, &watch(true), SOON),
        Next::Stop("A review is required before merging.".into())
    );
}

#[test]
fn a_failing_check_or_conflict_stops_without_merging() {
    let failed = pr(
        "BLOCKED",
        "",
        vec![check("smoke", "fail"), check("test", "pending")],
    );
    assert_eq!(
        decide(&failed, &watch(true), SOON),
        Next::Stop("smoke failed.".into())
    );
    let mut conflicted = pr("DIRTY", "", vec![check("test", "pass")]);
    conflicted.merge.mergeable = "CONFLICTING".into();
    assert_eq!(
        decide(&conflicted, &watch(true), SOON),
        Next::Stop("It conflicts with main.".into())
    );
}

#[test]
fn follows_the_pull_request_ending_elsewhere() {
    let mut merged = pr("CLEAN", "", vec![]);
    merged.state = "MERGED".into();
    assert_eq!(decide(&merged, &watch(false), SOON), Next::Merged);
    let mut other = pr("CLEAN", "", vec![]);
    other.number = 175;
    assert!(matches!(decide(&other, &watch(false), SOON), Next::Stop(_)));
}

#[test]
fn keeps_asking_while_github_works_it_out_then_gives_up() {
    let unknown = pr("UNKNOWN", "", vec![check("test", "pass")]);
    assert_eq!(decide(&unknown, &watch(false), SOON), Next::Wait);
    let stuck = pr("BLOCKED", "", vec![check("smoke", "pending")]);
    assert!(matches!(
        decide(&stuck, &watch(false), GIVE_UP_AFTER),
        Next::Stop(_)
    ));
}

#[test]
fn the_banner_says_what_happened() {
    let merged = MergeWatch {
        state: "merged",
        ..watch(false)
    };
    assert_eq!(banner_text(&merged).0, "Merged #174");
    let stopped = MergeWatch {
        state: "stopped",
        reason: Some("smoke failed.".into()),
        ..watch(false)
    };
    assert_eq!(
        banner_text(&stopped),
        (
            "Stopped waiting to merge #174".into(),
            "smoke failed.".into()
        )
    );
}
