// How the Search view matches a line, shared by the search and by replace so
// a replace changes exactly what its preview showed: ripgrep's matcher, one
// line at a time, and what each match becomes when a replacement is typed.
use grep_matcher::{Captures, Matcher};
use grep_regex::{RegexCaptures, RegexMatcher, RegexMatcherBuilder};
use serde::Deserialize;

#[derive(Deserialize, Default, Clone, Copy)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    pub match_case: bool,
    pub whole_word: bool,
    pub regex: bool,
}

/// ripgrep's settings: one line at a time, so `^`/`$` anchor to lines and no
/// match runs past a line's end.
pub(crate) fn build_matcher(query: &str, options: SearchOptions) -> Result<RegexMatcher, String> {
    RegexMatcherBuilder::new()
        .case_insensitive(!options.match_case)
        .word(options.whole_word)
        .fixed_strings(!options.regex)
        .multi_line(true)
        .line_terminator(Some(b'\n'))
        .build(query)
        .map_err(|e| regex_reason(&e.to_string()))
}

// A regex error comes over several lines, the pattern and a caret under it
// first; the last line names the problem.
fn regex_reason(message: &str) -> String {
    let last = message
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or(message);
    last.trim().trim_start_matches("error:").trim().to_string()
}

/// What a search looks for, and with a replacer, what each hit becomes.
pub(crate) struct Pattern {
    pub matcher: RegexMatcher,
    pub replacer: Option<Replacer>,
}

/// A regex replacement takes `$1` and `${name}` from the match; a plain one
/// is used as typed.
pub(crate) enum Replacer {
    Literal(String),
    Template(String),
}

impl Replacer {
    pub fn new(text: &str, regex: bool) -> Self {
        if regex {
            Replacer::Template(text.to_string())
        } else {
            Replacer::Literal(text.to_string())
        }
    }

    fn expand(&self, matcher: &RegexMatcher, caps: &RegexCaptures, haystack: &[u8]) -> String {
        match self {
            Replacer::Literal(text) => text.clone(),
            Replacer::Template(template) => {
                let mut dst = Vec::new();
                caps.interpolate(
                    |name| matcher.capture_index(name),
                    haystack,
                    template.as_bytes(),
                    &mut dst,
                );
                String::from_utf8_lossy(&dst).into_owned()
            }
        }
    }
}

/// Calls `f(start, end, replacement)` for each match in one line, in byte
/// offsets and in order; `f` returns false to stop.
pub(crate) fn for_each_match(
    pattern: &Pattern,
    text: &str,
    mut f: impl FnMut(usize, usize, Option<String>) -> bool,
) {
    let bytes = text.as_bytes();
    let whole = |start: usize, end: usize| {
        start < end && text.is_char_boundary(start) && text.is_char_boundary(end)
    };
    let Some(replacer) = &pattern.replacer else {
        let _ = pattern.matcher.find_iter(bytes, |m| {
            !whole(m.start(), m.end()) || f(m.start(), m.end(), None)
        });
        return;
    };
    let Ok(mut caps) = pattern.matcher.new_captures() else {
        return;
    };
    let _ = pattern.matcher.captures_iter(bytes, &mut caps, |caps| {
        let Some(m) = caps.get(0) else {
            return true;
        };
        if !whole(m.start(), m.end()) {
            return true;
        }
        f(
            m.start(),
            m.end(),
            Some(replacer.expand(&pattern.matcher, caps, bytes)),
        )
    });
}

pub(crate) fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}
