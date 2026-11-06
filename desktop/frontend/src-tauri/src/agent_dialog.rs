// An agent CLI's choice dialog — a permission prompt, an approval, a question
// form — read off the bottom of its terminal screen, so a phone can show it and
// answer it with no lpm window open. The twin of src/agentDialog.ts, which the
// desktop sidebar reads from its own xterm: keep the two in step.
use crate::termgrid::Grid;
use crate::termvt::Parser;
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AgentDialogOption {
    /// The key that picks it: its number.
    pub key: String,
    pub label: String,
    pub description: String,
    #[serde(skip)]
    pub selected: bool,
    /// Picking it opens a text box in the terminal instead of answering.
    pub typed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AgentDialog {
    pub question: String,
    /// What the dialog is about — the command, the file, the reason — top first.
    pub details: Vec<String>,
    pub options: Vec<AgentDialogOption>,
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("agent dialog pattern")
}

static OPTION: LazyLock<Regex> =
    LazyLock::new(|| re(r"^(\s*)([❯›>▶]\s*)?(\d{1,2})\.\s+(\S.*?)\s*$"));
static SOLID_RULE: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*[─━═]{20,}\s*$"));
static ANY_RULE: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*[─━═╌┄┈┅╍-]{8,}\s*$"));
static TRANSCRIPT_LINE: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*[•⏺✔✓✗✻✶]\s"));
static TYPED: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)^(?:type something\.?|chat about this)$"));
static KEY_HINT: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\s\((?:[a-z]|esc|shift\+tab|tab)\)$"));
// Claude draws a question longer than one row beside a │ gutter, with a lone │
// between its paragraphs.
static GUTTER: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*│ ?"));
// A question form's tabs: "☐ Color", or "← ☐ Color  ☐ Size  ✔ Submit →".
static FORM_TABS: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*(?:←\s*)?[☐☒✔]\s"));
static TIP: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)^\s*Tip:"));
static INDENTED: LazyLock<Regex> = LazyLock::new(|| re(r"^\s{2,}\S"));

const MAX_FOOTER_LINES: usize = 3;
const MAX_BODY_LINES: usize = 24;
const MAX_DETAILS: usize = 3;
// A row this close to the screen's width was wrapped by the CLI itself, so the
// indented row under it carries on the same label rather than describing it.
const WRAP_MARGIN: usize = 25;

fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
}

fn width(line: &str) -> usize {
    line.trim_end().chars().count()
}

fn last_option_row<S: AsRef<str>>(lines: &[S]) -> Option<usize> {
    let mut footer = 0;
    for (i, line) in lines.iter().enumerate().rev() {
        let line = line.as_ref();
        if OPTION.is_match(line) {
            return Some(i);
        }
        if !is_blank(line) && !ANY_RULE.is_match(line) {
            footer += 1;
            if footer > MAX_FOOTER_LINES {
                return None;
            }
        }
    }
    None
}

fn option_number(line: &str) -> Option<u32> {
    OPTION.captures(line)?.get(3)?.as_str().parse().ok()
}

/// The row of option 1, walking up from the last option through the rows
/// between them: descriptions, wrapped labels, rules and blank lines.
fn first_option_row<S: AsRef<str>>(lines: &[S], last: usize) -> Option<usize> {
    let mut expected = option_number(lines[last].as_ref())?;
    for i in (0..=last).rev() {
        let line = lines[i].as_ref();
        if let Some(number) = option_number(line) {
            if number != expected {
                return None;
            }
            if expected == 1 {
                return Some(i);
            }
            expected = expected.checked_sub(1)?;
        } else if !is_blank(line) && !ANY_RULE.is_match(line) && !INDENTED.is_match(line) {
            return None;
        }
    }
    None
}

fn read_options<S: AsRef<str>>(
    lines: &[S],
    first: usize,
    last: usize,
    cols: usize,
) -> Vec<AgentDialogOption> {
    let mut options: Vec<AgentDialogOption> = Vec::new();
    let mut above = 0;
    for line in &lines[first..=last] {
        let line = line.as_ref();
        if let Some(m) = OPTION.captures(line) {
            options.push(AgentDialogOption {
                key: m[3].to_string(),
                label: m[4].to_string(),
                description: String::new(),
                selected: m.get(2).is_some(),
                typed: false,
            });
            above = width(line);
            continue;
        }
        let Some(option) = options.last_mut() else {
            above = 0;
            continue;
        };
        if is_blank(line) || ANY_RULE.is_match(line) {
            above = 0;
            continue;
        }
        let text = line.trim();
        if above + WRAP_MARGIN >= cols && option.description.is_empty() {
            // A row cut at the very edge broke a word; one cut short broke at a space.
            if above + 1 < cols {
                option.label.push(' ');
            }
            option.label.push_str(text);
        } else if option.description.is_empty() {
            option.description = text.to_string();
        } else {
            option.description = format!("{} {text}", option.description);
        }
        above = width(line);
    }
    for option in &mut options {
        option.label = KEY_HINT.replace(&option.label, "").into_owned();
        option.typed = TYPED.is_match(&option.label);
    }
    options
}

/// The rows above the options that say what is being asked, top first, up to
/// where the dialog starts: a full-width rule, or the transcript's last entry.
/// Blank rows and rules come back as "", so paragraphs stay apart.
fn read_body<S: AsRef<str>>(lines: &[S], first: usize) -> Vec<String> {
    let mut body = Vec::new();
    let mut filled = 0;
    for line in lines[..first].iter().rev() {
        if filled >= MAX_BODY_LINES {
            break;
        }
        let line = line.as_ref();
        if SOLID_RULE.is_match(line) || TRANSCRIPT_LINE.is_match(line) {
            break;
        }
        if is_blank(line) || ANY_RULE.is_match(line) {
            body.push(String::new());
        } else if !TIP.is_match(line) && !FORM_TABS.is_match(line) {
            body.push(line.trim_end().to_string());
            filled += 1;
        }
    }
    body.reverse();
    body
}

/// Rows of one question back into its text: a paragraph's rows joined by
/// spaces, its paragraphs by newlines.
fn join_rows(rows: &[String]) -> String {
    let mut paragraphs: Vec<Vec<&str>> = vec![Vec::new()];
    for row in rows {
        if !row.is_empty() {
            paragraphs.last_mut().unwrap().push(row);
        } else if !paragraphs.last().unwrap().is_empty() {
            paragraphs.push(Vec::new());
        }
    }
    paragraphs
        .iter()
        .filter(|p| !p.is_empty())
        .map(|p| p.join(" "))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Where the question sits in the body: the gutter's rows, or else the first
/// row ending in "?" and the rows above it the CLI wrapped at the edge.
fn question_rows(body: &[String], cols: usize) -> Option<(usize, usize)> {
    if let Some(start) = body.iter().position(|row| GUTTER.is_match(row)) {
        let mut end = start;
        while end + 1 < body.len() && GUTTER.is_match(&body[end + 1]) {
            end += 1;
        }
        return Some((start, end));
    }
    let end = body.iter().position(|row| row.ends_with('?'))?;
    let mut start = end;
    while start > 0 && body[start - 1].chars().count() + WRAP_MARGIN >= cols {
        start -= 1;
    }
    Some((start, end))
}

fn split_body(body: &[String], cols: usize) -> (String, Vec<String>) {
    let span = question_rows(body, cols);
    let in_question = |i: usize| span.is_some_and(|(start, end)| i >= start && i <= end);
    let question = span
        .map(|(start, end)| {
            let rows: Vec<String> = body[start..=end]
                .iter()
                .map(|row| GUTTER.replace(row, "").trim().to_string())
                .collect();
            join_rows(&rows)
        })
        .unwrap_or_default();
    let details = body
        .iter()
        .enumerate()
        .filter(|(i, row)| !row.is_empty() && !in_question(*i))
        .map(|(_, row)| row.trim().to_string())
        .take(MAX_DETAILS)
        .collect();
    (question, details)
}

/// The dialog at the bottom of `lines` (the screen's rows, top first), or None
/// when the screen ends in anything else. `cols` is the screen's width.
pub fn parse<S: AsRef<str>>(lines: &[S], cols: usize) -> Option<AgentDialog> {
    let last = last_option_row(lines)?;
    let first = first_option_row(lines, last)?;
    let options: Vec<AgentDialogOption> = read_options(lines, first, last, cols)
        .into_iter()
        .filter(|option| option.key.chars().count() == 1)
        .collect();
    if options.len() < 2 || !options.iter().any(|option| option.selected) {
        return None;
    }
    let (question, details) = split_body(&read_body(lines, first), cols);
    Some(AgentDialog {
        question,
        details,
        options,
    })
}

/// Names a dialog by its question and choices, as `sameDialog` compares them:
/// the cursor moving between options leaves it unchanged.
pub fn fingerprint(dialog: &AgentDialog) -> String {
    let mut text = format!("{}\0{}", dialog.question, dialog.details.join("\n"));
    for option in &dialog.options {
        text.push('\0');
        text.push_str(&option.key);
        text.push('\u{1}');
        text.push_str(&option.label);
    }
    hex::encode(&Sha256::digest(text.as_bytes())[..8])
}

/// The rows a screen of `cols` × `rows` shows once `output` is drawn on it.
pub fn screen_rows(output: &str, cols: u16, rows: u16) -> Vec<String> {
    let mut grid = Grid::new(cols.into(), rows.into());
    Parser::default().feed(output.as_bytes(), &mut grid);
    grid.screen_rows()
}

#[cfg(test)]
#[path = "agent_dialog_fixtures.rs"]
mod fixtures;

#[cfg(test)]
#[path = "agent_dialog_tests.rs"]
mod tests;
