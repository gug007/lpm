use super::super::tests::context;
use super::super::{validate_value, ConfigKind};
use super::*;

fn errors(kind: ConfigKind, source: &str) -> Vec<String> {
    let (_dir, ctx) = context();
    let path = ctx.project_path("web");
    let value: Value = serde_norway::from_str(source).unwrap();
    validate_value(&ctx, &path, kind, &value).errors
}

#[test]
fn accepts_every_schedule_shape_the_app_writes() {
    let source = r#"
root: /tmp
jobs:
  weekly:
    label: Weekly
    emoji: "🧹"
    schedule: { at: "10:00", days: [mon] }
    run: { prompt: Summarize news, agent: codex, model: gpt-5, effort: xhigh, access: read, quiet: true, memory: false }
    sendTo: [lpm, telegram]
  band:
    schedule: { every: 4h-8h, at: "09:00", until: "18:00", days: [mon, fri] }
    run: { cmd: ./check.sh }
    check: test -n "$(git status --porcelain)"
    verify: npm test
    duplicate: { mode: worktree, reinstallDeps: true }
  hours: { schedule: { every: 6 }, run: { action: deploy, prompt: go }, duplicate: true }
  spread: { schedule: { at: "09:00", until: "17:00", times: 3, pickDays: 2, days: [mon, tue, wed] }, run: { cmd: x } }
  times: { schedule: { at: ["09:00", "17:30"] }, run: { cmd: x } }
  monthly: { schedule: { at: "09:00", days: [1, 31, last], shortMonths: last }, run: { cmd: x } }
  nth: { schedule: { at: "09:00", days: last weekday }, run: { cmd: x } }
  once: { schedule: { at: "14:00", days: ["2026-10-20"] }, run: { cmd: x } }
  cron: { schedule: { cron: "0 18 * * 5" }, run: { cmd: x }, sendTo: "telegram:releases" }
  daily: { schedule: { cron: "@daily" }, run: { cmd: x } }
  manual: { schedule: { manual: true }, run: { cmd: x }, enabled: false }
  ordered: { schedule: { manual: true }, run: { cmd: x }, machines: [this, Studio, any] }
  one: { schedule: { manual: true }, run: { cmd: x }, machines: aabbccdd }
  every: { schedule: { manual: true }, run: { cmd: x }, machines: [] }
  pinned: { schedule: { manual: true }, run: { prompt: x, claudeAccount: work_2 } }
  mainLogin: { schedule: { manual: true }, run: { prompt: x, claudeAccount: "" } }
"#;
    assert_eq!(errors(ConfigKind::Project, source), Vec::<String>::new());
}

#[test]
fn global_jobs_may_target_projects() {
    let source = "jobs:\n  shared:\n    schedule: { manual: true }\n    run: { cmd: x }\n    projects: [web, api]\n  alone:\n    schedule: { every: 1d }\n    run: { cmd: x }\n    projects: []\n";
    assert_eq!(errors(ConfigKind::Global, source), Vec::<String>::new());
    assert_eq!(errors(ConfigKind::Repo, source), Vec::<String>::new());
    assert!(errors(ConfigKind::Template, source).contains(&"config.jobs: unknown field".into()));
}

#[test]
fn rejects_what_the_app_would_refuse() {
    let cases = [
        ("jobs: [a]", "config.jobs", "expected a mapping"),
        ("jobs:\n  a: { run: { cmd: x } }", "config.jobs.a.schedule", "an automation needs a schedule"),
        ("jobs:\n  a: { schedule: { manual: true } }", "config.jobs.a.run", "an automation needs something to run"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x }, when: daily }", "config.jobs.a.when", "unknown field"),
        ("jobs:\n  a: { schedule: { manual: true }, run: {} }", "config.jobs.a.run", "set one of action, cmd or prompt"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x, prompt: y } }", "config.jobs.a.run", "set only one of action, cmd or prompt"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x, quiet: true } }", "config.jobs.a.run.quiet", "quiet only goes with an AI prompt"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x, memory: true } }", "config.jobs.a.run.memory", "memory only goes with an AI prompt"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x, claudeAccount: work } }", "config.jobs.a.run.claudeAccount", "claudeAccount only goes with an AI prompt"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { prompt: x, claudeAccount: a/b } }", "config.jobs.a.run.claudeAccount", "expected an account id of letters, digits, '-' or '_'"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { prompt: x, agent: gpt } }", "config.jobs.a.run.agent", "expected one of: claude, codex, gemini, opencode"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { prompt: x, access: none } }", "config.jobs.a.run.access", "expected one of: full, read"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { prompt: x, agent: opencode, access: read } }", "config.jobs.a.run.access", "opencode always runs with full access; pick another agent for read-only"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { action: deploy }, verify: npm test }", "config.jobs.a.verify", "a check after the run isn't available for actions"),
        ("jobs:\n  a: { schedule: {}, run: { cmd: x } }", "config.jobs.a.schedule", "set at, every, cron or manual: true"),
        ("jobs:\n  a: { schedule: { every: 2m }, run: { cmd: x } }", "config.jobs.a.schedule.every", "the interval must be at least 5 minutes"),
        ("jobs:\n  a: { schedule: { every: 8h-4h }, run: { cmd: x } }", "config.jobs.a.schedule.every", "the longest gap has to be at least the shortest"),
        ("jobs:\n  a: { schedule: { every: 1h, at: \"09:00\" }, run: { cmd: x } }", "config.jobs.a.schedule.until", "give the window an end time"),
        ("jobs:\n  a: { schedule: { every: 1h, days: [1] }, run: { cmd: x } }", "config.jobs.a.schedule.days", "an interval can only be limited to weekdays"),
        ("jobs:\n  a: { schedule: { at: \"25:00\" }, run: { cmd: x } }", "config.jobs.a.schedule.at", "expected a time like \"09:00\""),
        ("jobs:\n  a: { schedule: { at: [\"09:00\", \"09:02\"] }, run: { cmd: x } }", "config.jobs.a.schedule.at", "keep the times at least 5 minutes apart"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", times: 2 }, run: { cmd: x } }", "config.jobs.a.schedule.times", "spreading runs needs an until window"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", until: \"08:00\" }, run: { cmd: x } }", "config.jobs.a.schedule.until", "the window has to end after it starts"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", days: [mon, 1] }, run: { cmd: x } }", "config.jobs.a.schedule.days", "use weekdays, dates of the month or calendar dates, not a mix"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", days: [mon], shortMonths: last }, run: { cmd: x } }", "config.jobs.a.schedule.shortMonths", "shortMonths only goes with dates of the month"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", days: [mon], pickDays: 2 }, run: { cmd: x } }", "config.jobs.a.schedule.pickDays", "only 1 days to pick from"),
        ("jobs:\n  a: { schedule: { at: \"09:00\", days: second fri day }, run: { cmd: x } }", "config.jobs.a.schedule.days", "use a position like \"first mon\" or \"last weekday\""),
        ("jobs:\n  a: { schedule: { cron: \"0 18 * *\" }, run: { cmd: x } }", "config.jobs.a.schedule.cron", "expected five fields: minute hour day-of-month month day-of-week"),
        ("jobs:\n  a: { schedule: { cron: \"@daily\", at: \"09:00\" }, run: { cmd: x } }", "config.jobs.a.schedule", "a cron line replaces at, every and days; drop them"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x }, duplicate: { mode: clone } }", "config.jobs.a.duplicate.mode", "expected one of: copy, worktree"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x }, sendTo: slack }", "config.jobs.a.sendTo", "expected lpm, telegram or telegram:<target>"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x }, enabled: yes }", "config.jobs.a.enabled", "expected true or false"),
        ("jobs:\n  a: { schedule: { manual: true }, run: { cmd: x }, machines: [this, 2] }", "config.jobs.a.machines", "expected a list of computers"),
    ];
    for (jobs, error_path, message) in cases {
        let source = format!("root: /tmp\n{jobs}\n");
        let expected = format!("{error_path}: {message}");
        let errors = errors(ConfigKind::Project, &source);
        assert!(
            errors.contains(&expected),
            "missing {expected:?} for {jobs:?}: {errors:?}"
        );
    }
}

#[test]
fn ssh_projects_have_no_automations() {
    let source = "ssh: { host: box, user: me, dir: /srv/app }\nservices:\n  web: npm start\njobs:\n  a: { schedule: { manual: true }, run: { cmd: x } }\n";
    assert!(errors(ConfigKind::Project, source)
        .contains(&"config.jobs: automations don't run on SSH projects".into()));
}

#[test]
fn memory_on_a_read_only_run_is_flagged_but_allowed() {
    let source = "root: /tmp\njobs:\n  a: { schedule: { manual: true }, run: { prompt: x, access: read, memory: true } }\n";
    let (_dir, ctx) = context();
    let path = ctx.project_path("web");
    let value: Value = serde_norway::from_str(source).unwrap();
    let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
    assert_eq!(report.errors, Vec::<String>::new());
    assert_eq!(
        report.warnings,
        vec!["config.jobs.a.run.memory: a read-only run can't save its memory, so each run starts fresh".to_string()]
    );
}

#[test]
fn an_event_schedule_is_checked_on_its_own_terms() {
    let ok = "root: /tmp\njobs:\n  a: { schedule: { on: ciFailed, branches: [main], atMost: day }, run: { prompt: x } }\n";
    assert_eq!(errors(ConfigKind::Project, ok), Vec::<String>::new());
    let cases = [
        ("{ on: prOpened }", "config.jobs.a.schedule.on: expected one of: ciFailed, serviceCrashed, agentFinished"),
        ("{ on: ciFailed, every: 6h }", "config.jobs.a.schedule: an event replaces at, every, days, cron and manual; drop them"),
        ("{ on: ciFailed, services: [api] }", "config.jobs.a.schedule.services: goes with on: serviceCrashed"),
        ("{ on: ciFailed, atMost: hour }", "config.jobs.a.schedule.atMost: expected one of: commit, day"),
        ("{ at: '09:00', branches: [main] }", "config.jobs.a.schedule.branches: goes with on"),
    ];
    for (schedule, expected) in cases {
        let source = format!("root: /tmp\njobs:\n  a: {{ schedule: {schedule}, run: {{ prompt: x }} }}\n");
        let errors = errors(ConfigKind::Project, &source);
        assert!(errors.contains(&expected.to_string()), "{schedule}: {errors:?}");
    }
}

#[test]
fn an_agents_finish_cant_run_an_action() {
    let source = "root: /tmp\njobs:\n  a: { schedule: { on: agentFinished }, run: { action: claude } }\n";
    assert!(errors(ConfigKind::Project, source).iter().any(|e| e.starts_with("config.jobs.a.run: an automation an agent's finish starts")));
}
