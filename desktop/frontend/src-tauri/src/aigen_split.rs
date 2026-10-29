// The commit dialog's Split: an AI reads the selected changes and groups them
// into a few commits by topic, each with its own message. The dialog then
// commits the groups one after another.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct CommitGroup {
    pub message: String,
    pub files: Vec<String>,
}

const MAX_COMMITS: usize = 5;

const SPLIT_PROMPT: &str = r#"Split the following uncommitted changes into a few focused git commits, grouped by topic.

Rules:
- Use between 1 and 5 commits. Use 1 when the changes are a single topic.
- Put every listed file in exactly one commit, with its path exactly as listed.
- Order the commits so each one makes sense on top of the ones before it.
- Write each message in conventional commit format: type(scope): description. Keep the first line under 72 characters; a blank line and a brief body may follow.

Output ONLY JSON in this shape. No code fences. No explanation.
{"commits":[{"message":"feat(scope): description","files":["path/one","path/two"]}]}

"#;

#[tauri::command(async)]
pub fn generate_commit_split(
    app: AppHandle,
    project_name: String,
    cwd: String,
    cli: String,
    model: String,
    effort: String,
    fast: bool,
    files: Vec<String>,
    task_description: String,
    gen_id: String,
) -> Result<Vec<CommitGroup>, String> {
    if files.len() < 2 {
        return Err("Select at least two files to split.".into());
    }
    let diff = crate::aigen::commit_diff(&cwd, files.clone())?;
    let instructions = crate::templates::resolve_instructions(&project_name, "commit");
    let prompt = split_prompt(&files, &instructions, &task_description, &diff);
    let raw = crate::aigen::run_ai(
        &app,
        &cli,
        &cwd,
        &prompt,
        crate::aigen::ropts(Some(&project_name), model, effort, fast, false),
        "commit-msg-progress",
        &gen_id,
    )?;
    parse_split(&raw, &files)
}

fn split_prompt(files: &[String], instructions: &str, task: &str, diff: &str) -> String {
    let mut prompt = SPLIT_PROMPT.to_string();
    if !instructions.is_empty() {
        prompt.push_str(&format!(
            "Instructions from the user for commit messages:\n{instructions}\n\n"
        ));
    }
    let task = task.trim();
    if !task.is_empty() {
        prompt.push_str(&format!("The changes implement this task:\n{task}\n\n"));
    }
    prompt.push_str("Files:\n");
    for file in files {
        prompt.push_str(&format!("- {file}\n"));
    }
    prompt.push_str(&format!("\nDiff:\n{diff}"));
    prompt
}

#[derive(Deserialize)]
struct SplitReply {
    commits: Vec<CommitGroup>,
}

/// The commits the AI proposed, made to cover `files` exactly: paths it made
/// up and repeats are dropped, files it left out join the last commit, and
/// commits left with no files go.
fn parse_split(raw: &str, files: &[String]) -> Result<Vec<CommitGroup>, String> {
    const UNREADABLE: &str = "The AI's answer wasn't a list of commits. Try again.";
    let json = json_object(raw).ok_or(UNREADABLE)?;
    let reply: SplitReply = serde_json::from_str(json).map_err(|_| UNREADABLE.to_string())?;
    let known: HashSet<&str> = files.iter().map(String::as_str).collect();
    let mut placed: HashSet<String> = HashSet::new();
    let mut groups: Vec<CommitGroup> = Vec::new();
    for commit in reply.commits {
        let message = commit.message.trim().to_string();
        if message.is_empty() {
            continue;
        }
        let files: Vec<String> = commit
            .files
            .into_iter()
            .map(|f| f.trim().to_string())
            .filter(|f| known.contains(f.as_str()) && placed.insert(f.clone()))
            .collect();
        if !files.is_empty() {
            groups.push(CommitGroup { message, files });
        }
    }
    if groups.is_empty() {
        return Err(UNREADABLE.into());
    }
    if groups.len() > MAX_COMMITS {
        let extra: Vec<String> = groups
            .drain(MAX_COMMITS..)
            .flat_map(|group| group.files)
            .collect();
        groups[MAX_COMMITS - 1].files.extend(extra);
    }
    let left: Vec<String> = files
        .iter()
        .filter(|f| !placed.contains(*f))
        .cloned()
        .collect();
    if let Some(last) = groups.last_mut() {
        last.files.extend(left);
    }
    Ok(groups)
}

fn json_object(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    (end > start).then(|| &raw[start..=end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(paths: &[&str]) -> Vec<String> {
        paths.iter().map(|p| p.to_string()).collect()
    }

    fn group(message: &str, paths: &[&str]) -> CommitGroup {
        CommitGroup {
            message: message.into(),
            files: files(paths),
        }
    }

    #[test]
    fn reads_the_proposed_commits() {
        let raw = r#"{"commits":[{"message":"feat(billing): verify webhook signatures","files":["src/route.ts","src/stripe.ts"]},{"message":"chore(deps): bump stripe","files":["package.json"]}]}"#;
        assert_eq!(
            parse_split(
                raw,
                &files(&["src/route.ts", "src/stripe.ts", "package.json"])
            )
            .unwrap(),
            vec![
                group(
                    "feat(billing): verify webhook signatures",
                    &["src/route.ts", "src/stripe.ts"]
                ),
                group("chore(deps): bump stripe", &["package.json"]),
            ]
        );
    }

    #[test]
    fn reads_json_wrapped_in_a_fence_or_prose() {
        let raw = "Here you go:\n```json\n{\"commits\":[{\"message\":\"fix: a\",\"files\":[\"a\",\"b\"]}]}\n```";
        assert_eq!(
            parse_split(raw, &files(&["a", "b"])).unwrap(),
            vec![group("fix: a", &["a", "b"])]
        );
    }

    #[test]
    fn covers_every_file_exactly_once() {
        let raw = r#"{"commits":[
            {"message":"feat: one","files":["a","made/up.ts","a"]},
            {"message":"fix: two","files":["b","a"]},
            {"message":"   ","files":["c"]},
            {"message":"docs: empty","files":[]}
        ]}"#;
        assert_eq!(
            parse_split(raw, &files(&["a", "b", "c", "d"])).unwrap(),
            vec![
                group("feat: one", &["a"]),
                group("fix: two", &["b", "c", "d"])
            ]
        );
    }

    #[test]
    fn folds_commits_past_the_fifth_into_it() {
        let commits: Vec<String> = (1..=7)
            .map(|i| format!(r#"{{"message":"fix: {i}","files":["f{i}"]}}"#))
            .collect();
        let raw = format!(r#"{{"commits":[{}]}}"#, commits.join(","));
        let all: Vec<String> = (1..=7).map(|i| format!("f{i}")).collect();
        let groups = parse_split(&raw, &all).unwrap();
        assert_eq!(groups.len(), 5);
        assert_eq!(groups[4].files, files(&["f5", "f6", "f7"]));
    }

    #[test]
    fn refuses_an_answer_with_no_usable_commit() {
        assert!(parse_split("I can't do that.", &files(&["a"])).is_err());
        assert!(parse_split(r#"{"commits":[]}"#, &files(&["a"])).is_err());
        assert!(parse_split(
            r#"{"commits":[{"message":"x","files":["zzz"]}]}"#,
            &files(&["a"])
        )
        .is_err());
    }

    #[test]
    fn the_prompt_lists_every_file_and_the_instructions() {
        let prompt = split_prompt(
            &files(&["src/a.ts", "README.md"]),
            "Write in English.",
            "Add billing",
            "diff --git a/src/a.ts b/src/a.ts",
        );
        assert!(prompt.contains("- src/a.ts\n- README.md\n"));
        assert!(
            prompt.contains("Instructions from the user for commit messages:\nWrite in English.")
        );
        assert!(prompt.contains("The changes implement this task:\nAdd billing"));
        assert!(prompt.ends_with("Diff:\ndiff --git a/src/a.ts b/src/a.ts"));
    }
}
