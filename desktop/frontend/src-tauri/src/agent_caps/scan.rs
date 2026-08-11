//! Local filesystem scan. Every path here was verified against a real install;
//! nothing is inferred from documentation alone.

use super::{mcp, plugins, AgentCapabilities, AgentCapability, CapabilityRoot};
use super::{KIND_COMMAND, KIND_INSTRUCTIONS, KIND_SKILL, KIND_SUBAGENT};
use std::path::{Path, PathBuf};

/// Enough for a large install, low enough that a pathological tree cannot hang
/// the pane. Hitting it sets `truncated`, which the UI shows rather than hides.
const FILE_CAP: usize = 800;

/// A bound on the IPC payload, not a display decision. The pane estimates what
/// a skill costs in every turn from its description length, so clamping here to
/// a label-sized figure would under-report that cost rather than merely shorten
/// a label. Truncation for display belongs in the row that draws it.
const DESC_CAP: usize = 4000;

pub fn scan(cwd: &str) -> AgentCapabilities {
    let home = dirs::home_dir().unwrap_or_default();
    let root = Some(cwd)
        .filter(|c| !c.trim().is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_dir());
    let mut out = AgentCapabilities::default();

    claude(&home, root.as_deref(), &mut out);
    codex(&home, root.as_deref(), &mut out);
    mcp::scan(&home, cwd, root.as_deref(), &mut out);

    out.truncated = out.items.len() >= FILE_CAP;
    out.items.truncate(FILE_CAP);
    out
}

fn root_of(cli: &str, scope: &str, path: &Path, out: &mut AgentCapabilities) {
    out.roots.push(CapabilityRoot {
        cli: cli.to_string(),
        scope: scope.to_string(),
        path: path.to_string_lossy().into_owned(),
        exists: path.exists(),
    });
}

// ---- markdown capability files ----------------------------------------------

/// (description, size). A missing frontmatter description falls back to the
/// first meaningful body line, matching how the CLIs surface these themselves.
pub(super) fn describe(path: &Path) -> (String, u64) {
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let content = std::fs::read_to_string(path).unwrap_or_default();
    (describe_content(&content), bytes)
}

pub(super) fn describe_content(content: &str) -> String {
    let (head, body) = crate::aigen::split_frontmatter(content);
    if let Some(head) = head {
        if let Ok(val) = serde_norway::from_str::<serde_norway::Value>(head) {
            let d = crate::aigen::yaml_str(&val, "description");
            if !d.is_empty() {
                return d.chars().take(DESC_CAP).collect();
            }
        }
    }
    // Skip fenced blocks wholesale — a skill that opens with a shell example
    // would otherwise be described by a line of its own sample code.
    let mut fenced = false;
    body.lines()
        .map(str::trim)
        .find(|line| {
            if line.starts_with("```") {
                fenced = !fenced;
                return false;
            }
            !fenced && !line.is_empty() && !line.starts_with('#')
        })
        .unwrap_or("")
        .chars()
        .take(DESC_CAP)
        .collect()
}

/// `<dir>/<name>/SKILL.md` — the skill's name is its directory name. `owner` is
/// the plugin a skill came from, which also namespaces its id: two plugins may
/// each ship a `review` skill without colliding.
fn skills_in(cli: &str, scope: &str, dir: &Path, owner: &str, out: &mut AgentCapabilities) {
    // Plugin directories are not places the user puts things, so they are not
    // listed as roots — only the scopes someone could actually write to.
    if owner.is_empty() {
        root_of(cli, scope, dir, out);
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let skill_md = entry.path().join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let (description, bytes) = describe(&skill_md);
        let mut cap = AgentCapability::new(cli, KIND_SKILL, scope, &name);
        if !owner.is_empty() {
            cap.detail = owner.to_string();
            cap.id = format!("{cli}:{KIND_SKILL}:{scope}:{owner}/{name}");
        }
        cap.path = skill_md.to_string_lossy().into_owned();
        cap.description = description;
        cap.bytes = bytes;
        // A plugin's files are replaced wholesale on update, so an edit there
        // would be silently thrown away.
        cap.editable = owner.is_empty();
        out.items.push(cap);
    }
}

/// Flat or nested `*.md`, named by file stem.
fn markdown_in(cli: &str, kind: &str, scope: &str, dir: &Path, out: &mut AgentCapabilities) {
    root_of(cli, scope, dir, out);
    let pattern = dir.join("**/*.md");
    let Ok(paths) = glob::glob(&pattern.to_string_lossy()) else {
        return;
    };
    for path in paths.filter_map(Result::ok) {
        let Some(name) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else {
            continue;
        };
        let (description, bytes) = describe(&path);
        let mut cap = AgentCapability::new(cli, kind, scope, &name);
        cap.path = path.to_string_lossy().into_owned();
        cap.description = description;
        cap.bytes = bytes;
        cap.editable = true;
        out.items.push(cap);
    }
}

/// A single instructions file (CLAUDE.md / AGENTS.md). Absent files still
/// register a root so the pane can offer to create one.
fn instructions_at(cli: &str, scope: &str, path: &Path, out: &mut AgentCapabilities) {
    root_of(cli, scope, path, out);
    if !path.is_file() {
        return;
    }
    let Some(name) = path.file_name().and_then(|s| s.to_str()).map(str::to_string) else {
        return;
    };
    let (description, bytes) = describe(path);
    let mut cap = AgentCapability::new(cli, KIND_INSTRUCTIONS, scope, &name);
    cap.path = path.to_string_lossy().into_owned();
    // The file's own first line, not its size: the row already prints the size
    // in its own column, and `@AGENTS.md` says more about an 11-byte CLAUDE.md
    // than "11 B" does.
    cap.description = description;
    cap.bytes = bytes;
    cap.editable = true;
    out.items.push(cap);
}

// ---- per-CLI layouts ---------------------------------------------------------

fn claude(home: &Path, root: Option<&Path>, out: &mut AgentCapabilities) {
    let user = home.join(".claude");
    skills_in("claude", "user", &user.join("skills"), "", out);
    markdown_in("claude", KIND_COMMAND, "user", &user.join("commands"), out);
    markdown_in("claude", KIND_SUBAGENT, "user", &user.join("agents"), out);
    instructions_at("claude", "user", &user.join("CLAUDE.md"), out);

    if let Some(root) = root {
        let project = root.join(".claude");
        skills_in("claude", "project", &project.join("skills"), "", out);
        markdown_in("claude", KIND_COMMAND, "project", &project.join("commands"), out);
        markdown_in("claude", KIND_SUBAGENT, "project", &project.join("agents"), out);
        instructions_at("claude", "project", &root.join("CLAUDE.md"), out);
    }

    // A plugin gates everything it ships, so a disabled one takes its skills
    // with it. Reporting them as loading is the exact failure this pane exists
    // to catch — and it would put their descriptions in the token estimate too.
    for (plugin, install_path, enabled) in plugins::installed_plugins(home) {
        let first = out.items.len();
        skills_in("claude", "plugin", &install_path.join("skills"), &plugin, out);
        if !enabled {
            for cap in &mut out.items[first..] {
                cap.enabled = false;
                cap.problem = format!("{plugin} is not enabled, so this skill never loads");
                cap.blocking = true;
            }
        }
    }
}

fn codex(home: &Path, root: Option<&Path>, out: &mut AgentCapabilities) {
    let codex_home = std::env::var("CODEX_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));

    skills_in("codex", "user", &codex_home.join("skills"), "", out);
    // lpm installs its own skills here, and Codex reads it as a second root.
    skills_in("codex", "user", &home.join(".agents/skills"), "", out);
    markdown_in("codex", KIND_COMMAND, "user", &codex_home.join("prompts"), out);
    instructions_at("codex", "user", &codex_home.join("AGENTS.md"), out);

    if let Some(root) = root {
        instructions_at("codex", "project", &root.join("AGENTS.md"), out);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn describes_from_frontmatter_then_falls_back_to_the_body() {
        let with_fm = "---\nname: deploy\ndescription: Ship the thing\n---\n\n# Deploy\n\nBody.";
        assert_eq!(super::describe_content(with_fm), "Ship the thing");

        let no_fm = "# Heading\n\n```sh\nignored\n```\n\nThe first real line.";
        assert_eq!(super::describe_content(no_fm), "The first real line.");
    }

    /// The pane estimates a skill's standing context cost from this string's
    /// length, so a description longer than a label must survive intact — the
    /// real ones run to 800+ characters.
    #[test]
    fn keeps_descriptions_longer_than_a_label() {
        let long = "x".repeat(500);
        let doc = format!("---\ndescription: {long}\n---\n\nBody.");
        assert_eq!(super::describe_content(&doc).len(), 500);

        let body = format!("{}\n", "y".repeat(500));
        assert_eq!(super::describe_content(&body).len(), 500);
    }

    /// Machine-dependent, so it never runs in CI. Kept because "what does the
    /// scanner actually see on this box" is the first question when a row looks
    /// wrong: `cargo test agent_caps -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn dump_this_machine() {
        let cwd = std::env::current_dir().unwrap();
        let cwd = cwd.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).unwrap();
        let mut result = super::scan(&cwd.to_string_lossy());
        crate::agent_caps::mark_shadowed_for_test(&mut result.items);
        println!("cwd={} trusted={}", cwd.display(), result.trusted);
        for cap in &result.items {
            println!(
                "{:<12} {:<8} {:<7} {:<28} {}",
                cap.kind,
                cap.cli,
                cap.scope,
                cap.name,
                if !cap.shadowed_by.is_empty() {
                    format!("SHADOWED BY {}", cap.shadowed_by)
                } else if !cap.problem.is_empty() {
                    cap.problem.clone()
                } else {
                    String::new()
                }
            );
        }
        println!("{} capabilities, {} roots", result.items.len(), result.roots.len());
    }
}
