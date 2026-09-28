use super::*;

fn event(model: &str, total: u64, fast: bool) -> UsageEvent {
    UsageEvent {
        provider: "claude",
        project: "lpm".into(),
        session_id: "session".into(),
        model: model.into(),
        timestamp: 1_700_000_000_000,
        tokens: TokenUsage {
            input_tokens: total,
            total_tokens: total,
            ..Default::default()
        },
        fast,
    }
}

#[test]
fn aggregate_groups_tokens_by_model() {
    let stats = aggregate(
        vec![
            event("claude-opus", 100, false),
            event("claude-opus", 50, false),
        ],
        0,
        Vec::new(),
    );
    assert_eq!(stats.models.len(), 1);
    assert_eq!(stats.models[0].label, "claude-opus");
    assert_eq!(stats.models[0].tokens.total_tokens, 150);
    assert_eq!(stats.models[0].provider.as_deref(), Some("claude"));
    assert_eq!(stats.projects[0].provider, None);
}

#[test]
fn aggregate_keeps_fast_mode_usage_in_its_own_model_rows() {
    let stats = aggregate(
        vec![
            event("claude-opus-5-5", 100, false),
            event("claude-opus-5-5", 40, true),
        ],
        0,
        Vec::new(),
    );
    let fast: Vec<(bool, u64)> = stats
        .models
        .iter()
        .map(|row| (row.fast, row.tokens.total_tokens))
        .collect();
    assert_eq!(fast, vec![(false, 100), (true, 40)]);
    let daily: Vec<(bool, u64)> = stats.daily[0]
        .models
        .iter()
        .map(|row| (row.fast, row.tokens.total_tokens))
        .collect();
    assert_eq!(daily, vec![(false, 100), (true, 40)]);
    assert_eq!(stats.recent_sessions[0].model, "claude-opus-5-5");
    assert_eq!(stats.totals.total_tokens, 140);
}

#[test]
fn longest_project_root_wins() {
    let matcher = ProjectMatcher {
        roots: vec![
            ProjectRoot {
                name: "copy".into(),
                root: PathBuf::from("/tmp/work/copy"),
            },
            ProjectRoot {
                name: "parent".into(),
                root: PathBuf::from("/tmp/work"),
            },
        ],
    };
    assert_eq!(
        matcher.project_for("/tmp/work/copy/src").as_deref(),
        Some("copy")
    );
    assert_eq!(
        matcher.project_for("/tmp/work/src").as_deref(),
        Some("parent")
    );
    assert_eq!(matcher.project_for("/tmp/other"), None);
}
