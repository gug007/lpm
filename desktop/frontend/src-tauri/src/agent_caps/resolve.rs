//! Which definition actually wins when two share a name.
//!
//! The orders below are not one rule — skills and subagents resolve in
//! *opposite* directions, which is exactly why the pane is worth building.

use super::AgentCapability;
use super::{KIND_COMMAND, KIND_MCP, KIND_SKILL, KIND_SUBAGENT};
use std::collections::HashMap;

/// Lower wins. Plugin scope is namespaced by the CLI, so it never competes.
fn rank(kind: &str, scope: &str) -> Option<u8> {
    let order: &[&str] = match kind {
        // Personal beats project: your ~/.claude copy silently wins.
        KIND_SKILL => &["user", "project"],
        // The other way round.
        KIND_SUBAGENT | KIND_COMMAND => &["project", "user"],
        KIND_MCP => &["local", "project", "user"],
        // Instructions files stack rather than shadow; hooks all run.
        _ => return None,
    };
    order.iter().position(|s| *s == scope).map(|i| i as u8)
}

/// Fill `shadowed_by` on every losing definition. A tie at the same rank is
/// genuinely undefined — the CLIs resolve it by filesystem read order — so it
/// is reported as ambiguous rather than given a winner.
pub fn mark_shadowed(items: &mut [AgentCapability]) {
    let mut groups: HashMap<(String, String, String), Vec<usize>> = HashMap::new();
    for (i, cap) in items.iter().enumerate() {
        if rank(&cap.kind, &cap.scope).is_none() {
            continue;
        }
        let key = (cap.cli.clone(), cap.kind.clone(), cap.name.clone());
        groups.entry(key).or_default().push(i);
    }

    for indexes in groups.into_values() {
        if indexes.len() < 2 {
            continue;
        }
        let ranked: Vec<(usize, u8)> = indexes
            .iter()
            .filter_map(|&i| rank(&items[i].kind, &items[i].scope).map(|r| (i, r)))
            .collect();
        let best = ranked.iter().map(|(_, r)| *r).min().unwrap_or(0);
        let winners: Vec<usize> = ranked
            .iter()
            .filter(|(_, r)| *r == best)
            .map(|(i, _)| *i)
            .collect();

        if winners.len() > 1 {
            for &i in &winners {
                items[i].problem =
                    "ambiguous — the CLI does not define which of these wins".to_string();
            }
        }
        let winner_path = items[winners[0]].path.clone();
        for (i, r) in ranked {
            if r > best {
                items[i].shadowed_by = winner_path.clone();
            }
        }
    }
}

fn kind_order(kind: &str) -> u8 {
    match kind {
        KIND_MCP => 0,
        KIND_SKILL => 1,
        super::KIND_PLUGIN => 2,
        KIND_SUBAGENT => 3,
        KIND_COMMAND => 4,
        super::KIND_INSTRUCTIONS => 5,
        _ => 6,
    }
}

/// Anything broken first — the pane's whole job is to surface the capability
/// that is installed but will not load.
pub fn sort(items: &mut [AgentCapability]) {
    items.sort_by(|a, b| {
        let broken = |c: &AgentCapability| !c.problem.is_empty() || !c.shadowed_by.is_empty();
        broken(b)
            .cmp(&broken(a))
            .then_with(|| kind_order(&a.kind).cmp(&kind_order(&b.kind)))
            .then_with(|| a.cli.cmp(&b.cli))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.scope.cmp(&b.scope))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cap(kind: &str, scope: &str, name: &str, path: &str) -> AgentCapability {
        let mut c = AgentCapability::new("claude", kind, scope, name);
        c.path = path.to_string();
        c
    }

    #[test]
    fn user_skill_shadows_the_project_copy() {
        let mut items = vec![
            cap(KIND_SKILL, "project", "deploy", "/p/.claude/skills/deploy/SKILL.md"),
            cap(KIND_SKILL, "user", "deploy", "/h/.claude/skills/deploy/SKILL.md"),
        ];
        mark_shadowed(&mut items);
        assert_eq!(items[0].shadowed_by, "/h/.claude/skills/deploy/SKILL.md");
        assert!(items[1].shadowed_by.is_empty());
    }

    #[test]
    fn subagents_resolve_the_other_way_round() {
        let mut items = vec![
            cap(KIND_SUBAGENT, "project", "review", "/p/.claude/agents/review.md"),
            cap(KIND_SUBAGENT, "user", "review", "/h/.claude/agents/review.md"),
        ];
        mark_shadowed(&mut items);
        assert!(items[0].shadowed_by.is_empty());
        assert_eq!(items[1].shadowed_by, "/p/.claude/agents/review.md");
    }

    #[test]
    fn local_mcp_beats_project_and_user() {
        let mut items = vec![
            cap(KIND_MCP, "user", "pg", "/h/.claude.json"),
            cap(KIND_MCP, "project", "pg", "/p/.mcp.json"),
            cap(KIND_MCP, "local", "pg", "/h/.claude.json"),
        ];
        mark_shadowed(&mut items);
        assert_eq!(items[0].shadowed_by, "/h/.claude.json");
        assert_eq!(items[1].shadowed_by, "/h/.claude.json");
        assert!(items[2].shadowed_by.is_empty());
    }

    #[test]
    fn a_tie_is_reported_as_ambiguous_not_resolved() {
        let mut items = vec![
            cap(KIND_SUBAGENT, "project", "review", "/p/.claude/agents/a.md"),
            cap(KIND_SUBAGENT, "project", "review", "/p/.claude/agents/b.md"),
        ];
        mark_shadowed(&mut items);
        assert!(items.iter().all(|c| c.problem.contains("ambiguous")));
        assert!(items.iter().all(|c| c.shadowed_by.is_empty()));
    }

    #[test]
    fn instructions_files_stack_instead_of_shadowing() {
        let mut items = vec![
            cap(super::super::KIND_INSTRUCTIONS, "user", "CLAUDE.md", "/h/CLAUDE.md"),
            cap(super::super::KIND_INSTRUCTIONS, "project", "CLAUDE.md", "/p/CLAUDE.md"),
        ];
        mark_shadowed(&mut items);
        assert!(items.iter().all(|c| c.shadowed_by.is_empty()));
    }

    #[test]
    fn problems_sort_to_the_top() {
        let mut items = vec![
            cap(KIND_SKILL, "user", "aaa", "/a"),
            {
                let mut c = cap(KIND_SKILL, "user", "zzz", "/z");
                c.problem = "broken".into();
                c
            },
        ];
        sort(&mut items);
        assert_eq!(items[0].name, "zzz");
    }
}
