//! SSH scan. For an SSH project the agent runs on the host, so both the user
//! scope (remote `$HOME`) and the project scope (remote cwd) live there.
//!
//! One `bash` round trip streams candidate files length-framed as
//! `KIND\x1fSCOPE\x1fNAME\x1fPATH\x1f<bytelen>\n<contents>`, the same shape
//! `aigen.rs` uses for its command scan. Any ssh failure yields an empty list
//! rather than a wrong one.

use super::scan::describe_content;
use super::{mcp, AgentCapabilities, AgentCapability, CapabilityRoot};
use super::{KIND_COMMAND, KIND_INSTRUCTIONS, KIND_SKILL, KIND_SUBAGENT};

const FILE_CAP: usize = 500;
const BYTE_CAP: usize = 65536;

const PREAMBLE: &str = "N=0
emit() {
  [ \"$N\" -ge 500 ] && return 0
  [ -f \"$5\" ] || return 0
  L=$(head -c 65536 \"$5\" | wc -c | tr -d ' ')
  printf '%s\\037%s\\037%s\\037%s\\037%s\\n' \"$1\" \"$2\" \"$3\" \"$4\" \"$L\"
  head -c 65536 \"$5\"
  N=$((N+1))
}
";

fn script(dir: &str) -> String {
    format!(
        "{PREAMBLE}CWD={cwd}
scan_md() {{
  [ -d \"$1\" ] || return 0
  while IFS= read -r f; do b=\"${{f##*/}}\"; emit \"$3\" \"$2\" \"${{b%.md}}\" \"$f\" \"$f\"; done < <(find \"$1\" -type f -name '*.md' 2>/dev/null)
}}
scan_skills() {{
  [ -d \"$1\" ] || return 0
  while IFS= read -r f; do d=\"${{f%/*}}\"; emit skill \"$2\" \"${{d##*/}}\" \"$f\" \"$f\"; done < <(find \"$1\" -mindepth 2 -maxdepth 2 -type f -name 'SKILL.md' 2>/dev/null)
}}
scan_skills \"$HOME/.claude/skills\" user
scan_skills \"$HOME/.agents/skills\" user
scan_md \"$HOME/.claude/commands\" user command
scan_md \"$HOME/.claude/agents\" user subagent
emit instructions user CLAUDE.md \"$HOME/.claude/CLAUDE.md\" \"$HOME/.claude/CLAUDE.md\"
CH=\"${{CODEX_HOME:-$HOME/.codex}}\"
scan_md \"$CH/prompts\" user command
emit codextoml user config.toml \"$CH/config.toml\" \"$CH/config.toml\"
if [ -n \"$CWD\" ]; then
  scan_skills \"$CWD/.claude/skills\" project
  scan_md \"$CWD/.claude/commands\" project command
  scan_md \"$CWD/.claude/agents\" project subagent
  emit instructions project CLAUDE.md \"$CWD/CLAUDE.md\" \"$CWD/CLAUDE.md\"
  emit instructions project AGENTS.md \"$CWD/AGENTS.md\" \"$CWD/AGENTS.md\"
  emit mcpjson project .mcp.json \"$CWD/.mcp.json\" \"$CWD/.mcp.json\"
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
    if fields.len() != 5 {
        return None;
    }
    let len = std::str::from_utf8(fields[4])
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
        kind: String::from_utf8_lossy(fields[0]).into_owned(),
        scope: String::from_utf8_lossy(fields[1]).into_owned(),
        name: String::from_utf8_lossy(fields[2]).into_owned(),
        path: String::from_utf8_lossy(fields[3]).into_owned(),
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
                        .extend(mcp::from_json(&json, "claude", "project", &frame.path));
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
                let mut cap = AgentCapability::new("claude", kind, &frame.scope, &frame.name);
                cap.path = frame.path;
                cap.description = describe_content(&text);
                cap.bytes = frame.contents.len() as u64;
                // Remote files are read-only in v0: the CAS write path is local.
                cap.editable = false;
                out.items.push(cap);
            }
        }
    }
    out.truncated = count >= FILE_CAP;
}
