//! `{{key}}` input substitution into an action's shell command. Each answer is
//! quoted for the spot its token sits in — bare, inside "…", or inside '…' — so
//! it always stays one piece of data: `echo "hi {{name}}"` with `Ana Smith`
//! runs `echo "hi "'Ana Smith'""`, never `echo "hi 'Ana Smith'"`, and a `$(…)`
//! answer is never expanded. `{{key|raw}}` splices the answer verbatim.
//! Mirrors substituteCommand in commandInputs.ts.
//!
//! The shell reads `…` twice: it takes the backslash off \\, \`, \$ (and \"
//! inside "…"), then runs what's left as a command of its own. So the inside
//! is unescaped, substituted as that command, and escaped back.

use std::collections::HashMap;

#[derive(Clone, Copy)]
enum Context {
    Bare,
    Double,
    Single,
    Group,
}

/// Characters that pass through a POSIX shell unquoted. Matches shellSafeValue
/// in commandInputs.ts.
fn shell_safe(v: &str) -> bool {
    !v.is_empty()
        && v.bytes().all(|b| {
            b.is_ascii_alphanumeric()
                | matches!(
                    b,
                    b'_' | b'@' | b'%' | b'+' | b'=' | b':' | b',' | b'.' | b'/' | b'-'
                )
        })
}

fn quoted(v: &str, ctx: Context) -> String {
    if shell_safe(v) {
        return v.to_string();
    }
    let single = crate::config::shell_quote(v);
    match ctx {
        Context::Bare | Context::Group => single,
        Context::Double if v.is_empty() => String::new(),
        Context::Double => format!("\"{single}\""),
        Context::Single => v.replace('\'', "'\\''"),
    }
}

fn backtick_escaped(c: char, in_double: bool) -> bool {
    matches!(c, '\\' | '`' | '$') || (in_double && c == '"')
}

fn backtick_body(raw: &str, in_double: bool) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        match chars.peek() {
            Some(&next) if c == '\\' && backtick_escaped(next, in_double) => {
                out.push(next);
                chars.next();
            }
            _ => out.push(c),
        }
    }
    out
}

fn backtick_raw(body: &str, in_double: bool) -> String {
    let mut out = String::with_capacity(body.len());
    for c in body.chars() {
        if backtick_escaped(c, in_double) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Where the `…` that `s` opens with closes.
fn backtick_end(s: &str) -> Option<usize> {
    let mut chars = s.char_indices().skip(1);
    while let Some((i, c)) = chars.next() {
        match c {
            '\\' => {
                chars.next();
            }
            '`' => return Some(i),
            _ => {}
        }
    }
    None
}

pub(crate) fn substitute_cmd(cmd: &str, values: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(cmd.len());
    let mut stack: Vec<Context> = Vec::new();
    let mut rest = cmd;
    while let Some(c) = rest.chars().next() {
        let ctx = stack.last().copied().unwrap_or(Context::Bare);
        if let Some((token, len)) = token_at(rest, values) {
            out.push_str(&match token {
                Token::Raw(v) => v.to_string(),
                Token::Quoted(v) => quoted(v, ctx),
            });
            rest = &rest[len..];
            continue;
        }
        let tick_end = (c == '`' && !matches!(ctx, Context::Single))
            .then(|| backtick_end(rest))
            .flatten();
        if let Some(end) = tick_end {
            let in_double = matches!(ctx, Context::Double);
            let body = substitute_cmd(&backtick_body(&rest[1..end], in_double), values);
            out.push('`');
            out.push_str(&backtick_raw(&body, in_double));
            out.push('`');
            rest = &rest[end + 1..];
            continue;
        }
        let mut len = c.len_utf8();
        match (ctx, c) {
            (Context::Single, '\'') | (Context::Double, '"') | (Context::Group, ')') => {
                stack.pop();
            }
            (Context::Single, _) => {}
            (_, '\\') => len += rest[len..].chars().next().map_or(0, char::len_utf8),
            (_, '$') if rest[1..].starts_with('(') => {
                stack.push(Context::Group);
                len += 1;
            }
            (Context::Double, _) => {}
            (_, '\'') => stack.push(Context::Single),
            (_, '"') => stack.push(Context::Double),
            (_, '(') => stack.push(Context::Group),
            _ => {}
        }
        out.push_str(&rest[..len]);
        rest = &rest[len..];
    }
    out
}

enum Token<'a> {
    Raw(&'a str),
    Quoted(&'a str),
}

fn token_at<'a>(s: &str, values: &'a HashMap<String, String>) -> Option<(Token<'a>, usize)> {
    let inner = s.strip_prefix("{{")?;
    let end = inner.find("}}")?;
    let name = &inner[..end];
    let token = match name.strip_suffix("|raw") {
        Some(key) => Token::Raw(values.get(key)?),
        None => Token::Quoted(values.get(name)?),
    };
    Some((token, end + 4))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(cmd: &str, pairs: &[(&str, &str)]) -> String {
        let values = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        substitute_cmd(cmd, &values)
    }

    #[test]
    fn bare_values_are_single_quoted_unless_safe() {
        assert_eq!(sub("deploy --env {{env}}", &[("env", "staging")]), "deploy --env staging");
        assert_eq!(sub("git tag {{tag}}", &[("tag", "v1 final")]), "git tag 'v1 final'");
        assert_eq!(sub("echo {{msg}}", &[("msg", "it's")]), "echo 'it'\\''s'");
        assert_eq!(sub("run {{flag}}", &[("flag", "")]), "run ''");
    }

    #[test]
    fn inside_double_quotes_the_string_is_closed_around_the_answer() {
        assert_eq!(
            sub("echo \"hello {{who}} from {{place}}\"", &[("who", "Ana Smith"), ("place", "office")]),
            "echo \"hello \"'Ana Smith'\" from office\""
        );
        assert_eq!(sub("echo \"{{x}}\"", &[("x", "$(whoami)")]), "echo \"\"'$(whoami)'\"\"");
        assert_eq!(sub("echo \"[{{x}}]\"", &[("x", "")]), "echo \"[]\"");
    }

    #[test]
    fn inside_single_quotes_only_the_quote_is_escaped() {
        assert_eq!(sub("echo 'hi {{x}}!'", &[("x", "it's me")]), "echo 'hi it'\\''s me!'");
    }

    #[test]
    fn command_substitution_resets_the_quoting() {
        assert_eq!(
            sub("echo \"$(printf %s {{x}})\" {{y}}", &[("x", "a b"), ("y", "c d")]),
            "echo \"$(printf %s 'a b')\" 'c d'"
        );
    }

    #[test]
    fn inside_backticks_the_answer_is_quoted_for_the_command_they_run() {
        assert_eq!(
            sub("echo \"`echo {{x}}`\"", &[("x", "$(whoami)")]),
            "echo \"`echo '\\$(whoami)'`\""
        );
        assert_eq!(
            sub("echo `echo {{x}}`", &[("x", "a`b")]),
            "echo `echo 'a\\`b'`"
        );
        assert_eq!(
            sub("echo \"`echo \\\"{{x}}\\\"`\"", &[("x", "$(whoami)")]),
            "echo \"`echo \\\"\\\"'\\$(whoami)'\\\"\\\"`\""
        );
        assert_eq!(
            sub("echo \"`date \\\"+%Y\\\"` {{x}}\"", &[("x", "a b")]),
            "echo \"`date \\\"+%Y\\\"` \"'a b'\"\""
        );
        assert_eq!(sub("echo '`{{x}}`'", &[("x", "a b")]), "echo '`a b`'");
    }

    #[test]
    fn escaped_quotes_do_not_open_a_string() {
        assert_eq!(sub("echo \\\"{{x}}", &[("x", "a b")]), "echo \\\"'a b'");
        assert_eq!(sub("echo \"a\\\"{{x}}\"", &[("x", "a b")]), "echo \"a\\\"\"'a b'\"\"");
    }

    #[test]
    fn raw_tokens_and_unknown_keys() {
        assert_eq!(sub("sh -c {{frag|raw}}", &[("frag", "a | b")]), "sh -c a | b");
        assert_eq!(sub("echo {{other}} {{x}}", &[("x", "y")]), "echo {{other}} y");
    }
}
