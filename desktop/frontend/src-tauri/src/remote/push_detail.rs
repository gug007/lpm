//! What a finished turn's notification carries besides "finished": how much the
//! project's uncommitted changes add and remove and the files most changed, and
//! the answer the agent ended its turn with — whole, for the phone's expanded
//! notification, and its last paragraph, which most often is the question it
//! waits on. Both are disk reads and the transcript settles a moment after the
//! finish is reported, so this runs on the thread that sends the push, never on
//! the event listener.
use crate::gitlines::FileLines;
use crate::status::STATUS_DONE;
use serde_json::{json, Value};

const CLOSING_CHARS: usize = 200;

/// How many changed files a finish names, the most changed first.
const LISTED_FILES: usize = 6;

/// The fields an alert about `key` reaching `status` adds to its payload:
/// `changes` (`{files, added, removed}`) and `files` (`[{path, added, removed}]`)
/// while the project has uncommitted changes, and `answer`, this turn's answer,
/// with `summary`, its end. Empty for anything but a finish.
pub(super) fn of(project: &str, key: &str, status: &str, turn_start: i64) -> Value {
    let mut detail = json!({});
    if status != STATUS_DONE {
        return detail;
    }
    if let Some(files) = changed_files(project) {
        detail["changes"] = totals(&files);
        detail["files"] = json!(most_changed(files, LISTED_FILES));
    }
    if let Some(answer) = crate::statusbanner::turn_answer(project, key, turn_start) {
        if let Some(summary) = closing_paragraph(&answer, CLOSING_CHARS) {
            detail["summary"] = json!(summary);
        }
        let answer = answer.replace("\r\n", "\n");
        if !answer.trim().is_empty() {
            detail["answer"] = json!(answer.trim());
        }
    }
    detail
}

fn changed_files(project: &str) -> Option<Vec<FileLines>> {
    let (root, is_remote) = crate::config::project_root(project).ok()?;
    if is_remote || root.is_empty() {
        return None;
    }
    let files = crate::gitlines::git_file_line_counts(root);
    (!files.is_empty()).then_some(files)
}

fn totals(files: &[FileLines]) -> Value {
    let (added, removed) = files
        .iter()
        .fold((0, 0), |(a, r), f| (a + f.added, r + f.removed));
    json!({ "files": files.len(), "added": added, "removed": removed })
}

fn most_changed(mut files: Vec<FileLines>, max: usize) -> Vec<FileLines> {
    files.sort_by_key(|f| std::cmp::Reverse(f.added + f.removed));
    files.truncate(max);
    files
}

/// The last paragraph of prose in `text` as one line, its markdown emphasis
/// dropped, cut at a word to fit `max` characters.
fn closing_paragraph(text: &str, max: usize) -> Option<String> {
    let paragraph = text
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty() && !p.starts_with("```") && !p.starts_with('|'))
        .last()?
        .to_string();
    let line = paragraph
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace("**", "")
        .replace('`', "");
    let line = line.trim_start_matches(['#', '>', ' ']).trim();
    if line.is_empty() {
        return None;
    }
    if line.chars().count() <= max {
        return Some(line.to_string());
    }
    let cut: String = line.chars().take(max - 1).collect();
    let cut = match cut.rfind(' ') {
        Some(space) if space > max / 2 => &cut[..space],
        _ => cut.as_str(),
    };
    Some(format!("{}…", cut.trim_end_matches([' ', ',', ';', ':'])))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closing_paragraph_is_the_last_prose() {
        let answer = "Done — checkout is now a two-step flow:\n\n- **lib/payments.ts** card validation\n- `README.md` docs\n\nAll 23 tests pass. Want me to update the cart badge?";
        assert_eq!(
            closing_paragraph(answer, 200).as_deref(),
            Some("All 23 tests pass. Want me to update the cart badge?")
        );
    }

    #[test]
    fn closing_paragraph_skips_code_and_tables() {
        let answer = "Here is the fix.\n\n```rust\nfn main() {}\n```\n\n| a | b |\n|---|---|";
        assert_eq!(closing_paragraph(answer, 200).as_deref(), Some("Here is the fix."));
    }

    #[test]
    fn closing_paragraph_joins_lines_and_drops_markup() {
        let answer = "## Next\n\nShould I **also** update\nthe `cart` badge?";
        assert_eq!(
            closing_paragraph(answer, 200).as_deref(),
            Some("Should I also update the cart badge?")
        );
        assert_eq!(closing_paragraph("## Summary", 200).as_deref(), Some("Summary"));
        assert_eq!(closing_paragraph("   \n\n  ", 200), None);
    }

    #[test]
    fn closing_paragraph_cuts_at_a_word() {
        let long = "word ".repeat(80);
        let cut = closing_paragraph(&long, 40).unwrap();
        assert!(cut.ends_with('…'));
        assert!(cut.chars().count() <= 40);
        assert!(!cut.contains("wor…"), "cut at a word, not inside one: {cut}");
    }

    fn lines(path: &str, added: u64, removed: u64) -> FileLines {
        FileLines {
            path: path.into(),
            added,
            removed,
        }
    }

    #[test]
    fn totals_count_every_file() {
        let files = [lines("a.ts", 3, 1), lines("b.ts", 0, 4)];
        assert_eq!(
            totals(&files),
            json!({ "files": 2, "added": 3, "removed": 5 })
        );
    }

    #[test]
    fn the_most_changed_files_come_first() {
        let files = vec![
            lines("small.ts", 1, 0),
            lines("big.ts", 40, 3),
            lines("mid.ts", 5, 5),
            lines("tie.ts", 1, 0),
        ];
        let listed: Vec<String> = most_changed(files, 3).into_iter().map(|f| f.path).collect();
        assert_eq!(listed, ["big.ts", "mid.ts", "small.ts"]);
    }

    #[test]
    fn only_a_finish_carries_detail() {
        assert_eq!(of("no-such-project", "x", "Waiting", 0), json!({}));
    }
}
