// What an agent is told when asked to fix failing CI, from the desktop's checks
// menus, its CI toast and the phones alike: which checks fail and where, and
// the `gh` (or `glab`) commands that print why.
use crate::pull_request::PrCheck;

/// The digits after `marker` in a CI job URL.
pub(crate) fn id_after<'a>(url: &'a str, marker: &str) -> Option<&'a str> {
    let rest = url.split(marker).nth(1)?;
    let id = rest.split(|c: char| !c.is_ascii_digit()).next()?;
    (!id.is_empty()).then_some(id)
}

/// The digits after `/actions/runs/` in a GitHub Actions job URL.
pub(crate) fn run_id(url: &str) -> Option<&str> {
    id_after(url, "/actions/runs/")
}

fn gh_log(url: &str) -> Option<String> {
    run_id(url).map(|id| format!("`gh run view {id} --log-failed`"))
}

/// The failing checks, by name, as the menus list them.
fn failing(checks: &[PrCheck]) -> Vec<&PrCheck> {
    let mut failing: Vec<&PrCheck> = checks.iter().filter(|c| c.state == "fail").collect();
    failing.sort_by_key(|c| c.name.to_lowercase());
    failing
}

/// `intro`, a `line` per failing check, then how to find out why: `read_first`,
/// then each distinct `log` command the failing checks name.
pub(crate) fn prompt(
    intro: String,
    checks: &[PrCheck],
    line: impl Fn(&PrCheck) -> String,
    read_first: Option<String>,
    log: impl Fn(&str) -> Option<String>,
) -> Option<String> {
    let failing = failing(checks);
    if failing.is_empty() {
        return None;
    }
    let mut how: Vec<String> = read_first.into_iter().collect();
    for command in failing.iter().filter_map(|c| log(&c.url)) {
        if !how.contains(&command) {
            how.push(command);
        }
    }
    let find = if how.is_empty() {
        "Find out why from the links above".to_string()
    } else {
        format!("Find out why with {}", how.join(" and "))
    };
    let mut lines = vec![intro];
    lines.extend(failing.iter().map(|c| line(c)));
    lines.push(String::new());
    lines.push(format!(
        "{find}, fix the cause, and run the same checks locally where you can to confirm the fix."
    ));
    Some(lines.join("\n"))
}

pub(crate) fn link(url: &str) -> String {
    if url.is_empty() {
        String::new()
    } else {
        format!(" — {url}")
    }
}

fn at(url: &str) -> String {
    if url.is_empty() {
        String::new()
    } else {
        format!(" ({url})")
    }
}

/// `- workflow › name`, as the menus list a check.
pub(crate) fn workflow_name(check: &PrCheck) -> String {
    if check.workflow.is_empty() {
        check.name.clone()
    } else {
        format!("{} › {}", check.workflow, check.name)
    }
}

/// For a pull request's failing checks; None while nothing fails.
pub(crate) fn for_pull_request(number: u64, url: &str, checks: &[PrCheck]) -> Option<String> {
    prompt(
        format!("CI checks are failing on pull request #{number} ({url}):"),
        checks,
        |c| format!("- {}{}", c.name, link(&c.url)),
        Some(format!("`gh pr checks {number}`")),
        gh_log,
    )
}

/// For a pull request GitHub can't merge because it conflicts with its base.
pub(crate) fn for_conflicts(number: u64, url: &str, base: &str) -> String {
    conflicts(
        &format!("Pull request #{number}"),
        url,
        "base",
        base,
        format!("its base branch (`gh pr view {number} --json baseRefName` names it)"),
    )
}

/// `what` (at `url`) conflicts with its `side` branch: merge in `base`, else
/// `unknown_base` when the branch isn't known.
pub(crate) fn conflicts(
    what: &str,
    url: &str,
    side: &str,
    base: &str,
    unknown_base: String,
) -> String {
    let base = if base.is_empty() {
        unknown_base
    } else {
        format!("origin/{base}")
    };
    format!(
        "{what}{} has conflicts with its {side} branch, so it can't be merged.\n\n\
         Fetch, merge {base} into this branch, resolve every conflict, run the tests, \
         then commit the merge and push.",
        at(url)
    )
}

/// For a branch without one, naming the commit each failure is on.
pub(crate) fn for_branch(
    branch: &str,
    sha: &str,
    title: &str,
    url: &str,
    checks: &[PrCheck],
) -> Option<String> {
    prompt(
        format!(
            "CI checks are failing on {branch}, whose last pushed commit is {} \"{title}\"{}:",
            crate::ci_checks::short_sha(sha),
            at(url)
        ),
        checks,
        |c| {
            let on = c
                .commit
                .as_deref()
                .map(|sha| format!(" (on {sha})"))
                .unwrap_or_default();
            format!("- {}{on}{}", workflow_name(c), link(&c.url))
        },
        None,
        gh_log,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_conflicted_pull_request_names_what_to_merge_in() {
        assert_eq!(
            for_conflicts(42, "https://github.com/o/r/pull/42", "main"),
            "Pull request #42 (https://github.com/o/r/pull/42) has conflicts with its base branch, so it can't be merged.\n\n\
             Fetch, merge origin/main into this branch, resolve every conflict, run the tests, then commit the merge and push."
        );
        assert!(for_conflicts(7, "", "").contains("`gh pr view 7 --json baseRefName`"));
    }

    fn check(
        name: &str,
        workflow: &str,
        state: &'static str,
        url: &str,
        commit: Option<&str>,
    ) -> PrCheck {
        PrCheck {
            name: name.into(),
            workflow: workflow.into(),
            state,
            url: url.into(),
            commit: commit.map(str::to_string),
        }
    }

    #[test]
    fn the_branch_prompt_names_each_failure_and_where_it_ran() {
        let checks = vec![
            check(
                "check",
                "Linux host",
                "fail",
                "https://github.com/o/r/actions/runs/41/job/1",
                Some("7e1f279"),
            ),
            check(
                "lint",
                "Linux host",
                "pass",
                "https://github.com/o/r/actions/runs/41/job/1",
                None,
            ),
            check("Vercel", "CI", "fail", "", None),
        ];
        assert_eq!(
            for_branch(
                "main",
                "fcb454fef20f91bd85895fc7201d835fc549972b",
                "feat(cli): add remote command execution",
                "https://github.com/o/r/commit/fcb454f",
                &checks,
            )
            .unwrap(),
            [
                "CI checks are failing on main, whose last pushed commit is fcb454f \"feat(cli): add remote command execution\" (https://github.com/o/r/commit/fcb454f):",
                "- Linux host › check (on 7e1f279) — https://github.com/o/r/actions/runs/41/job/1",
                "- CI › Vercel",
                "",
                "Find out why with `gh run view 41 --log-failed`, fix the cause, and run the same checks locally where you can to confirm the fix.",
            ]
            .join("\n")
        );
    }

    #[test]
    fn the_pr_prompt_reads_the_pr_checks_first_then_each_run_once() {
        let checks = vec![
            check(
                "test (ubuntu)",
                "CI",
                "fail",
                "https://github.com/o/r/actions/runs/11/job/21",
                None,
            ),
            check(
                "test (macos)",
                "CI",
                "fail",
                "https://github.com/o/r/actions/runs/11/job/22",
                None,
            ),
            check("Vercel", "CI", "fail", "", None),
            check(
                "lint",
                "CI",
                "pass",
                "https://github.com/o/r/actions/runs/11/job/23",
                None,
            ),
        ];
        assert_eq!(
            for_pull_request(142, "https://github.com/o/r/pull/142", &checks).unwrap(),
            [
                "CI checks are failing on pull request #142 (https://github.com/o/r/pull/142):",
                "- test (macos) — https://github.com/o/r/actions/runs/11/job/22",
                "- test (ubuntu) — https://github.com/o/r/actions/runs/11/job/21",
                "- Vercel",
                "",
                "Find out why with `gh pr checks 142` and `gh run view 11 --log-failed`, fix the cause, and run the same checks locally where you can to confirm the fix.",
            ]
            .join("\n")
        );
    }

    #[test]
    fn nothing_failing_has_no_prompt() {
        assert_eq!(
            for_pull_request(1, "u", &[check("lint", "CI", "pass", "", None)]),
            None
        );
        assert_eq!(run_id("https://vercel.com/x"), None);
        assert_eq!(
            run_id("https://github.com/o/r/actions/runs/40115672821/job/1"),
            Some("40115672821")
        );
    }
}
