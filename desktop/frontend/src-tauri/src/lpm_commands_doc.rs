// The Markdown file behind one lpm command: an optional YAML frontmatter with a
// `description:` line, then the prompt. It reads the frontmatter the way the
// agents' own `/` menus do (aigen), and carries every other frontmatter line
// through untouched, so a file copied from Claude Code keeps what it had.

pub(crate) struct Doc {
    pub description: String,
    pub body: String,
    /// Frontmatter lines other than the `description:` entry, kept as written.
    pub extra: Vec<String>,
}

pub(crate) fn parse_doc(content: &str) -> Doc {
    let (head, body) = crate::aigen::split_frontmatter(content);
    let Some(head) = head else {
        return Doc {
            description: String::new(),
            body: content.trim_start_matches('\u{feff}').trim_matches(['\r', '\n']).trim_end().to_string(),
            extra: Vec::new(),
        };
    };
    let description = serde_norway::from_str::<serde_norway::Value>(head)
        .map(|v| crate::aigen::yaml_str(&v, "description"))
        .unwrap_or_default();
    Doc {
        description,
        body: body.trim_end().to_string(),
        extra: lines_but_description(head),
    }
}

/// The frontmatter without its `description:` entry, a folded or literal
/// block's indented lines included.
fn lines_but_description(head: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_description = false;
    for line in head.lines().map(|l| l.trim_end_matches('\r')) {
        if line.starts_with("description:") {
            in_description = true;
            continue;
        }
        if in_description && (line.is_empty() || line.starts_with([' ', '\t'])) {
            continue;
        }
        in_description = false;
        out.push(line.to_string());
    }
    out
}

pub(crate) fn serialize_doc(description: &str, body: &str, extra: &[String]) -> String {
    let description = description.split_whitespace().collect::<Vec<_>>().join(" ");
    let body = body.trim_end();
    if description.is_empty() && extra.is_empty() {
        return format!("{body}\n");
    }
    let mut out = String::from("---\n");
    if !description.is_empty() {
        out.push_str(&format!("description: {}\n", quote_if_needed(&description)));
    }
    for line in extra {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str("---\n\n");
    out.push_str(body);
    out.push('\n');
    out
}

/// A plain YAML scalar when it reads back as itself, else a double-quoted one
/// (JSON strings are valid YAML).
fn quote_if_needed(value: &str) -> String {
    let plain = !value.contains(": ")
        && !value.contains(" #")
        && !value.ends_with(':')
        && !value.starts_with(|c: char| "\"'[]{}&*!|>%@`#,?-".contains(c));
    if plain {
        value.to_string()
    } else {
        serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
    }
}
