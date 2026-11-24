//! An agent's conversation as a list to read: what the person asked, what the
//! agent said, and each thing it did on one line. Read from the transcript the
//! CLI keeps, so it's the whole conversation and not what the terminal still
//! has on its screen.
//!
//! Transcripts are append-only and reach tens of megabytes, so a reader starts
//! from a tail window that holds what was asked for and from then on parses only
//! what was appended.
use crate::agent_conversation_claude::ClaudeParser;
use crate::agent_conversation_codex::CodexParser;
use crate::agent_session_titles::AgentProvider;
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const INITIAL_TAIL_BYTES: u64 = 512 << 10;
const TAIL_GROWTH: u64 = 4;
/// A prompt is what a person typed or pasted, and the list only has to show
/// which one it was.
pub(crate) const PROMPT_CHARS: usize = 8_000;
pub(crate) const TEXT_CHARS: usize = 40_000;

/// One entry, oldest first. `id` stays the same as the entry changes (a tool call
/// that finishes), so a reader can be told of the change alone.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub(crate) struct Item {
    pub(crate) id: String,
    #[serde(flatten)]
    pub(crate) body: Body,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum Body {
    /// What the person asked.
    Prompt {
        text: String,
        #[serde(skip_serializing_if = "is_zero")]
        images: usize,
    },
    /// What the agent said, as the markdown it wrote.
    Text {
        text: String,
    },
    Tool(ToolCall),
    /// What happened to the conversation itself: interrupted, compacted.
    Notice {
        text: String,
    },
}

/// One thing the agent did, worded to read as a line: "Edited CheckoutForm.tsx".
#[derive(Debug, Clone, PartialEq, Serialize)]
pub(crate) struct ToolCall {
    pub(crate) what: What,
    pub(crate) verb: String,
    /// What `verb` becomes once the call is over.
    #[serde(skip)]
    pub(crate) done: Option<&'static str>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) subject: String,
    /// The subject is a name or a command rather than words.
    #[serde(skip_serializing_if = "is_false")]
    pub(crate) code: bool,
    /// The file it was about, to open.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) added: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) removed: Option<usize>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) note: String,
    pub(crate) state: ToolState,
}

impl ToolCall {
    pub(crate) fn new(what: What, verb: &str, subject: impl Into<String>) -> Self {
        Self {
            what,
            verb: verb.to_string(),
            done: None,
            subject: subject.into(),
            code: false,
            path: String::new(),
            added: None,
            removed: None,
            note: String::new(),
            state: ToolState::Done,
        }
    }

    pub(crate) fn code(mut self) -> Self {
        self.code = true;
        self
    }

    /// Reads as `verb` once it's over.
    pub(crate) fn then(mut self, verb: &'static str) -> Self {
        self.done = Some(verb);
        self
    }

    pub(crate) fn over(&mut self, state: ToolState) {
        if let Some(done) = self.done {
            self.verb = done.to_string();
        }
        self.state = state;
    }

    /// About `path`, named by its last part.
    pub(crate) fn file(what: What, verb: &str, path: &str) -> Self {
        let mut call = Self::new(what, verb, base_name(path)).code();
        call.path = path.to_string();
        call
    }
}

/// What a list may fold: a run of reads and searches is one line.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum What {
    Read,
    Search,
    Edit,
    Run,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolState {
    Running,
    Done,
    Failed,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// One session's transcript: which CLI wrote it, and where.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Transcript {
    pub(crate) provider: AgentProvider,
    pub(crate) path: PathBuf,
}

/// The transcript of a session, or `None` while the CLI hasn't started one.
pub(crate) fn locate(
    project: &str,
    provider: &str,
    session_id: &str,
) -> Result<Option<Transcript>, String> {
    let path = crate::agent_last_answer::transcript_path(project, provider, session_id)?;
    let provider = crate::agent_session_titles::parse_provider(provider)?;
    Ok(path
        .filter(|path| path.is_file())
        .map(|path| Transcript { provider, path }))
}

enum Parser {
    Claude(ClaudeParser),
    Codex(CodexParser),
}

impl Parser {
    fn new(provider: &AgentProvider) -> Self {
        match provider {
            AgentProvider::Claude => Parser::Claude(ClaudeParser::default()),
            AgentProvider::Codex => Parser::Codex(CodexParser::default()),
        }
    }

    fn feed(&mut self, line: &str) {
        match self {
            Parser::Claude(parser) => parser.feed(line),
            Parser::Codex(parser) => parser.feed(line),
        }
    }

    fn items(&self) -> &[Item] {
        match self {
            Parser::Claude(parser) => parser.items(),
            Parser::Codex(parser) => parser.items(),
        }
    }

    /// Only the whole file tells what some of the entries are.
    fn lost(&self) -> bool {
        match self {
            Parser::Claude(parser) => parser.lost(),
            Parser::Codex(parser) => parser.lost(),
        }
    }
}

#[derive(Debug, PartialEq)]
pub(crate) enum Polled {
    Same,
    Grown,
    /// What was read no longer holds: the file was removed or replaced by a shorter
    /// one, or the conversation went back to before what was read of it.
    Gone,
}

/// A transcript being read, kept current by `poll`.
pub(crate) struct Reader {
    transcript: Transcript,
    parser: Parser,
    /// Parsed up to here, always the start of a line.
    offset: u64,
    /// The file's length when it was last read: past `offset` while a record is
    /// still being written.
    seen: u64,
    /// The window opened past the start of the file.
    partial: bool,
}

impl Reader {
    /// Holding at least `want` entries, or all there are.
    pub(crate) fn open(transcript: Transcript, want: usize) -> io::Result<Self> {
        let mut window = INITIAL_TAIL_BYTES;
        loop {
            let reader = Self::from_tail(transcript.clone(), window)?;
            if reader.lost() {
                return Self::open_whole(transcript);
            }
            if reader.items().len() >= want || !reader.partial {
                return Ok(reader);
            }
            window = window.saturating_mul(TAIL_GROWTH);
        }
    }

    pub(crate) fn open_whole(transcript: Transcript) -> io::Result<Self> {
        Self::from_tail(transcript, u64::MAX)
    }

    fn from_tail(transcript: Transcript, window: u64) -> io::Result<Self> {
        let len = std::fs::metadata(&transcript.path)?.len();
        let start = len.saturating_sub(window);
        let mut reader = Self {
            parser: Parser::new(&transcript.provider),
            transcript,
            offset: start,
            seen: len,
            partial: start > 0,
        };
        reader.read_on(start > 0)?;
        Ok(reader)
    }

    pub(crate) fn items(&self) -> &[Item] {
        self.parser.items()
    }

    fn lost(&self) -> bool {
        self.partial && self.parser.lost()
    }

    /// Whether the conversation goes back further than `items`.
    pub(crate) fn partial(&self) -> bool {
        self.partial
    }

    pub(crate) fn poll(&mut self) -> Polled {
        let Ok(meta) = std::fs::metadata(&self.transcript.path) else {
            return Polled::Gone;
        };
        match meta.len() {
            len if len < self.offset => Polled::Gone,
            len if len == self.seen => Polled::Same,
            len => {
                self.seen = len;
                match self.read_on(false) {
                    Ok(()) if !self.lost() => Polled::Grown,
                    _ => Polled::Gone,
                }
            }
        }
    }

    /// Parses the whole lines from `offset` on. A trailing line without its
    /// newline is a record the agent is still writing. A window that opens
    /// mid-file opens mid-record (`mid_line`), and that fragment is not one.
    fn read_on(&mut self, mid_line: bool) -> io::Result<()> {
        let bytes = read_from(&self.transcript.path, self.offset)?;
        let Some(end) = bytes.iter().rposition(|b| *b == b'\n').map(|at| at + 1) else {
            return Ok(());
        };
        let start = if mid_line {
            bytes
                .iter()
                .position(|b| *b == b'\n')
                .map_or(end, |at| at + 1)
        } else {
            0
        };
        for line in String::from_utf8_lossy(&bytes[start..end]).lines() {
            self.parser.feed(line);
        }
        self.offset += end as u64;
        Ok(())
    }
}

fn read_from(path: &Path, offset: u64) -> io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}

pub(crate) fn str_of<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or_default()
}

pub(crate) fn flag(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool) == Some(true)
}

pub(crate) fn list<'a>(value: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}

/// `text` cut to `max` characters, with an ellipsis where it was cut.
pub(crate) fn capped(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((at, _)) => format!("{}…", text[..at].trim_end()),
        None => text.to_string(),
    }
}

/// The last part of a path, written on either platform.
pub(crate) fn base_name(path: &str) -> &str {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
}

#[cfg(test)]
#[path = "agent_conversation_tests.rs"]
mod tests;
