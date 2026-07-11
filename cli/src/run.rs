//! `lpm run [action] [--command CMD] [--prompt TEXT] [-p project]` — queue an
//! action or command in a new terminal in the running app. Fire-and-forget: the
//! CLI can't await terminal output; observe it with `lpm logs` / `lpm status`.

use crate::config::{self, Ctx, ResolvedAction, ResolvedProject};
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

/// A runnable target: composite id (`parent:child`, colon-joined path) plus its
/// display label. Mirrors the desktop's runnable set — every entry from both the
/// `terminals:` and `actions:` blocks, including nested children.
pub struct RunTarget {
    pub id: String,
    pub label: String,
}

/// Collect every runnable target from a resolved project, recursing into
/// children with colon-joined composite ids.
pub fn collect_run_targets(p: &ResolvedProject) -> Vec<RunTarget> {
    let mut out = Vec::new();
    for a in p.terminals.iter().chain(p.actions.iter()) {
        walk_run_targets(a, "", &mut out);
    }
    out
}

fn walk_run_targets(a: &ResolvedAction, prefix: &str, out: &mut Vec<RunTarget>) {
    let id = compose_id(prefix, &a.name);
    out.push(RunTarget {
        id: id.clone(),
        label: a.label.clone(),
    });
    for c in &a.children {
        walk_run_targets(c, &id, out);
    }
}

fn compose_id(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}:{name}")
    }
}

fn leaf_key(id: &str) -> &str {
    id.rsplit_once(':').map(|(_, k)| k).unwrap_or(id)
}

/// Resolve a `--run` / action query against the project's runnable targets, in
/// priority order: (1) exact id (case-sensitive), (2) unique exact leaf-key
/// match, (3) unambiguous id prefix, (4) unique case-insensitive id or leaf-key
/// match, (5) unique case-insensitive label match. The leaf-key tier sits before
/// the prefix tier to mirror the desktop's `resolveRunnableAction`, so a bare
/// nested name (`claude` for `claude-max:claude`) resolves instead of tripping
/// the prefix tier's ambiguity. Ambiguity at any tier errors with the
/// candidates; no match errors with every runnable id (and its label when it
/// differs) so an agent can self-correct. Returns the resolved exact id.
pub fn resolve_run_target(targets: &[RunTarget], query: &str) -> Result<String, String> {
    if let Some(t) = targets.iter().find(|t| t.id == query) {
        return Ok(t.id.clone());
    }
    let leaf: Vec<&RunTarget> = targets.iter().filter(|t| leaf_key(&t.id) == query).collect();
    match leaf.len() {
        1 => return Ok(leaf[0].id.clone()),
        0 => {}
        _ => return Err(ambiguous(query, &leaf)),
    }
    let prefix: Vec<&RunTarget> = targets.iter().filter(|t| t.id.starts_with(query)).collect();
    match prefix.len() {
        1 => return Ok(prefix[0].id.clone()),
        0 => {}
        _ => return Err(ambiguous(query, &prefix)),
    }
    let ql = query.to_lowercase();
    let ci: Vec<&RunTarget> = targets
        .iter()
        .filter(|t| t.id.to_lowercase() == ql || leaf_key(&t.id).to_lowercase() == ql)
        .collect();
    match ci.len() {
        1 => return Ok(ci[0].id.clone()),
        0 => {}
        _ => return Err(ambiguous(query, &ci)),
    }
    let by_label: Vec<&RunTarget> = targets
        .iter()
        .filter(|t| t.label.to_lowercase() == ql)
        .collect();
    match by_label.len() {
        1 => return Ok(by_label[0].id.clone()),
        0 => {}
        _ => return Err(ambiguous(query, &by_label)),
    }
    Err(no_match(query, targets))
}

fn ambiguous(query: &str, cands: &[&RunTarget]) -> String {
    format!(
        "{query:?} is ambiguous — matches: {}",
        cands
            .iter()
            .map(|t| t.id.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    )
}

fn no_match(query: &str, targets: &[RunTarget]) -> String {
    let list = if targets.is_empty() {
        "(none)".to_string()
    } else {
        targets
            .iter()
            .map(|t| {
                if t.label.is_empty() || t.label == t.id {
                    t.id.clone()
                } else {
                    format!("{} ({})", t.id, t.label)
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!("no runnable matches {query:?}\nrunnable ids: {list}")
}

pub fn run(
    ctx: &Ctx,
    action: Option<&str>,
    command: Option<&str>,
    prompt: Option<&str>,
    project: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;
    let p = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;

    let mut line = format!("run_task {}", quote_arg(&file_name));
    let mut action_name: Option<String> = None;
    let mut command_str: Option<String> = None;
    match (action, command) {
        (Some(_), Some(_)) => {
            return Err(RunError::NotFound(
                "run takes exactly one of <action> / --command".into(),
            ))
        }
        (None, None) => {
            return Err(RunError::NotFound(
                "run needs an action name or --command <cmd>".into(),
            ))
        }
        (Some(a), None) => {
            let targets = collect_run_targets(&p);
            let resolved = resolve_run_target(&targets, a).map_err(RunError::NotFound)?;
            line.push_str(&format!(" --action={}", quote_arg(&resolved)));
            action_name = Some(resolved);
        }
        (None, Some(c)) => {
            line.push_str(&format!(" --command={}", quote_arg(c)));
            command_str = Some(c.to_string());
        }
    }
    if let Some(pr) = prompt.filter(|p| !p.trim().is_empty()) {
        line.push_str(&format!(" --prompt={}", quote_arg(pr)));
    }

    control::send_command(ctx, &line)?;

    if as_json {
        crate::util::print_json(&json!({
            "ok": true,
            "project": file_name,
            "action": action_name,
            "command": command_str,
            "prompt": prompt,
        }));
    } else {
        let what = action_name
            .as_deref()
            .map(|a| format!("action {a}"))
            .or_else(|| command_str.as_deref().map(|c| format!("command {c:?}")))
            .unwrap_or_default();
        println!("queued {what} in {file_name}");
        eprintln!(
            "note: fire-and-forget — the task runs in a new terminal in the app; \
watch it with `lpm logs` / `lpm status`"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(id: &str, label: &str) -> RunTarget {
        RunTarget {
            id: id.to_string(),
            label: label.to_string(),
        }
    }

    /// Mirrors the real `ai-benchmarking` shape: terminal-origin entries with
    /// nested children whose ids are composite and whose labels differ from ids.
    fn sample_targets() -> Vec<RunTarget> {
        vec![
            target("claude-max", "Claude Max"),
            target("claude-max:claude", "Claude"),
            target("claude-max:codex", "Codex"),
            target("claude-ultracode", "Claude Ultracode"),
            target("release", "Release"),
        ]
    }

    #[test]
    fn resolves_exact_id_then_prefix() {
        let t = sample_targets();
        assert_eq!(resolve_run_target(&t, "claude-max").unwrap(), "claude-max");
        assert_eq!(
            resolve_run_target(&t, "claude-max:cl").unwrap(),
            "claude-max:claude"
        );
        assert_eq!(resolve_run_target(&t, "rel").unwrap(), "release");
    }

    #[test]
    fn resolves_composite_child_id_exactly() {
        let t = sample_targets();
        assert_eq!(
            resolve_run_target(&t, "claude-max:codex").unwrap(),
            "claude-max:codex"
        );
    }

    #[test]
    fn resolves_case_insensitive_full_id_and_leaf_key() {
        let t = sample_targets();
        // full id, different case.
        assert_eq!(
            resolve_run_target(&t, "CLAUDE-MAX:CODEX").unwrap(),
            "claude-max:codex"
        );
        // leaf-key match, case-insensitive: `codex` is the leaf of
        // `claude-max:codex` and doesn't collide with the prefix tier.
        assert_eq!(resolve_run_target(&t, "CODEX").unwrap(), "claude-max:codex");
    }

    #[test]
    fn resolves_via_label_when_no_id_or_leaf_matches() {
        let t = sample_targets();
        // The reported bug: `--run "Claude Max"` is a display label; it matches no
        // id or leaf key, so only the label tier resolves it.
        assert_eq!(resolve_run_target(&t, "Claude Max").unwrap(), "claude-max");
    }

    #[test]
    fn resolves_bare_nested_name_via_leaf_before_prefix() {
        let t = sample_targets();
        // Desktop parity: `claude` is a prefix of four ids, but a unique exact
        // leaf-key of `claude-max:claude` — the leaf tier runs first, so it
        // resolves instead of tripping prefix ambiguity.
        assert_eq!(
            resolve_run_target(&t, "claude").unwrap(),
            "claude-max:claude"
        );
    }

    #[test]
    fn ambiguous_prefix_is_error() {
        let t = sample_targets();
        // `claude-max:c` is no exact leaf but prefixes two ids — ambiguous at the
        // prefix tier.
        let err = resolve_run_target(&t, "claude-max:c").unwrap_err();
        assert!(err.contains("ambiguous"));
        assert!(err.contains("claude-max:claude"));
        assert!(err.contains("claude-max:codex"));
    }

    #[test]
    fn label_only_query_resolves_when_no_id_matches() {
        let t = vec![target("claude-max:claude", "Sonnet Agent")];
        assert_eq!(
            resolve_run_target(&t, "sonnet agent").unwrap(),
            "claude-max:claude"
        );
    }

    #[test]
    fn ambiguous_prefix_and_leaf_are_errors() {
        let t = vec![
            target("a:claude", "Claude"),
            target("b:claude", "Claude"),
        ];
        let err = resolve_run_target(&t, "claude").unwrap_err();
        assert!(err.contains("ambiguous"));
        assert!(err.contains("a:claude"));
        assert!(err.contains("b:claude"));
    }

    #[test]
    fn no_match_lists_ids_with_labels() {
        let t = sample_targets();
        let err = resolve_run_target(&t, "zzz").unwrap_err();
        assert!(err.contains("no runnable matches"));
        assert!(err.contains("claude-max:claude (Claude)"));
        assert!(err.contains("release (Release)"));
    }

    #[test]
    fn collect_walks_terminals_and_actions_with_composite_ids() {
        let child = ResolvedAction {
            name: "claude".into(),
            label: "Claude".into(),
            emoji: String::new(),
            shortcut: String::new(),
            cmd: "claude".into(),
            cwd: String::new(),
            ports: Vec::new(),
            kind: "terminal".into(),
            display: "header".into(),
            confirm: false,
            reuse: false,
            position: None,
            env: Default::default(),
            children: Vec::new(),
        };
        let parent = ResolvedAction {
            name: "claude-max".into(),
            label: "Claude Max".into(),
            emoji: String::new(),
            shortcut: String::new(),
            cmd: String::new(),
            cwd: String::new(),
            ports: Vec::new(),
            kind: "terminal".into(),
            display: "header".into(),
            confirm: false,
            reuse: false,
            position: None,
            env: Default::default(),
            children: vec![child],
        };
        let p = ResolvedProject {
            file_name: "x".into(),
            session: "x".into(),
            root: String::new(),
            label: String::new(),
            is_remote: false,
            parent_name: String::new(),
            services: Vec::new(),
            profiles: Default::default(),
            terminals: vec![parent],
            actions: Vec::new(),
        };
        let ids: Vec<String> = collect_run_targets(&p).into_iter().map(|t| t.id).collect();
        assert_eq!(ids, vec!["claude-max", "claude-max:claude"]);
    }
}
