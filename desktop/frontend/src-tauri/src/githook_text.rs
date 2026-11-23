// What a failed commit hook printed, made readable, and the few words that say
// what it found ("eslint · 3 errors in src/billing.ts") for the tools commit
// hooks usually run: lint-staged, the pre-commit framework, eslint, tsc, ruff,
// prettier. Anything else gets its first line that reads as an error.
use crate::action_exec::{clip, strip_ansi_keeping};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::OnceLock;

/// Lines of output kept: the end, where a failing check says what failed.
const MAX_LINES: usize = 400;
const SUMMARY_MAX: usize = 100;
const TOOLS_NAMED: usize = 2;

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("valid pattern"))
}

/// One line without colour codes, cursor moves or what a spinner drew over.
fn plain_line(line: &str) -> String {
    let line = match line.trim_end_matches('\r').rsplit_once('\r') {
        Some((_, last)) => last,
        None => line,
    };
    strip_ansi_keeping(line, |c| c == '\t' || !c.is_control())
        .trim_end()
        .to_string()
}

/// The output as it reads in a terminal: no colours or spinner frames, no runs
/// of blank lines, and at most the last `MAX_LINES` lines.
pub(crate) fn clean(raw: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for line in raw.split('\n').map(plain_line) {
        if line.is_empty() && lines.last().is_none_or(|l| l.is_empty()) {
            continue;
        }
        lines.push(line);
    }
    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    if lines.len() > MAX_LINES {
        let cut = lines.len() - MAX_LINES;
        lines.drain(..cut);
        lines.insert(0, format!("… {cut} earlier lines"));
    }
    lines.join("\n")
}

/// The last `n` lines of `text`.
pub(crate) fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

fn plural(n: u64, word: &str) -> String {
    format!("{n} {word}{}", if n == 1 { "" } else { "s" })
}

/// The program a lint-staged task runs: `npx eslint --fix` is eslint.
fn program(task: &str) -> Option<String> {
    task.split_whitespace()
        .find(|word| !matches!(*word, "npx" | "pnpm" | "yarn" | "bunx" | "bun" | "exec" | "run" | "dlx"))
        .map(|word| word.rsplit(['/', '\\']).next().unwrap_or(word).to_string())
        .filter(|name| !name.is_empty())
}

/// A lint-staged row that is a command it ran, not one of its own steps
/// ("Running tasks for staged files...", "*.ts — 1 file") or eslint's tally.
fn is_command(task: &str) -> bool {
    !(task.contains("lint-staged")
        || task.contains('—')
        || task.ends_with("...")
        || task.ends_with('…')
        || task.starts_with(['*', '{', '.'])
        || task.starts_with(char::is_numeric)
        || problems(task).is_some())
}

/// Which checks failed: the pre-commit framework's "name....Failed" rows, or
/// the tasks lint-staged marks with ✖.
fn tools(output: &str) -> Vec<String> {
    static FRAMEWORK: OnceLock<Regex> = OnceLock::new();
    static STAGED: OnceLock<Regex> = OnceLock::new();
    let framework = re(&FRAMEWORK, r"^(\S.*?)\.{3,}.*Failed$");
    let staged = re(
        &STAGED,
        r"^\s*(?:[✖×]\s+(.+?)(?::|\s+\[FAILED\])|\[FAILED\]\s+(.+?)\s+\[FAILED\])\s*$",
    );
    let mut found: Vec<String> = Vec::new();
    for line in output.lines() {
        let name = if let Some(m) = framework.captures(line) {
            Some(m[1].trim().to_string())
        } else if let Some(m) = staged.captures(line) {
            m.get(1)
                .or_else(|| m.get(2))
                .map(|task| task.as_str())
                .filter(|task| is_command(task))
                .and_then(program)
        } else {
            None
        };
        if let Some(name) = name {
            if !found.contains(&name) {
                found.push(name);
            }
        }
    }
    found
}

/// eslint's "✖ 3 problems (3 errors, 0 warnings)": the errors, else the warnings.
fn problems(line: &str) -> Option<String> {
    static ESLINT: OnceLock<Regex> = OnceLock::new();
    let m = re(&ESLINT, r"(\d+) problems? \((\d+) errors?, (\d+) warnings?\)").captures(line)?;
    let errors: u64 = m[2].parse().ok()?;
    let warnings: u64 = m[3].parse().ok()?;
    Some(if errors > 0 {
        plural(errors, "error")
    } else {
        plural(warnings, "warning")
    })
}

/// How many problems the output counts, in a tool's own summary line.
fn count(output: &str) -> Option<String> {
    static FOUND: OnceLock<Regex> = OnceLock::new();
    static PRETTIER: OnceLock<Regex> = OnceLock::new();
    let found = re(&FOUND, r"^Found (\d+) errors?\b");
    let prettier = re(&PRETTIER, r"Code style issues found in (\d+) files?");
    output.lines().find_map(|line| {
        problems(line)
            .or_else(|| {
                let n: u64 = found.captures(line)?[1].parse().ok()?;
                Some(plural(n, "error"))
            })
            .or_else(|| {
                let n: u64 = prettier.captures(line)?[1].parse().ok()?;
                Some(format!("code style issues in {}", plural(n, "file")))
            })
    })
}

/// The files the output reports problems in, as paths inside the project.
fn files(output: &str, root: &str) -> BTreeSet<String> {
    static TSC: OnceLock<Regex> = OnceLock::new();
    static AT: OnceLock<Regex> = OnceLock::new();
    static STYLISH: OnceLock<Regex> = OnceLock::new();
    let tsc = re(&TSC, r"^(\S+?\.\w+)(?:\(\d+,\d+\):|:\d+:\d+ -) error TS\d+");
    let at = re(&AT, r"^([^\s:]+\.\w+):\d+:\d+:? ");
    let stylish = re(&STYLISH, r"^\s+\d+:\d+\s+(?:error|warning)\s");
    let lines: Vec<&str> = output.lines().collect();
    let mut out = BTreeSet::new();
    for (i, line) in lines.iter().enumerate() {
        let path = if let Some(m) = tsc.captures(line).or_else(|| at.captures(line)) {
            Some(m.get(1).map_or("", |p| p.as_str()).to_string())
        } else if !line.starts_with(char::is_whitespace)
            && !line.contains(' ')
            && line.contains('.')
            && lines.get(i + 1).is_some_and(|next| stylish.is_match(next))
        {
            Some(line.to_string())
        } else {
            None
        };
        if let Some(path) = path {
            out.insert(relative(&path, root));
        }
    }
    out
}

fn relative(path: &str, root: &str) -> String {
    let root = root.trim_end_matches(['/', '\\']);
    let inside = path
        .strip_prefix(root)
        .filter(|rest| rest.starts_with(['/', '\\']))
        .map(|rest| &rest[1..])
        .unwrap_or(path);
    inside.strip_prefix("./").unwrap_or(inside).to_string()
}

/// The first line that reads as an error, past a hook manager's own
/// "script failed" line.
fn first_error(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("husky - ") && !line.starts_with("hint:"))
        .find(|line| line.to_lowercase().contains("error") || line.contains('✖'))
        .map(str::to_string)
}

/// What the hook found, in a few words, when its output says: the checks that
/// failed, how many problems, and where.
pub(crate) fn summarize(output: &str, root: &str) -> Option<String> {
    let mut found = tools(output);
    let named = if found.len() > TOOLS_NAMED {
        let more = found.len() - TOOLS_NAMED;
        found.truncate(TOOLS_NAMED);
        Some(format!("{} +{more}", found.join(", ")))
    } else if found.is_empty() {
        None
    } else {
        Some(found.join(", "))
    };
    let files = files(output, root);
    let place = match files.len() {
        0 => None,
        1 => files.iter().next().cloned(),
        n => Some(plural(n as u64, "file")),
    };
    let detail = match (count(output), place) {
        (Some(count), Some(place)) => Some(format!("{count} in {place}")),
        (Some(count), None) => Some(count),
        (None, Some(place)) => Some(format!("problems in {place}")),
        (None, None) => None,
    };
    let parts: Vec<String> = [named, detail].into_iter().flatten().collect();
    if parts.is_empty() {
        return first_error(output).map(|line| clip(&line, SUMMARY_MAX));
    }
    Some(clip(&parts.join(" · "), SUMMARY_MAX))
}
