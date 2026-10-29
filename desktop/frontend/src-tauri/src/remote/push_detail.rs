//! What a finished turn's notification carries besides "finished": how much the
//! project's uncommitted changes add and remove, and the words the agent ended
//! its turn with, which most often are the question it waits on. Both are disk
//! reads and the transcript settles a moment after the finish is reported, so
//! this runs on the thread that sends the push, never on the event listener.
use crate::status::STATUS_DONE;
use serde_json::{json, Value};

const CLOSING_CHARS: usize = 200;

/// The fields an alert about `key` reaching `status` adds to its payload:
/// `changes` (`{files, added, removed}`) while the project has uncommitted
/// changes, and `summary`, the end of this turn's answer. Empty for anything but
/// a finish.
pub(super) fn of(project: &str, key: &str, status: &str, turn_start: i64) -> Value {
    let mut detail = json!({});
    if status != STATUS_DONE {
        return detail;
    }
    if let Some(changes) = changes(project) {
        detail["changes"] = changes;
    }
    if let Some(summary) = crate::statusbanner::turn_answer(project, key, turn_start)
        .and_then(|answer| closing_paragraph(&answer, CLOSING_CHARS))
    {
        detail["summary"] = json!(summary);
    }
    detail
}

fn changes(project: &str) -> Option<Value> {
    let (root, is_remote) = crate::config::project_root(project).ok()?;
    if is_remote || root.is_empty() {
        return None;
    }
    let stat = crate::gitlines::git_diff_stat(root);
    (stat.files > 0).then(|| {
        json!({
            "files": stat.files,
            "added": stat.lines_added,
            "removed": stat.lines_removed,
        })
    })
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

    #[test]
    fn only_a_finish_carries_detail() {
        assert_eq!(of("no-such-project", "x", "Waiting", 0), json!({}));
    }
}
