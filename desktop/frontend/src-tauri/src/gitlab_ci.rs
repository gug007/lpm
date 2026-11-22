// GitLab CI read through `glab api`, as lpm shows GitHub's checks: a pipeline's
// jobs become the checks (the stage stands where GitHub's workflow does), a
// branch without a merge request shows its last pushed commit's pipeline, a
// failed job runs again, and the phone reads the end of its log.
use crate::ci_checks::CommitChecksInfo;
use crate::githost::{glab_api, GitLabRepo};
use crate::pull_request::PrCheck;
use crate::remote::check_log::{noise, FailedLog, TAIL};
use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Deserialize, Default)]
#[serde(default)]
struct Job {
    name: String,
    stage: String,
    status: String,
    web_url: String,
    allow_failure: bool,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Pipeline {
    id: u64,
    sha: String,
    web_url: String,
}

/// A job's status in the words lpm's checks use. A job allowed to fail doesn't
/// fail the pipeline, so it counts as GitHub's neutral.
fn job_state(status: &str, allow_failure: bool) -> &'static str {
    match status {
        "success" => "pass",
        "failed" if allow_failure => "skipped",
        "failed" => "fail",
        "canceled" | "canceling" | "skipped" | "manual" => "skipped",
        _ => "pending",
    }
}

fn checks_from_jobs(json: &str) -> Vec<PrCheck> {
    let jobs: Vec<Job> = serde_json::from_str(json).unwrap_or_default();
    jobs.into_iter()
        .filter(|job| !job.name.is_empty())
        .map(|job| PrCheck {
            state: job_state(&job.status, job.allow_failure),
            name: job.name,
            workflow: job.stage,
            url: job.web_url,
            commit: None,
        })
        .collect()
}

/// The jobs of pipeline `id`, newest attempt of each, as checks.
pub(crate) fn pipeline_checks(cwd: &str, repo: &GitLabRepo, id: u64) -> Vec<PrCheck> {
    let endpoint = format!(
        "projects/{}/pipelines/{id}/jobs?per_page=100",
        repo.api_project()
    );
    glab_api(cwd, repo, &endpoint, &[])
        .map(|json| checks_from_jobs(&json))
        .unwrap_or_default()
}

/// The pipeline GitLab ran on `sha` for `branch`, as the one pushed commit
/// `ci_checks` asks about. Empty when there's none.
pub(crate) fn commit_pipelines(
    cwd: &str,
    repo: &GitLabRepo,
    sha: &str,
    branch: &str,
) -> Result<Vec<CommitChecksInfo>, String> {
    let endpoint = format!(
        "projects/{}/pipelines?ref={}&sha={sha}&per_page=1",
        repo.api_project(),
        urlencoding::encode(branch)
    );
    let json = glab_api(cwd, repo, &endpoint, &[])?;
    let pipelines: Vec<Pipeline> = serde_json::from_str(&json).unwrap_or_default();
    let Some(pipeline) = pipelines.into_iter().next() else {
        return Ok(Vec::new());
    };
    let title =
        crate::git::git_out(cwd, &["log", "-1", "--format=%s", &pipeline.sha]).unwrap_or_default();
    Ok(vec![CommitChecksInfo {
        checks: pipeline_checks(cwd, repo, pipeline.id),
        sha: pipeline.sha,
        title,
        url: pipeline.web_url,
        fix_prompt: None,
    }])
}

/// The digits after `/-/jobs/` in a GitLab job URL.
pub(crate) fn job_id(url: &str) -> Option<&str> {
    crate::ci_prompt::id_after(url, "/-/jobs/")
}

/// Runs each failed job again.
pub(crate) fn retry_jobs(cwd: &str, repo: &GitLabRepo, ids: &[&String]) -> Result<(), String> {
    for id in ids {
        let endpoint = format!("projects/{}/jobs/{id}/retry", repo.api_project());
        glab_api(cwd, repo, &endpoint, &["-X", "POST"])?;
    }
    Ok(())
}

/// The step that failed and the last lines a GitLab job printed, for the
/// phone's `gitCheckLog`; None when `url` isn't a GitLab job of `root`'s.
pub(crate) fn failed_log(root: &str, url: &str) -> Option<Result<FailedLog, String>> {
    let id = job_id(url)?;
    let repo = crate::githost::gitlab(root)?;
    let endpoint = format!("projects/{}/jobs/{id}/trace", repo.api_project());
    Some(glab_api(root, &repo, &endpoint, &[]).and_then(|text| {
        tail(&text)
            .ok_or_else(|| "GitLab has no log for this job yet. It may still be running.".into())
    }))
}

fn section() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"section_(start|end):\d+:([A-Za-z0-9_.-]+)(\[[^\]]*\])?")
            .expect("section pattern compiles")
    })
}

/// A job log's last section and its last lines. GitLab marks each section
/// (`section_start:…:step_script`); the last one opened is where it stopped.
/// A log runs to megabytes, so only marker lines and the tail are cleaned.
fn tail(text: &str) -> Option<FailedLog> {
    let step = text
        .lines()
        .filter(|line| line.contains("section_"))
        .filter_map(|line| section().captures_iter(line).last())
        .filter(|found| &found[1] == "start")
        .last()
        .map(|found| found[2].replace('_', " "))
        .unwrap_or_default();
    let mut lines = Vec::new();
    for raw in text.lines().rev() {
        let line = noise()
            .replace_all(&section().replace_all(raw, ""), "")
            .into_owned();
        if lines.is_empty() && line.trim().is_empty() {
            continue;
        }
        lines.push(line);
        if lines.len() > TAIL {
            break;
        }
    }
    if lines.is_empty() {
        return None;
    }
    let more = lines.len() > TAIL;
    lines.truncate(TAIL);
    lines.reverse();
    Some(FailedLog { step, lines, more })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jobs_become_checks_with_the_stage_as_workflow() {
        let json = r#"[
            {"id":21,"name":"rspec","stage":"test","status":"failed","allow_failure":false,"web_url":"https://gitlab.com/t/a/-/jobs/21"},
            {"id":22,"name":"lint","stage":"test","status":"running","web_url":"https://gitlab.com/t/a/-/jobs/22"},
            {"id":23,"name":"build","stage":"build","status":"success","web_url":"https://gitlab.com/t/a/-/jobs/23"},
            {"id":24,"name":"audit","stage":"test","status":"failed","allow_failure":true,"web_url":""},
            {"id":25,"name":"deploy","stage":"deploy","status":"manual","web_url":""},
            {"id":26,"name":"e2e","stage":"test","status":"pending","web_url":""}
        ]"#;
        let checks = checks_from_jobs(json);
        let states: Vec<(&str, &str, &str)> = checks
            .iter()
            .map(|c| (c.name.as_str(), c.workflow.as_str(), c.state))
            .collect();
        assert_eq!(
            states,
            vec![
                ("rspec", "test", "fail"),
                ("lint", "test", "pending"),
                ("build", "build", "pass"),
                ("audit", "test", "skipped"),
                ("deploy", "deploy", "skipped"),
                ("e2e", "test", "pending"),
            ]
        );
        assert_eq!(checks[0].url, "https://gitlab.com/t/a/-/jobs/21");
        assert!(checks_from_jobs("not json").is_empty());
    }

    #[test]
    fn reads_the_job_id_from_its_url() {
        assert_eq!(job_id("https://gitlab.com/t/a/-/jobs/4821"), Some("4821"));
        assert_eq!(
            job_id("https://gitlab.com/t/a/-/jobs/4821/raw"),
            Some("4821")
        );
        assert_eq!(job_id("https://github.com/o/r/actions/runs/1/job/2"), None);
    }

    #[test]
    fn the_log_tail_names_the_section_it_stopped_in() {
        let text = "\x1b[0KRunning with gitlab-runner\nsection_start:1700000000:prepare_script\r\x1b[0KPreparing\nsection_end:1700000001:prepare_script\r\x1b[0K\nsection_start:1700000002:step_script\r\x1b[0K$ bundle exec rspec\n\x1b[31mFailure: expected 2, got 3\x1b[0m\nERROR: Job failed: exit code 1\n\n";
        let log = tail(text).unwrap();
        assert_eq!(log.step, "step script");
        assert_eq!(log.lines.last().unwrap(), "ERROR: Job failed: exit code 1");
        assert!(log.lines.contains(&"Failure: expected 2, got 3".to_string()));
        assert!(!log.more);
        assert!(tail("\n\n").is_none());
    }
}
