// What an agent is told when asked to fix failing CI, from the desktop's checks
// menus, its CI toast and the phones alike: which checks fail and where, and
// the `gh` commands that print why.
use crate::pull_request::PrCheck;

/// The digits after `/actions/runs/` in a GitHub Actions job URL.
pub(crate) fn run_id(url: &str) -> Option<&str> {
    let rest = url.split("/actions/runs/").nth(1)?;
    let id = rest.split(|c: char| !c.is_ascii_digit()).next()?;
    (!id.is_empty()).then_some(id)
}

/// The failing checks, by name, as the menus list them.
fn failing(checks: &[PrCheck]) -> Vec<&PrCheck> {
    let mut failing: Vec<&PrCheck> = checks.iter().filter(|c| c.state == "fail").collect();
    failing.sort_by_key(|c| c.name.to_lowercase());
    failing
}

fn prompt(
    intro: String,
    checks: &[PrCheck],
    line: impl Fn(&PrCheck) -> String,
    read_first: Option<String>,
) -> Option<String> {
    let failing = failing(checks);
    if failing.is_empty() {
        return None;
    }
    let mut runs: Vec<&str> = Vec::new();
    for id in failing.iter().filter_map(|c| run_id(&c.url)) {
        if !runs.contains(&id) {
            runs.push(id);
        }
    }
    let how: Vec<String> = read_first
        .into_iter()
        .chain(
            runs.iter()
                .map(|id| format!("`gh run view {id} --log-failed`")),
        )
        .collect();
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

fn link(url: &str) -> String {
    if url.is_empty() {
        String::new()
    } else {
        format!(" — {url}")
    }
}

/// For a pull request's failing checks; None while nothing fails.
pub(crate) fn for_pull_request(number: u64, url: &str, checks: &[PrCheck]) -> Option<String> {
    prompt(
        format!("CI checks are failing on pull request #{number} ({url}):"),
        checks,
        |c| format!("- {}{}", c.name, link(&c.url)),
        Some(format!("`gh pr checks {number}`")),
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
    let at = if url.is_empty() {
        String::new()
    } else {
        format!(" ({url})")
    };
    prompt(
        format!(
            "CI checks are failing on {branch}, whose last pushed commit is {} \"{title}\"{at}:",
            crate::ci_checks::short_sha(sha)
        ),
        checks,
        |c| {
            let workflow = if c.workflow.is_empty() {
                String::new()
            } else {
                format!("{} › ", c.workflow)
            };
            let on = c
                .commit
                .as_deref()
                .map(|sha| format!(" (on {sha})"))
                .unwrap_or_default();
            format!("- {workflow}{}{on}{}", c.name, link(&c.url))
        },
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
