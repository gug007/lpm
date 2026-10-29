use super::*;
use crate::agent_activity::DayActivity;
use crate::agent_usage::TokenUsage;
use crate::peer::PeerEntry;
use crate::peerclient::PhoneMachine;
use chrono::Duration;
use computers::add_up;
use serde_json::json;

fn monday() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()
}

fn week() -> Bounds {
    bounds("2026-10-19", RecapPeriod::Week).unwrap()
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
    let tokens = HashMap::from([
        ("2026-10-18".to_string(), 7),
        ("2026-10-19".to_string(), 1_200),
        ("2026-10-25".to_string(), 30),
    ]);
    let recap = summarize(&week(), &activity, &tokens, vec![commit("a", 5, 2)]);
    assert_eq!(recap.week, "2026-10-19");
    let days: Vec<(&str, i64, u64, u64)> = recap
        .days
        .iter()
        .map(|d| (d.date.as_str(), d.agent_ms, d.prompts, d.tokens))
        .collect();
    assert_eq!(
        days,
        [
            ("2026-10-19", 3_000, 2, 1_200),
            ("2026-10-20", 0, 0, 0),
            ("2026-10-21", 6_000, 4, 0),
            ("2026-10-22", 0, 0, 0),
            ("2026-10-23", 0, 0, 0),
            ("2026-10-24", 0, 0, 0),
            ("2026-10-25", 1_000, 1, 30),
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
        &week(),
        &Activity::from([("2026-10-20".to_string(), day(agent_ms, 1, project, project))]),
        &HashMap::from([("2026-10-20".to_string(), agent_ms as u64 * 10)]),
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
    assert_eq!(merged.days[1].tokens, 70_000);
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

fn usage(timestamp: i64, total_tokens: u64) -> UsageEvent {
    UsageEvent {
        provider: "claude",
        project: "app".into(),
        session_id: "s".into(),
        model: "m".into(),
        timestamp,
        tokens: TokenUsage {
            total_tokens,
            ..Default::default()
        },
        fast: false,
        long_context: false,
    }
}

#[test]
fn counts_tokens_on_their_local_day_inside_the_week() {
    let week = week();
    let (from, to) = (week.from.timestamp_millis(), week.to.timestamp_millis());
    let hour = 3_600_000;
    let days = tokens_by_day(
        vec![
            usage(from - 1, 5),
            usage(from, 100),
            usage(from + 23 * hour, 20),
            usage(from + 25 * hour, 3),
            usage(to - 1, 4),
            usage(to, 9),
        ],
        from,
        to,
    );
    assert_eq!(days.len(), 3);
    assert_eq!(days["2026-10-19"], 120);
    assert_eq!(days["2026-10-20"], 3);
    assert_eq!(days["2026-10-25"], 4);
}

#[test]
fn rejects_a_week_that_is_not_a_date() {
    assert!(bounds("last week", RecapPeriod::Week).is_err());
    let week = week();
    assert_eq!(
        week.to.date_naive() - week.from.date_naive(),
        Duration::days(7)
    );
}

#[test]
fn rejects_a_week_at_the_edge_of_the_calendar() {
    for edge in [NaiveDate::MIN, NaiveDate::MAX] {
        let week = edge.format("%Y-%m-%d").to_string();
        for period in [RecapPeriod::Week, RecapPeriod::Month] {
            assert!(bounds(&week, period).is_err(), "accepted {week}");
            assert!(local_recap(&week, period).is_err(), "recapped {week}");
        }
    }
}

#[test]
fn starts_weeks_on_monday() {
    let sunday = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
    assert_eq!(RecapPeriod::Week.start(false, sunday), "2026-10-19");
    assert_eq!(RecapPeriod::Week.start(true, sunday), "2026-10-12");
    assert_eq!(RecapPeriod::Week.start(false, monday()), "2026-10-19");
}

#[test]
fn starts_months_on_their_first_day() {
    let day = |m, d| NaiveDate::from_ymd_opt(2026, m, d).unwrap();
    assert_eq!(RecapPeriod::Month.start(false, day(10, 29)), "2026-10-01");
    assert_eq!(RecapPeriod::Month.start(true, day(10, 29)), "2026-09-01");
    assert_eq!(RecapPeriod::Month.start(false, day(10, 1)), "2026-10-01");
    assert_eq!(RecapPeriod::Month.start(true, day(1, 31)), "2025-12-01");
}

#[test]
fn sums_the_month_and_the_one_before_it() {
    let month = bounds("2026-02-01", RecapPeriod::Month).unwrap();
    let activity = Activity::from([
        ("2026-01-01".to_string(), day(4_000, 1, "old", "x")),
        ("2026-01-31".to_string(), day(1_000, 1, "old", "x")),
        ("2026-02-01".to_string(), day(3_000, 2, "app", "a")),
        ("2026-02-28".to_string(), day(6_000, 4, "api", "b")),
        ("2026-03-01".to_string(), day(9_000, 9, "next", "c")),
    ]);
    let tokens = HashMap::from([("2026-02-28".to_string(), 500)]);
    let recap = summarize(&month, &activity, &tokens, Vec::new());
    assert_eq!(
        (recap.week.as_str(), recap.period),
        ("2026-02-01", RecapPeriod::Month)
    );
    assert_eq!(recap.days.len(), 28);
    assert_eq!(recap.days[27].date, "2026-02-28");
    assert_eq!(recap.days.iter().map(|d| d.agent_ms).sum::<i64>(), 9_000);
    assert_eq!(recap.days[27].tokens, 500);
    assert_eq!(recap.previous_agent_ms, 5_000);
    assert_eq!(recap.sessions, 2);
}

#[test]
fn reads_the_period_a_computer_sends() {
    let part: WeeklyRecap = serde_json::from_value(json!({ "week": "2026-10-19" })).unwrap();
    assert_eq!(part.period, RecapPeriod::Week);
    let month = summarize(
        &bounds("2026-10-01", RecapPeriod::Month).unwrap(),
        &Activity::new(),
        &HashMap::new(),
        Vec::new(),
    );
    let sent = serde_json::to_value(&month).unwrap();
    assert_eq!(sent["period"], "month");
    assert_eq!(sent["days"].as_array().map(Vec::len), Some(31));
}

fn machine(slug: &str, name: &str, connected: bool) -> PhoneMachine {
    PhoneMachine {
        entry: PeerEntry {
            slug: slug.into(),
            alias: name.into(),
            enabled: true,
            ..Default::default()
        },
        connected,
        supports_remote_pair: false,
        supports_phone_relay: false,
    }
}

#[test]
fn names_every_computer_left_out_offline_ones_too() {
    let month = bounds("2026-10-01", RecapPeriod::Month).unwrap();
    let recap = |agent_ms| {
        let day = day(agent_ms, 1, "app", "a");
        summarize(
            &month,
            &Activity::from([("2026-10-02".to_string(), day)]),
            &HashMap::new(),
            Vec::new(),
        )
    };
    let peers = [
        machine("off", "build-box", false),
        machine("new", "laptop", true),
        machine("old", "old-mac", true),
    ];
    let old_week: WeeklyRecap = serde_json::from_value(
        json!({ "week": "2026-10-01", "days": [{}, {}, {}, {}, {}, {}, {}] }),
    )
    .unwrap();
    let reads = HashMap::from([
        ("new".to_string(), Ok(recap(2_000))),
        ("old".to_string(), Ok(old_week)),
    ]);
    let read = add_up(recap(1_000), &peers, reads);
    assert_eq!(read.recap.missing, ["build-box", "old-mac"]);
    assert_eq!(read.recap.days[1].agent_ms, 3_000);

    assert!(!read.stale(&peers));
    let back = [
        machine("off", "build-box", true),
        machine("old", "old-mac", true),
    ];
    assert!(read.stale(&back));
}
