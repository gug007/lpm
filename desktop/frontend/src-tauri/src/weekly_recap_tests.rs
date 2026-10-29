use super::*;
use crate::agent_activity::DayActivity;

fn monday() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()
}

fn day(agent_ms: i64, prompts: u64, project: &str, thread: &str) -> DayActivity {
    DayActivity {
        agent_ms,
        prompts,
        projects: HashMap::from([(project.to_string(), agent_ms)]),
        agents: HashMap::from([("claude", agent_ms)]),
        threads: HashSet::from([thread.to_string()]),
    }
}

fn commit(sha: &str, added: u64, removed: u64) -> RecapCommit {
    RecapCommit {
        sha: sha.into(),
        added,
        removed,
    }
}

#[test]
fn sums_the_week_and_the_one_before_it() {
    let activity = Activity::from([
        ("2026-10-12".to_string(), day(5_000, 9, "old", "x")),
        ("2026-10-18".to_string(), day(1_000, 1, "old", "x")),
        ("2026-10-19".to_string(), day(3_000, 2, "app", "a")),
        ("2026-10-21".to_string(), day(6_000, 4, "api", "a")),
        ("2026-10-25".to_string(), day(1_000, 1, "app", "b")),
        ("2026-10-26".to_string(), day(9_000, 9, "next", "c")),
    ]);
    let recap = summarize(monday(), &activity, vec![commit("a", 5, 2)]);
    assert_eq!(recap.week, "2026-10-19");
    let days: Vec<(&str, i64, u64)> = recap
        .days
        .iter()
        .map(|d| (d.date.as_str(), d.agent_ms, d.prompts))
        .collect();
    assert_eq!(
        days,
        [
            ("2026-10-19", 3_000, 2),
            ("2026-10-20", 0, 0),
            ("2026-10-21", 6_000, 4),
            ("2026-10-22", 0, 0),
            ("2026-10-23", 0, 0),
            ("2026-10-24", 0, 0),
            ("2026-10-25", 1_000, 1),
        ]
    );
    assert_eq!(recap.previous_agent_ms, 6_000);
    assert_eq!(recap.sessions, 2);
    let projects: Vec<(&str, i64)> = recap
        .projects
        .iter()
        .map(|p| (p.name.as_str(), p.agent_ms))
        .collect();
    assert_eq!(projects, [("api", 6_000), ("app", 4_000)]);
    assert_eq!(recap.agents[0].agent_ms, 10_000);
    assert_eq!((recap.lines_added, recap.lines_removed), (5, 2));
}

fn part(agent_ms: i64, project: &str, commits: Vec<RecapCommit>, repo: &str) -> WeeklyRecap {
    let mut recap = summarize(
        monday(),
        &Activity::from([("2026-10-20".to_string(), day(agent_ms, 1, project, project))]),
        commits,
    );
    recap.previous_agent_ms = agent_ms / 2;
    recap.worked_repos = vec![format!("github.com/{repo}")];
    recap
}

#[test]
fn merges_computers_counting_a_shared_commit_once() {
    let merged = merge(vec![
        part(
            2_000,
            "app",
            vec![commit("a", 10, 1), commit("b", 4, 0)],
            "me/app",
        ),
        part(
            5_000,
            "app",
            vec![commit("b", 4, 0), commit("c", 1, 1)],
            "me/api",
        ),
    ]);
    assert_eq!(merged.days[1].agent_ms, 7_000);
    assert_eq!(merged.days[1].prompts, 2);
    assert_eq!(merged.previous_agent_ms, 3_500);
    assert_eq!(merged.sessions, 2);
    assert_eq!(merged.projects.len(), 1);
    assert_eq!(merged.projects[0].agent_ms, 7_000);
    assert_eq!(merged.agents.len(), 1);
    assert_eq!(merged.agents[0].agent_ms, 7_000);
    assert_eq!((merged.lines_added, merged.lines_removed), (15, 2));
    assert_eq!(
        merged.worked_repos,
        ["github.com/me/api", "github.com/me/app"]
    );
}

#[test]
fn rejects_a_week_that_is_not_a_date() {
    assert!(bounds("last week").is_err());
    let week = bounds("2026-10-19").unwrap();
    assert_eq!(
        week.to.date_naive() - week.from.date_naive(),
        Duration::days(7)
    );
}

#[test]
fn rejects_a_week_at_the_edge_of_the_calendar() {
    for edge in [NaiveDate::MIN, NaiveDate::MAX] {
        let week = edge.format("%Y-%m-%d").to_string();
        assert!(bounds(&week).is_err(), "accepted {week}");
        assert!(local_recap(&week).is_err(), "recapped {week}");
    }
}

#[test]
fn starts_weeks_on_monday() {
    let sunday = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
    assert_eq!(week_of(false, sunday), "2026-10-19");
    assert_eq!(week_of(true, sunday), "2026-10-12");
    assert_eq!(week_of(false, monday()), "2026-10-19");
}
