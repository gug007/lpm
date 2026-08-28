//! Drafting a SKILL.md with an AI CLI, for the Toolkit pane's new-skill form.
//!
//! Read-only: the CLI runs in the project directory so it can look at the repo,
//! but with writes disallowed — the user reviews the draft in the form and the
//! existing `create_agent_skill` does the one write.
//!
//! Whatever the model returns is treated as a suggestion, never as a file: the
//! name and description are re-sanitized here to the same rules the form and
//! `skills::validate_skill_name` enforce, so a sloppy draft still lands in a
//! valid field. Any frontmatter key beyond `name`/`description` is dropped —
//! `disable-model-invocation` included, because invocation is the user's choice
//! in the form, not the model's.

use crate::aigen::{ropts, run_ai, split_frontmatter, yaml_str};
use std::path::Path;

const MAX_NAME: usize = 64;
const MAX_DESCRIPTION: usize = 1024;
const PROGRESS_EVENT: &str = "skill-gen-progress";

const NO_FILE: &str = "The draft didn't come back as a SKILL.md file.";
const NO_NAME: &str = "The draft came back without a usable name.";
const NO_DESCRIPTION: &str = "The draft came back without a description.";

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSkill {
    pub name: String,
    pub description: String,
    pub body: String,
}

const SKILL_PROMPT: &str = r#"You are drafting an agent skill: a SKILL.md file that an AI coding agent loads to learn how to do one task.

You may read the repository in the current directory for context. Do not modify anything — this is a read-only drafting task.

Output ONLY the complete SKILL.md file content: YAML frontmatter, then a markdown body.

Frontmatter rules:
- Exactly two keys, `name` and `description`. No other keys.
- `name`: kebab-case — lowercase letters, digits and hyphens only, 64 characters or fewer.
- `description`: 1 to 3 sentences, 1024 characters or fewer. Say what the skill does AND when to use it: an agent picks a skill by matching this text against the task in front of it, so it is the only thing that makes the skill findable.
- The description must not contain the characters < or > — loaders drop a skill whose description has them.

Body rules:
- Concise, ordered, imperative steps the agent follows.
- Link to long reference material (a file path, a URL) rather than inlining it.

No commentary before or after the file content. No code fence around the file.

What the user wants the skill to do:
"#;

fn build_prompt(description: &str, name_hint: &str) -> String {
    let mut prompt = String::from(SKILL_PROMPT);
    prompt.push_str(description.trim());
    prompt.push('\n');
    let hint = name_hint.trim();
    if !hint.is_empty() {
        prompt.push_str(&format!(
            "\nThe user suggests the name {hint} — keep it unless it's clearly wrong.\n"
        ));
    }
    prompt
}

/// The project directory when it is usable, else home — the CLI still has to
/// start somewhere when the pane has no project open.
fn run_dir(cwd: &str) -> String {
    let trimmed = cwd.trim();
    let path = Path::new(trimmed);
    if !trimmed.is_empty() && path.is_absolute() && path.is_dir() {
        return trimmed.to_string();
    }
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".into())
}

/// Draft a SKILL.md for the new-skill form. Streams progress to
/// `skill-gen-progress`; cancelable via `cancel_ai_generate` with the same
/// `gen_id`.
#[tauri::command(async)]
pub fn generate_agent_skill(
    app: tauri::AppHandle,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    cwd: String,
    description: String,
    name_hint: String,
    gen_id: String,
) -> Result<GeneratedSkill, String> {
    if description.trim().is_empty() {
        return Err("Describe what the skill should do first.".into());
    }
    let prompt = build_prompt(&description, &name_hint);
    let raw = run_ai(
        &app,
        &cli,
        &run_dir(&cwd),
        &prompt,
        ropts(None, model, effort, fast, false),
        PROGRESS_EVENT,
        &gen_id,
    )?;
    parse_generated(&raw, &name_hint)
}

// ---- parsing -----------------------------------------------------------------

/// Mirror of the form's own `skillNameDraft`/`skillName`: lowercase, every run
/// of other characters becomes one hyphen, no leading or trailing hyphen, 64
/// characters. The cap is applied before the trailing hyphen is dropped, so a
/// truncation that lands on a separator does not leave one behind.
fn sanitize_name(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.trim().to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.chars()
        .take(MAX_NAME)
        .collect::<String>()
        .trim_end_matches('-')
        .to_string()
}

/// Angle brackets make both CLIs drop the skill, so they never survive the
/// draft. Newlines do — the create form folds them itself.
fn sanitize_description(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| *c != '<' && *c != '>')
        .take(MAX_DESCRIPTION)
        .collect::<String>()
        .trim()
        .to_string()
}

/// Unwrap a fence around the whole answer. Only a fence that opens the text and
/// closes it counts; a body that merely contains code blocks is left alone.
fn unwrap_fence(raw: &str) -> &str {
    let text = raw.trim();
    let Some(after_open) = text.strip_prefix("```") else {
        return text;
    };
    let Some(nl) = after_open.find('\n') else {
        return text;
    };
    // Only a bare language tag may follow the opening fence.
    if after_open[..nl].trim().contains(char::is_whitespace) {
        return text;
    }
    match after_open[nl + 1..].trim_end().strip_suffix("```") {
        Some(inner) => inner.trim(),
        None => text,
    }
}

/// Drop anything before the frontmatter — models like to announce the file
/// first ("Here is your skill:").
fn from_frontmatter(text: &str) -> &str {
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        if line.trim_end() == "---" {
            return &text[offset..];
        }
        offset += line.len();
    }
    text
}

/// The form supplies its own title, so a leading `# Heading` is redundant.
fn strip_title(body: &str) -> &str {
    let body = body.trim();
    let Some(rest) = body.strip_prefix("# ") else {
        return body;
    };
    rest.find('\n').map_or("", |nl| rest[nl + 1..].trim())
}

/// Turn one CLI answer into the three fields the form binds to. Pure, so the
/// shapes models actually return are covered by tests rather than by a run.
fn parse_generated(raw: &str, name_hint: &str) -> Result<GeneratedSkill, String> {
    let text = from_frontmatter(unwrap_fence(raw));
    let (Some(head), body) = split_frontmatter(text) else {
        return Err(NO_FILE.into());
    };
    let front = serde_norway::from_str::<serde_norway::Value>(head).unwrap_or_default();

    let mut name = sanitize_name(&yaml_str(&front, "name"));
    if name.is_empty() {
        name = sanitize_name(name_hint);
    }
    if name.is_empty() {
        return Err(NO_NAME.into());
    }

    let body = strip_title(body).to_string();
    let mut description = sanitize_description(&yaml_str(&front, "description"));
    if description.is_empty() {
        description = body
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .map(sanitize_description)
            .unwrap_or_default();
    }
    if description.is_empty() {
        return Err(NO_DESCRIPTION.into());
    }

    Ok(GeneratedSkill {
        name,
        description,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLEAN: &str = "---\nname: deploy-web\ndescription: Ships the web app. Use when the user asks to deploy.\n---\n# Deploy Web\n\n1. Run the tests.\n2. Push the build.\n";

    #[test]
    fn clean_skill_file_yields_the_three_fields() {
        let out = parse_generated(CLEAN, "").unwrap();
        assert_eq!(out.name, "deploy-web");
        assert_eq!(
            out.description,
            "Ships the web app. Use when the user asks to deploy."
        );
        assert_eq!(out.body, "1. Run the tests.\n2. Push the build.");
    }

    #[test]
    fn a_fence_around_the_whole_answer_is_unwrapped() {
        let fenced = format!("```markdown\n{CLEAN}```");
        assert_eq!(parse_generated(&fenced, "").unwrap().name, "deploy-web");
        let bare = format!("```\n{CLEAN}```");
        assert_eq!(parse_generated(&bare, "").unwrap().name, "deploy-web");
    }

    #[test]
    fn a_body_code_block_is_not_mistaken_for_a_wrapper() {
        let with_block =
            "---\nname: build\ndescription: Builds it. Use before shipping.\n---\nRun:\n\n```sh\nmake\n```";
        let out = parse_generated(with_block, "").unwrap();
        assert!(out.body.ends_with("```"), "{}", out.body);
    }

    #[test]
    fn prose_before_the_frontmatter_is_discarded() {
        let out = parse_generated(&format!("Here is your skill:\n\n{CLEAN}"), "").unwrap();
        assert_eq!(out.name, "deploy-web");
        assert!(!out.body.contains("Here is"));
    }

    #[test]
    fn a_messy_name_is_sanitized_to_a_legal_folder_name() {
        let raw = "---\nname: Deploy Web!\ndescription: Ships it. Use to deploy.\n---\nstep";
        assert_eq!(parse_generated(raw, "").unwrap().name, "deploy-web");
        assert_eq!(sanitize_name("  my.skill_v2  "), "my-skill-v2");
        assert_eq!(sanitize_name(".system"), "system");
        assert_eq!(sanitize_name("a -- b"), "a-b");
        assert_eq!(sanitize_name(&"a".repeat(70)).len(), MAX_NAME);
    }

    #[test]
    fn a_missing_name_falls_back_to_the_hint() {
        let raw = "---\ndescription: Ships it. Use to deploy.\n---\nstep";
        assert_eq!(parse_generated(raw, "Deploy Web").unwrap().name, "deploy-web");
        assert_eq!(parse_generated(raw, "  ").unwrap_err(), NO_NAME);
    }

    #[test]
    fn angle_brackets_are_stripped_and_the_description_is_capped() {
        let raw = "---\nname: x\ndescription: Reads <file> and writes <out>.\n---\nstep";
        assert_eq!(
            parse_generated(raw, "").unwrap().description,
            "Reads file and writes out."
        );
        let long = format!("---\nname: x\ndescription: {}\n---\nstep", "d".repeat(1200));
        assert_eq!(
            parse_generated(&long, "").unwrap().description.len(),
            MAX_DESCRIPTION
        );
    }

    #[test]
    fn a_missing_description_falls_back_to_the_first_body_line() {
        let raw = "---\nname: deploy-web\n---\n# Deploy Web\n\nShips the web app.\n\n1. Go.";
        assert_eq!(
            parse_generated(raw, "").unwrap().description,
            "Ships the web app."
        );
        assert_eq!(
            parse_generated("---\nname: x\n---\n", "").unwrap_err(),
            NO_DESCRIPTION
        );
    }

    #[test]
    fn an_answer_that_is_not_a_skill_file_is_rejected() {
        assert_eq!(
            parse_generated("I can't help with that.", "hint").unwrap_err(),
            NO_FILE
        );
        assert_eq!(parse_generated("", "hint").unwrap_err(), NO_FILE);
    }

    #[test]
    fn the_prompt_carries_the_request_and_the_hint() {
        let prompt = build_prompt("watch the logs", "log-watch");
        assert!(prompt.contains("watch the logs"));
        assert!(prompt.contains("The user suggests the name log-watch"));
        assert!(!build_prompt("watch the logs", "  ").contains("suggests the name"));
    }
}
