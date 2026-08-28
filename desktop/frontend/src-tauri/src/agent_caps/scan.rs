//! Local filesystem scan. Every path here was verified against a real install;
//! nothing is inferred from documentation alone.

use super::{mcp, plugins, skills, AgentCapabilities, AgentCapability, CapabilityRoot};
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

    let codex_home = skills::codex_home(&home);
    let skill_roots = skills::skill_roots_in(&home, &codex_home, root.as_deref());
    claude(&home, root.as_deref(), &skill_roots, &mut out);
    codex(&codex_home, root.as_deref(), &skill_roots, &mut out);
    mcp::scan(&home, cwd, root.as_deref(), &mut out);

    out.truncated = out.items.len() >= FILE_CAP;
    out.items.truncate(FILE_CAP);
    out
}

fn root_of(cli: &str, kind: &str, scope: &str, path: &Path, out: &mut AgentCapabilities) {
    out.roots.push(CapabilityRoot {
        cli: cli.to_string(),
        scope: scope.to_string(),
        kind: kind.to_string(),
        path: path.to_string_lossy().into_owned(),
        exists: path.exists(),
    });
}

// ---- markdown capability files ----------------------------------------------

/// (description, manual, size). A missing frontmatter description falls back to
/// the first meaningful body line, matching how the CLIs surface these
/// themselves.
pub(super) fn describe(path: &Path) -> (String, bool, u64) {
    let bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let (description, manual) = describe_content(&content);
    (description, manual, bytes)
}

/// Claude honours the YAML 1.1 spellings of true here — `yes`, `on`, `1` — but
/// serde_norway is YAML 1.2, which reads those as a string and a number. Going
/// by `as_bool` alone would report a manual skill as auto-loading and bill it
/// for context it never costs.
fn yaml_truthy(v: &serde_norway::Value) -> bool {
    if let Some(b) = v.as_bool() {
        return b;
    }
    if let Some(s) = v.as_str() {
        return matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "true" | "yes" | "on" | "1"
        );
    }
    v.as_i64() == Some(1)
}

/// The mirror of `yaml_truthy`, for a key whose default is true: only an
/// explicit false holds a skill back.
fn yaml_explicit_false(v: &serde_norway::Value) -> bool {
    if let Some(b) = v.as_bool() {
        return !b;
    }
    if let Some(s) = v.as_str() {
        return matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "false" | "no" | "off" | "0"
        );
    }
    v.as_i64() == Some(0)
}

/// Codex's opt-out, which lives beside SKILL.md rather than in its frontmatter.
fn codex_opted_out(dir: &Path) -> bool {
    let Ok(content) = std::fs::read_to_string(dir.join("agents/openai.yaml")) else {
        return false;
    };
    let Ok(val) = serde_norway::from_str::<serde_norway::Value>(&content) else {
        return false;
    };
    val.get("policy")
        .and_then(|p| p.get("allow_implicit_invocation"))
        .is_some_and(yaml_explicit_false)
}

/// (description, manual).
pub(super) fn describe_content(content: &str) -> (String, bool) {
    let (head, body) = crate::aigen::split_frontmatter(content);
    let mut manual = false;
    if let Some(head) = head {
        if let Ok(val) = serde_norway::from_str::<serde_norway::Value>(head) {
            manual = val.get("disable-model-invocation").is_some_and(yaml_truthy);
            let d = crate::aigen::yaml_str(&val, "description");
            if !d.is_empty() {
                return (d.chars().take(DESC_CAP).collect(), manual);
            }
        }
    }
    // Skip fenced blocks wholesale — a skill that opens with a shell example
    // would otherwise be described by a line of its own sample code.
    let mut fenced = false;
    let description = body
        .lines()
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
        .collect();
    (description, manual)
}

/// `<dir>/<name>/SKILL.md` — the skill's name is its directory name. `owner` is
/// the plugin a skill came from, which also namespaces its id: two plugins may
/// each ship a `review` skill without colliding.
fn skills_in(cli: &str, scope: &str, dir: &Path, owner: &str, out: &mut AgentCapabilities) {
    // Plugin directories are not places the user puts things, so they are not
    // listed as roots — only the scopes someone could actually write to.
    if owner.is_empty() {
        root_of(cli, KIND_SKILL, scope, dir, out);
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let skill_dir = entry.path();
        let skill_md = skill_dir.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let (description, manual, bytes) = describe(&skill_md);
        let mut cap = AgentCapability::new(cli, KIND_SKILL, scope, &name);
        if !owner.is_empty() {
            cap.detail = owner.to_string();
            cap.id = format!("{cli}:{KIND_SKILL}:{scope}:{owner}/{name}");
        }
        cap.path = skill_md.to_string_lossy().into_owned();
        cap.description = description;
        cap.bytes = bytes;
        // Each CLI honours only its own opt-out: Codex ignores the frontmatter
        // key, so crediting it here would zero out context the skill really
        // costs, and Claude ignores the file, so reading it would do the same.
        cap.manual = if cli == "codex" {
            codex_opted_out(&skill_dir)
        } else {
            manual
        };
        // A plugin's files are replaced wholesale on update, so an edit there
        // would be silently thrown away.
        cap.editable = owner.is_empty();
        out.items.push(cap);
    }
}

/// Flat or nested `*.md`, named by file stem.
fn markdown_in(cli: &str, kind: &str, scope: &str, dir: &Path, out: &mut AgentCapabilities) {
    root_of(cli, kind, scope, dir, out);
    let pattern = dir.join("**/*.md");
    let Ok(paths) = glob::glob(&pattern.to_string_lossy()) else {
        return;
    };
    for path in paths.filter_map(Result::ok) {
        let Some(name) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else {
            continue;
        };
        let (description, manual, bytes) = describe(&path);
        let mut cap = AgentCapability::new(cli, kind, scope, &name);
        cap.path = path.to_string_lossy().into_owned();
        cap.description = description;
        cap.bytes = bytes;
        cap.manual = manual;
        cap.editable = true;
        out.items.push(cap);
    }
}

/// A single instructions file (CLAUDE.md / AGENTS.md). Absent files still
/// register a root so the pane can offer to create one.
fn instructions_at(cli: &str, scope: &str, path: &Path, out: &mut AgentCapabilities) {
    root_of(cli, "", scope, path, out);
    if !path.is_file() {
        return;
    }
    let Some(name) = path.file_name().and_then(|s| s.to_str()).map(str::to_string) else {
        return;
    };
    let (description, manual, bytes) = describe(path);
    let mut cap = AgentCapability::new(cli, KIND_INSTRUCTIONS, scope, &name);
    cap.path = path.to_string_lossy().into_owned();
    // The file's own first line, not its size: the row already prints the size
    // in its own column, and `@AGENTS.md` says more about an 11-byte CLAUDE.md
    // than "11 B" does.
    cap.description = description;
    cap.bytes = bytes;
    cap.manual = manual;
    cap.editable = true;
    out.items.push(cap);
}

// ---- per-CLI layouts ---------------------------------------------------------

pub(super) fn claude(
    home: &Path,
    root: Option<&Path>,
    skill_roots: &[skills::SkillRoot],
    out: &mut AgentCapabilities,
) {
    let user = home.join(".claude");
    for r in skill_roots
        .iter()
        .filter(|r| r.cli == "claude" && r.scope == "user")
    {
        skills_in(r.cli, r.scope, &r.path, "", out);
    }
    markdown_in("claude", KIND_COMMAND, "user", &user.join("commands"), out);
    markdown_in("claude", KIND_SUBAGENT, "user", &user.join("agents"), out);
    instructions_at("claude", "user", &user.join("CLAUDE.md"), out);

    if let Some(root) = root {
        let project = root.join(".claude");
        for r in skill_roots
            .iter()
            .filter(|r| r.cli == "claude" && r.scope == "project")
        {
            skills_in(r.cli, r.scope, &r.path, "", out);
        }
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

pub(super) fn codex(
    codex_home: &Path,
    root: Option<&Path>,
    skill_roots: &[skills::SkillRoot],
    out: &mut AgentCapabilities,
) {
    for r in skill_roots.iter().filter(|r| r.cli == "codex") {
        skills_in(r.cli, r.scope, &r.path, "", out);
    }
    markdown_in("codex", KIND_COMMAND, "user", &codex_home.join("prompts"), out);
    instructions_at("codex", "user", &codex_home.join("AGENTS.md"), out);

    if let Some(root) = root {
        instructions_at("codex", "project", &root.join("AGENTS.md"), out);
    }
}

#[cfg(test)]
mod tests {
    use crate::agent_caps::AgentCapabilities;
    use tempfile::tempdir;

    const OPEN: &str = "---\ndescription: Ship it\n---\n\nBody.";
    const HELD_BACK: &str =
        "---\ndescription: Ship it\ndisable-model-invocation: true\n---\n\nBody.";
    const OPT_OUT: &str = "policy:\n  allow_implicit_invocation: false\n";

    fn desc(content: &str) -> String {
        super::describe_content(content).0
    }

    fn manual(content: &str) -> bool {
        super::describe_content(content).1
    }

    /// Builds a one-skill root and reports what the scan makes of it.
    fn scanned_manual(cli: &str, skill_md: &str, opt_out: Option<&str>) -> bool {
        let root = tempdir().unwrap();
        let dir = root.path().join("deploy");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), skill_md).unwrap();
        if let Some(yaml) = opt_out {
            std::fs::create_dir_all(dir.join("agents")).unwrap();
            std::fs::write(dir.join("agents/openai.yaml"), yaml).unwrap();
        }

        let mut out = AgentCapabilities::default();
        super::skills_in(cli, "user", root.path(), "", &mut out);
        out.items
            .iter()
            .find(|c| c.name == "deploy")
            .expect("the skill was not listed")
            .manual
    }

    #[test]
    fn describes_from_frontmatter_then_falls_back_to_the_body() {
        let with_fm = "---\nname: deploy\ndescription: Ship the thing\n---\n\n# Deploy\n\nBody.";
        assert_eq!(desc(with_fm), "Ship the thing");

        let no_fm = "# Heading\n\n```sh\nignored\n```\n\nThe first real line.";
        assert_eq!(desc(no_fm), "The first real line.");
    }

    /// The pane estimates a skill's standing context cost from this string's
    /// length, so a description longer than a label must survive intact — the
    /// real ones run to 800+ characters.
    #[test]
    fn keeps_descriptions_longer_than_a_label() {
        let long = "x".repeat(500);
        let doc = format!("---\ndescription: {long}\n---\n\nBody.");
        assert_eq!(desc(&doc).len(), 500);

        let body = format!("{}\n", "y".repeat(500));
        assert_eq!(desc(&body).len(), 500);
    }

    /// A manual skill still needs its description read — the pane shows it —
    /// even though it costs no up-front context.
    #[test]
    fn reads_the_manual_only_flag_alongside_the_description() {
        let doc = "---\nname: deploy\ndescription: Ship it\ndisable-model-invocation: true\n---\n\nBody.";
        assert_eq!(super::describe_content(doc), ("Ship it".to_string(), true));
    }

    /// Claude reads far more than `true` here. A skill written any of these ways
    /// is manual to the CLI, so reporting it as auto-loading would put a
    /// description in the token estimate that never reaches the model.
    #[test]
    fn every_spelling_of_true_the_cli_honours_reads_as_manual() {
        for value in ["true", "True", "\"true\"", "yes", "YES", "on", "On", "1"] {
            let doc = format!("---\ndisable-model-invocation: {value}\n---\n\nBody.");
            assert!(manual(&doc), "{value} should read as manual");
        }
    }

    #[test]
    fn a_skill_is_model_invocable_unless_the_key_says_otherwise() {
        assert!(!manual("---\ndescription: Ship it\n---\n\nBody."));
        assert!(!manual("No frontmatter at all."));
        for value in ["false", "\"false\"", "no", "off", "Off", "0", "maybe"] {
            let doc = format!("---\ndisable-model-invocation: {value}\n---\n\nBody.");
            assert!(!manual(&doc), "{value} should not read as manual");
        }
    }

    /// Neither CLI reads the other's opt-out, so the flag has to come from the
    /// one that CLI honours. Crediting the wrong source either bills a skill for
    /// context it never costs or hides context it does.
    #[test]
    fn each_cli_is_held_back_only_by_its_own_opt_out() {
        assert!(scanned_manual("codex", OPEN, Some(OPT_OUT)));
        assert!(!scanned_manual("codex", HELD_BACK, None));
        assert!(scanned_manual("claude", HELD_BACK, None));
        assert!(!scanned_manual("claude", OPEN, Some(OPT_OUT)));
    }

    /// Implicit invocation is the default, so anything short of an explicit
    /// false leaves the skill open — including a file that fails to parse.
    #[test]
    fn only_an_explicit_false_holds_a_codex_skill_back() {
        for yaml in [
            "policy:\n  allow_implicit_invocation: no\n",
            "policy:\n  allow_implicit_invocation: \"false\"\n",
            "policy:\n  allow_implicit_invocation: 0\n",
        ] {
            assert!(scanned_manual("codex", OPEN, Some(yaml)), "{yaml:?}");
        }
        for yaml in [
            "policy:\n  allow_implicit_invocation: true\n",
            "policy: {}\n",
            "allow_implicit_invocation: false\n",
            "not: yaml: at: all\n",
            "",
        ] {
            assert!(!scanned_manual("codex", OPEN, Some(yaml)), "{yaml:?}");
        }
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
