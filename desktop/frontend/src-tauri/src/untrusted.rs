//! Text written by someone else, such as an issue or a review, on its way to an
//! agent. A control character in it would reach a terminal as a key press.
use std::sync::LazyLock;

/// Markdown's hidden comments, which issue and review templates are full of, go
/// too.
pub(crate) fn plain(text: &str) -> String {
    static HIDDEN: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"(?s)<!--.*?-->").unwrap());
    let text = text.replace("\r\n", "\n").replace('\t', "    ");
    HIDDEN
        .replace_all(&text, "")
        .chars()
        .filter(|c| *c == '\n' || !c.is_control())
        .collect::<String>()
        .trim()
        .to_string()
}

/// `text` in a fence longer than any run of backticks inside, so a code block in it
/// can't close it early.
pub(crate) fn fenced(text: &str) -> String {
    let longest = text.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let fence = "`".repeat(longest.max(2) + 1);
    format!("{fence}\n{text}\n{fence}")
}

pub(crate) fn one_line(text: &str) -> String {
    plain(text).split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_control_character_never_reaches_the_terminal() {
        assert_eq!(plain("a\u{3}b\u{1b}[201~\u{7f}c\u{9b}d"), "ab[201~cd");
        assert_eq!(plain("one\r\n\ttwo"), "one\n    two");
        assert_eq!(plain("<!-- what\nhappened? -->It broke"), "It broke");
        assert_eq!(one_line(" a\n b\tc "), "a b c");
    }

    #[test]
    fn a_fence_outlasts_the_fences_inside() {
        assert_eq!(fenced("a"), "```\na\n```");
        assert_eq!(fenced("a\n````\nb"), "`````\na\n````\nb\n`````");
    }
}
