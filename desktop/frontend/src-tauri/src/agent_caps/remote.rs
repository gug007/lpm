//! SSH scan. For an SSH project the agent runs on the host, so both the user
//! scope (remote `$HOME`) and the project scope (remote cwd) live there.
//!
//! One `bash` round trip streams candidate files length-framed as
//! `CLI\x1fKIND\x1fSCOPE\x1fNAME\x1fPATH\x1f<bytelen>\n<contents>`, close to the
//! shape `aigen.rs` uses for its command scan. The CLI travels in the frame
//! because only the script knows which root a file came from — deriving it here
//! would mean re-deducing a fact the scan already had. Any ssh failure yields an
//! empty list rather than a wrong one.

use super::scan::describe_content;
use super::{mcp, AgentCapabilities, AgentCapability, CapabilityRoot};
use super::{KIND_COMMAND, KIND_INSTRUCTIONS, KIND_MCP, KIND_SKILL, KIND_SUBAGENT};

const FILE_CAP: usize = 500;
const BYTE_CAP: usize = 65536;

const PREAMBLE: &str = "N=0
emit() {
  [ \"$N\" -ge 500 ] && return 0
  [ -f \"$5\" ] || return 0
  L=$(head -c 65536 \"$5\" | wc -c | tr -d ' ')
  printf '%s\\037%s\\037%s\\037%s\\037%s\\037%s\\n' \"$6\" \"$1\" \"$2\" \"$3\" \"$4\" \"$L\"
  head -c 65536 \"$5\"
  N=$((N+1))
}
";

fn script(dir: &str) -> String {
    format!(
        "{PREAMBLE}CWD={cwd}
scan_md() {{
  [ -d \"$1\" ] || return 0
  while IFS= read -r f; do b=\"${{f##*/}}\"; emit \"$3\" \"$2\" \"${{b%.md}}\" \"$f\" \"$f\" \"$4\"; done < <(find \"$1\" -type f -name '*.md' 2>/dev/null)
}}
scan_skills() {{
  [ -d \"$1\" ] || return 0
  while IFS= read -r f; do d=\"${{f%/*}}\"; emit skill \"$2\" \"${{d##*/}}\" \"$f\" \"$f\" \"$3\"; done < <(find \"$1\" -mindepth 2 -maxdepth 2 -type f -name 'SKILL.md' 2>/dev/null)
}}
scan_skills \"$HOME/.claude/skills\" user claude
scan_md \"$HOME/.claude/commands\" user command claude
scan_md \"$HOME/.claude/agents\" user subagent claude
emit instructions user CLAUDE.md \"$HOME/.claude/CLAUDE.md\" \"$HOME/.claude/CLAUDE.md\" claude
CH=\"${{CODEX_HOME:-$HOME/.codex}}\"
scan_skills \"$CH/skills\" user codex
scan_skills \"$HOME/.agents/skills\" user codex
scan_md \"$CH/prompts\" user command codex
emit instructions user AGENTS.md \"$CH/AGENTS.md\" \"$CH/AGENTS.md\" codex
emit codextoml user config.toml \"$CH/config.toml\" \"$CH/config.toml\" codex
if [ -n \"$CWD\" ]; then
  scan_skills \"$CWD/.claude/skills\" project claude
  scan_md \"$CWD/.claude/commands\" project command claude
  scan_md \"$CWD/.claude/agents\" project subagent claude
  emit instructions project CLAUDE.md \"$CWD/CLAUDE.md\" \"$CWD/CLAUDE.md\" claude
  emit instructions project AGENTS.md \"$CWD/AGENTS.md\" \"$CWD/AGENTS.md\" codex
  emit mcpjson project .mcp.json \"$CWD/.mcp.json\" \"$CWD/.mcp.json\" claude
fi
",
        cwd = crate::config::quote_remote_path(dir)
    )
}

pub fn scan(ssh: &crate::config::SshSettings, dir: &str) -> AgentCapabilities {
    let mut out = AgentCapabilities {
        remote: true,
        ..Default::default()
    };
    // The host's ~/.claude.json holds the user-scope MCP servers and the trust
    // flag, but runs to several megabytes — past the per-file cap, and useless
    // truncated. Say so rather than showing a silently short list.
    out.roots.push(CapabilityRoot {
        cli: "claude".into(),
        scope: "user".into(),
        kind: KIND_MCP.into(),
        path: "~/.claude.json (not scanned over SSH)".into(),
        exists: false,
    });

    let output = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &script(dir)], &[])
        .output();
    let Ok(o) = output else { return out };
    if !o.status.success() {
        return out;
    }
    parse(&o.stdout, &mut out);
    out
}

struct Frame<'a> {
    cli: String,
    kind: String,
    scope: String,
    name: String,
    path: String,
    contents: &'a [u8],
}

fn next_frame<'a>(bytes: &'a [u8], i: &mut usize) -> Option<Frame<'a>> {
    let nl = bytes[*i..].iter().position(|&b| b == b'\n')?;
    let header = &bytes[*i..*i + nl];
    *i += nl + 1;
    let fields: Vec<&[u8]> = header.split(|&b| b == 0x1f).collect();
    if fields.len() != 6 {
        return None;
    }
    let len = std::str::from_utf8(fields[5])
        .ok()?
        .trim()
        .parse::<usize>()
        .ok()?;
    if len > BYTE_CAP || *i + len > bytes.len() {
        return None;
    }
    let contents = &bytes[*i..*i + len];
    *i += len;
    Some(Frame {
        cli: String::from_utf8_lossy(fields[0]).into_owned(),
        kind: String::from_utf8_lossy(fields[1]).into_owned(),
        scope: String::from_utf8_lossy(fields[2]).into_owned(),
        name: String::from_utf8_lossy(fields[3]).into_owned(),
        path: String::from_utf8_lossy(fields[4]).into_owned(),
        contents,
    })
}

fn parse(bytes: &[u8], out: &mut AgentCapabilities) {
    let mut i = 0;
    let mut count = 0;
    while i < bytes.len() && count < FILE_CAP {
        let Some(frame) = next_frame(bytes, &mut i) else {
            break;
        };
        count += 1;
        let text = String::from_utf8_lossy(frame.contents);
        match frame.kind.as_str() {
            "mcpjson" => {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    out.items
                        .extend(mcp::from_json(&json, &frame.cli, "project", &frame.path));
                }
            }
            "codextoml" => out.items.extend(mcp::from_toml(&text, &frame.path)),
            kind => {
                let kind = match kind {
                    "skill" => KIND_SKILL,
                    "command" => KIND_COMMAND,
                    "subagent" => KIND_SUBAGENT,
                    "instructions" => KIND_INSTRUCTIONS,
                    _ => continue,
                };
                let (description, manual) = describe_content(&text);
                let mut cap = AgentCapability::new(&frame.cli, kind, &frame.scope, &frame.name);
                cap.path = frame.path;
                cap.description = description;
                cap.manual = manual;
                cap.bytes = frame.contents.len() as u64;
                // Remote files are read-only in v0: the CAS write path is local.
                cap.editable = false;
                out.items.push(cap);
            }
        }
    }
    out.truncated = count >= FILE_CAP;
}

#[cfg(test)]
mod tests {
    fn frame(header: &str, body: &str) -> Vec<u8> {
        format!("{header}\u{1f}{}\n{body}", body.len()).into_bytes()
    }

    /// The shell script and this parser are the only two places that know the
    /// frame shape. A field added to one and not the other must fail loudly,
    /// not mis-attribute every capability on the host.
    #[test]
    fn a_frame_carries_the_cli_that_produced_it() {
        let header = "codex\u{1f}command\u{1f}user\u{1f}review\u{1f}/h/.codex/prompts/review.md";
        let bytes = frame(header, "hi");
        let mut i = 0;
        let parsed = super::next_frame(&bytes, &mut i).expect("frame parses");
        assert_eq!(parsed.cli, "codex");
        assert_eq!(parsed.kind, "command");
        assert_eq!(parsed.scope, "user");
        assert_eq!(parsed.name, "review");
        assert_eq!(parsed.contents, b"hi");
        assert_eq!(i, bytes.len());
    }

    #[test]
    fn a_header_missing_the_cli_field_is_rejected_rather_than_shifted() {
        let bytes = frame("command\u{1f}user\u{1f}review\u{1f}/p", "hi");
        assert!(super::next_frame(&bytes, &mut 0).is_none());
    }

    /// `$CODEX_HOME/prompts` is scanned over SSH but used to be stamped
    /// "claude", so the CLI filter gave a wrong answer on every remote project.
    #[test]
    fn codex_prompts_are_not_filed_under_claude() {
        let bytes = frame(
            "codex\u{1f}command\u{1f}user\u{1f}review\u{1f}/h/.codex/prompts/review.md",
            "---\ndescription: Review a diff\n---\n",
        );
        let mut out = super::AgentCapabilities::default();
        super::parse(&bytes, &mut out);
        assert_eq!(out.items.len(), 1);
        assert_eq!(out.items[0].cli, "codex");
        assert_eq!(out.items[0].description, "Review a diff");
        assert!(!out.items[0].manual);
    }

    #[test]
    fn a_remote_skill_reports_its_manual_only_frontmatter() {
        let bytes = frame(
            "claude\u{1f}skill\u{1f}user\u{1f}deploy\u{1f}/h/.claude/skills/deploy/SKILL.md",
            "---\ndescription: Ship it\ndisable-model-invocation: true\n---\n",
        );
        let mut out = super::AgentCapabilities::default();
        super::parse(&bytes, &mut out);
        assert_eq!(out.items.len(), 1);
        assert!(out.items[0].manual);
        assert_eq!(out.items[0].description, "Ship it");
    }
}
