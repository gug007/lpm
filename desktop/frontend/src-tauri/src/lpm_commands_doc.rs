// The SKILL.md behind one lpm skill: Agent Skills frontmatter, then the prompt.
// lpm owns `name`, `description` and its own two `metadata` keys. Every other
// frontmatter entry is carried through, so a hand edit or an imported file keeps
// what it had.
use serde_norway::Value;

const CREATED_KEY: &str = "lpm-created";
const FOLDER_KEY: &str = "lpm-folder";
pub(crate) const MAX_DESCRIPTION_CHARS: usize = 1024;
/// Claude's and Cursor's switch for a skill only the user starts.
const MANUAL_ONLY: &str = "disable-model-invocation: true";

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Doc {
    pub description: String,
    pub body: String,
    /// The `lpm-created` mark: lpm lists and changes only skills that carry it.
    pub created_with_lpm: bool,
    /// Skills sit flat in their root, so a folder in lpm is only this label.
    pub folder: Option<String>,
    /// Top-level frontmatter lines lpm doesn't own, kept as written.
    pub extra: Vec<String>,
    /// `metadata` entries that aren't lpm's.
    pub metadata: Vec<(String, String)>,
}

impl Doc {
    /// A skill lpm creates: marked as lpm's, and started only by the user.
    pub(crate) fn new(description: &str, body: &str, folder: Option<String>) -> Self {
        Self {
            description: description.to_string(),
            body: body.to_string(),
            folder,
            ..Self::default()
        }
        .made_by_lpm()
    }

    /// The same text as a skill of lpm's, for a file that wasn't one.
    pub(crate) fn made_by_lpm(mut self) -> Self {
        self.created_with_lpm = true;
        if !self.extra.iter().any(|l| l.starts_with("disable-model-invocation:")) {
            self.extra.insert(0, MANUAL_ONLY.to_string());
        }
        self
    }

    /// The whole SKILL.md for a skill called `name`. The standard requires a
    /// description, so a skill with none falls back to its name, which
    /// `shown_description` reads back as none.
    pub(crate) fn to_skill(&self, name: &str) -> String {
        let description = self.description.split_whitespace().collect::<Vec<_>>().join(" ");
        let description: String = if description.is_empty() {
            name.to_string()
        } else {
            description.chars().take(MAX_DESCRIPTION_CHARS).collect()
        };
        let mut out = format!("---\nname: {name}\ndescription: {}\n", quote_if_needed(&description));
        for line in &self.extra {
            out.push_str(line);
            out.push('\n');
        }
        if self.created_with_lpm || self.folder.is_some() || !self.metadata.is_empty() {
            out.push_str("metadata:\n");
        }
        for (key, value) in &self.metadata {
            out.push_str(&format!("  {key}: {}\n", quoted(value)));
        }
        if self.created_with_lpm {
            out.push_str(&format!("  {CREATED_KEY}: \"true\"\n"));
        }
        if let Some(folder) = &self.folder {
            out.push_str(&format!("  {FOLDER_KEY}: {}\n", quoted(folder)));
        }
        out.push_str("---\n\n");
        out.push_str(self.body.trim_end());
        out.push('\n');
        out
    }

    pub(crate) fn shown_description(&self, name: &str) -> String {
        if self.description == name {
            String::new()
        } else {
            self.description.clone()
        }
    }
}

pub(crate) fn parse_doc(content: &str) -> Doc {
    let (head, body) = crate::aigen::split_frontmatter(content);
    let Some(head) = head else {
        return Doc {
            body: content.trim_start_matches('\u{feff}').trim_matches(['\r', '\n']).trim_end().to_string(),
            ..Doc::default()
        };
    };
    let yaml = serde_norway::from_str::<Value>(head).ok();
    let mut doc = Doc {
        description: yaml.as_ref().map(|v| crate::aigen::yaml_str(v, "description")).unwrap_or_default(),
        body: body.trim_end().to_string(),
        extra: lines_without_owned(head),
        ..Doc::default()
    };
    for (key, value) in yaml.as_ref().map(metadata_of).unwrap_or_default() {
        match key.as_str() {
            CREATED_KEY => doc.created_with_lpm = value == "true",
            FOLDER_KEY => doc.folder = Some(value).filter(|f| !f.is_empty()),
            _ => doc.metadata.push((key, value)),
        }
    }
    doc
}

fn metadata_of(yaml: &Value) -> Vec<(String, String)> {
    let Some(map) = yaml.get("metadata").and_then(Value::as_mapping) else {
        return Vec::new();
    };
    map.iter()
        .filter_map(|(key, value)| {
            let text = match value {
                Value::String(s) => s.clone(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                _ => return None,
            };
            Some((key.as_str()?.to_string(), text))
        })
        .collect()
}

/// The frontmatter without the entries lpm writes itself, the indented lines of
/// a folded description or a metadata block included.
fn lines_without_owned(head: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_owned = false;
    for line in head.lines().map(|l| l.trim_end_matches('\r')) {
        if ["name:", "description:", "metadata:"].iter().any(|k| line.starts_with(k)) {
            in_owned = true;
            continue;
        }
        if in_owned && (line.is_empty() || line.starts_with([' ', '\t'])) {
            continue;
        }
        in_owned = false;
        out.push(line.to_string());
    }
    out
}

/// A plain YAML scalar when it reads back as itself, else a double-quoted one
/// (JSON strings are valid YAML).
fn quote_if_needed(value: &str) -> String {
    match serde_norway::from_str::<Value>(value) {
        Ok(Value::String(s)) if s == value => value.to_string(),
        _ => quoted(value),
    }
}

fn quoted(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}
