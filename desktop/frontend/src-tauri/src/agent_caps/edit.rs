//! Changing what a skill's form owns — what it says it does, whether the agent
//! may reach for it on its own, and the prose it reads once it opens it — in a
//! file the user may have written by hand.
//!
//! The rewrite is line-based rather than a YAML round-trip: parsing and
//! re-emitting the frontmatter would reorder keys, drop comments and requote
//! values the author chose, so a one-word description change would arrive as a
//! whole-file diff. Only the description entry and the opt-out key are touched;
//! every other byte of the frontmatter survives. The prose under it is replaced
//! only when the form hands some back — a body nobody edited is never rewritten.

use serde_norway::{Mapping, Value};
use std::path::Path;

use super::skills::{
    ensure_local, resolve_skill_dir, skill_roots, CODEX_OPT_OUT, MAX_CONTENT_BYTES,
};

/// Mirrors `skillDescriptionError` in the form, so a description the field
/// accepts is one this command accepts.
const DESCRIPTION_MAX: usize = 1024;

#[tauri::command(async)]
pub fn update_agent_skill(
    cwd: String,
    path: String,
    baseline: String,
    description: String,
    manual: bool,
    instructions: Option<String>,
) -> Result<(), String> {
    ensure_local(&cwd, "Edit")?;
    let dir = resolve_skill_dir(Path::new(&path), &skill_roots(&cwd))?;
    validate_description(&description)?;
    validate_instructions(instructions.as_deref())?;

    let skill_md = dir.join("SKILL.md");
    let current = std::fs::read_to_string(&skill_md)
        .map_err(|e| format!("cannot read {}: {e}", skill_md.display()))?;
    // Same contract as `write_agent_capability`: the pane offers to reload
    // rather than clobbering whatever the agent wrote while the form was open.
    if current != baseline {
        return Err("modified".into());
    }
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    let updated = rewrite(
        &current,
        name,
        &description,
        manual,
        instructions.as_deref(),
    );
    if updated.len() as u64 > MAX_CONTENT_BYTES {
        return Err(format!("cannot write {}: too large", skill_md.display()));
    }

    // The two markers move together or neither does: half a toggle leaves a
    // skill the user meant to hold back open to the other CLI. The sidecar goes
    // first because it is the one that can be put back.
    let sidecar = dir.join("agents/openai.yaml");
    let before = read_sidecar(&sidecar)?;
    sync_opt_out(&sidecar, before.as_deref(), manual)?;
    if let Err(e) = crate::fsatomic::write(
        &skill_md,
        updated.as_bytes(),
        crate::fsatomic::Mode::Preserve(0o644),
    ) {
        restore_sidecar(&sidecar, before.as_deref());
        return Err(format!("cannot write {}: {e}", skill_md.display()));
    }
    Ok(())
}

fn validate_description(description: &str) -> Result<(), String> {
    if description.trim().is_empty() {
        return Err("Say what it does and when to use it.".into());
    }
    if description.chars().count() > DESCRIPTION_MAX {
        return Err("That's longer than a description can be.".into());
    }
    // Both CLIs drop a skill whose description contains an angle bracket, and
    // report only an aggregate count of what they skipped.
    if description.contains('<') || description.contains('>') {
        return Err("Skip the < and > characters here.".into());
    }
    Ok(())
}

/// Mirrors `skillInstructionsError` in the form: a skill whose file says
/// nothing is a name the agent can open and learn nothing from.
fn validate_instructions(instructions: Option<&str>) -> Result<(), String> {
    match instructions {
        Some(text) if text.trim().is_empty() => {
            Err("Say what the agent should do once it opens this.".into())
        }
        _ => Ok(()),
    }
}

// ---- the file ----------------------------------------------------------------

/// A top-level `key: value` entry's key, or None for anything else — an
/// indented line, a comment, a list item, a block scalar's contents.
fn frontmatter_key(line: &str) -> Option<&str> {
    let line = line.trim_end_matches('\r');
    if line.starts_with([' ', '\t']) {
        return None;
    }
    let key = line.split_once(':')?.0.trim_end();
    let named = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    named.then_some(key)
}

/// Index of the closing `---`, when the file opens with a frontmatter block.
/// Deliberately as permissive as `aigen::split_frontmatter`'s own scan: a file
/// the reader sees frontmatter in must not be one this rewrite prepends a
/// second block to.
fn frontmatter_close(lines: &[&str]) -> Option<usize> {
    if lines.first()?.trim_end_matches('\r') != "---" {
        return None;
    }
    lines
        .iter()
        .skip(1)
        .position(|l| l.trim_end_matches('\r').starts_with("---"))
        .map(|i| i + 1)
}

/// The lines the description entry occupies. A block scalar carries its
/// indented and blank continuation lines with it; anything else is one line.
fn description_span(head: &[&str]) -> Option<(usize, usize)> {
    let start = head
        .iter()
        .position(|l| frontmatter_key(l) == Some("description"))?;
    let value = head[start]
        .trim_end_matches('\r')
        .split_once(':')
        .map(|(_, v)| v.trim())
        .unwrap_or_default();
    let mut end = start + 1;
    if value.starts_with('>') || value.starts_with('|') {
        while end < head.len() {
            let line = head[end].trim_end_matches('\r');
            if line.trim().is_empty() || line.starts_with([' ', '\t']) {
                end += 1;
            } else {
                break;
            }
        }
    }
    Some((start, end))
}

/// The description entry as the create form writes it, byte for byte, so a
/// skill lpm made and a skill lpm edited read the same.
fn description_entry(description: &str, manual: bool, eol: &str) -> Vec<String> {
    let mut out = Vec::new();
    if description.contains('\n') {
        out.push(format!("description: >-{eol}"));
        for line in description.split('\n') {
            let folded = format!("  {}", line.trim());
            out.push(format!("{}{eol}", folded.trim_end()));
        }
    } else {
        let quoted = description.replace('\\', "\\\\").replace('"', "\\\"");
        out.push(format!("description: \"{quoted}\"{eol}"));
    }
    if manual {
        out.push(format!("disable-model-invocation: true{eol}"));
    }
    out
}

/// The prose under the frontmatter as the form hands it back: every line takes
/// the file's own line ending, and the block ends in a single newline the way
/// the create template writes one.
fn body_lines(text: &str, eol: &str) -> Vec<String> {
    let mut out: Vec<String> = text
        .trim_end()
        .split('\n')
        .map(|line| format!("{}{eol}", line.trim_end_matches('\r')))
        .collect();
    out.push(String::new());
    out
}

fn rewrite_head(head: &[&str], entry: &[String]) -> Vec<String> {
    let span = description_span(head);
    let mut out: Vec<String> = Vec::new();
    let mut name_at: Option<usize> = None;
    let mut placed = false;
    let mut i = 0;
    while i < head.len() {
        if let Some((start, end)) = span {
            if i == start {
                out.extend(entry.iter().cloned());
                placed = true;
                i = end;
                continue;
            }
        }
        let line = head[i];
        i += 1;
        match frontmatter_key(line) {
            Some("disable-model-invocation") => continue,
            Some("name") => name_at = Some(out.len()),
            _ => {}
        }
        out.push(line.to_string());
    }
    if !placed {
        let at = name_at.map_or(0, |n| n + 1);
        out.splice(at..at, entry.iter().cloned());
    }
    out
}

fn rewrite(
    content: &str,
    name: &str,
    description: &str,
    manual: bool,
    body: Option<&str>,
) -> String {
    let (bom, rest) = match content.strip_prefix('\u{feff}') {
        Some(rest) => ("\u{feff}", rest),
        None => ("", content),
    };
    // Splitting on `\n` leaves each line's own `\r` attached, so untouched lines
    // are rejoined exactly as they were and the new ones follow the file.
    let lines: Vec<&str> = rest.split('\n').collect();
    let eol = if lines.first().is_some_and(|l| l.ends_with('\r')) {
        "\r"
    } else {
        ""
    };
    let entry = description_entry(description, manual, eol);

    let Some(close) = frontmatter_close(&lines) else {
        let mut head = vec![format!("---{eol}"), format!("name: \"{name}\"{eol}")];
        head.extend(entry);
        head.push(format!("---{eol}"));
        head.push(eol.to_string());
        return match body {
            Some(text) => format!(
                "{bom}{}\n{}",
                head.join("\n"),
                body_lines(text, eol).join("\n")
            ),
            None => format!("{bom}{}\n{rest}", head.join("\n")),
        };
    };

    let mut out = vec![lines[0].to_string()];
    out.extend(rewrite_head(&lines[1..close], &entry));
    match body {
        // The closing `---` and one blank line, then the prose: what is under
        // the frontmatter is the form's to replace, and nothing above it moves.
        Some(text) => {
            out.push(lines[close].to_string());
            out.push(eol.to_string());
            out.extend(body_lines(text, eol));
        }
        None => out.extend(lines[close..].iter().map(|l| (*l).to_string())),
    }
    format!("{bom}{}", out.join("\n"))
}

// ---- the file Codex reads ----------------------------------------------------

fn unreadable(path: &Path) -> String {
    format!(
        "cannot update {}: it is not in a form lpm can change",
        path.display()
    )
}

fn read_sidecar(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read {}: {e}", path.display())),
    }
}

fn write_sidecar(path: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    }
    crate::fsatomic::write(path, content, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// The file goes with the last thing in it, and so does the folder — one lpm
/// made to hold it. A folder with anything else in it stays.
fn remove_sidecar(path: &Path) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| format!("cannot remove {}: {e}", path.display()))?;
    if let Some(dir) = path.parent() {
        let _ = std::fs::remove_dir(dir);
    }
    Ok(())
}

fn restore_sidecar(path: &Path, before: Option<&[u8]>) {
    match before {
        Some(bytes) => {
            let _ = write_sidecar(path, bytes);
        }
        None => {
            let _ = remove_sidecar(path);
        }
    }
}

fn mapping_mut<'a>(value: &'a mut Value, path: &Path) -> Result<&'a mut Mapping, String> {
    if value.is_null() {
        *value = Value::Mapping(Mapping::new());
    }
    value.as_mapping_mut().ok_or_else(|| unreadable(path))
}

fn is_empty(value: &Value) -> bool {
    value.is_null() || value.as_mapping().is_some_and(Mapping::is_empty)
}

/// Codex reads `allow_implicit_invocation` from a file that may also carry the
/// skill's interface and dependencies, so the key is set and cleared in place
/// and everything else is written back untouched. A file that will not parse is
/// left exactly as it is: rewriting one lpm cannot read would lose its contents.
fn sync_opt_out(path: &Path, before: Option<&[u8]>, manual: bool) -> Result<(), String> {
    let Some(bytes) = before else {
        return if manual {
            write_sidecar(path, CODEX_OPT_OUT.as_bytes())
        } else {
            Ok(())
        };
    };
    if bytes == CODEX_OPT_OUT.as_bytes() {
        return if manual { Ok(()) } else { remove_sidecar(path) };
    }

    let text = String::from_utf8_lossy(bytes);
    let mut doc: Value = serde_norway::from_str(&text).map_err(|_| unreadable(path))?;
    if manual {
        let map = mapping_mut(&mut doc, path)?;
        if !map.contains_key("policy") {
            map.insert(
                Value::String("policy".into()),
                Value::Mapping(Mapping::new()),
            );
        }
        let policy = map.get_mut("policy").ok_or_else(|| unreadable(path))?;
        mapping_mut(policy, path)?.insert(
            Value::String("allow_implicit_invocation".into()),
            Value::Bool(false),
        );
    } else {
        if let Some(map) = doc.as_mapping_mut() {
            if let Some(policy) = map.get_mut("policy").and_then(Value::as_mapping_mut) {
                policy.remove("allow_implicit_invocation");
                if policy.is_empty() {
                    map.remove("policy");
                }
            }
        }
        if is_empty(&doc) {
            return remove_sidecar(path);
        }
    }
    let out = serde_norway::to_string(&doc).map_err(|_| unreadable(path))?;
    write_sidecar(path, out.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    const OPT_OUT: &str = "policy:\n  allow_implicit_invocation: false\n";

    fn skill(project: &Path, content: &str) -> (String, PathBuf) {
        let dir = project.join(".claude/skills/deploy");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), content).unwrap();
        (project.to_string_lossy().into_owned(), dir)
    }

    fn update(
        cwd: &str,
        dir: &Path,
        baseline: &str,
        description: &str,
        manual: bool,
    ) -> Result<(), String> {
        write(cwd, dir, baseline, description, manual, None)
    }

    fn write(
        cwd: &str,
        dir: &Path,
        baseline: &str,
        description: &str,
        manual: bool,
        instructions: Option<&str>,
    ) -> Result<(), String> {
        update_agent_skill(
            cwd.to_string(),
            dir.join("SKILL.md").to_string_lossy().into_owned(),
            baseline.to_string(),
            description.to_string(),
            manual,
            instructions.map(str::to_string),
        )
    }

    fn read(dir: &Path) -> String {
        std::fs::read_to_string(dir.join("SKILL.md")).unwrap()
    }

    #[test]
    fn a_quoted_description_is_replaced_in_place() {
        let doc = "---\nname: \"deploy\"\ndescription: \"Ship it\"\n---\n\nBody.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship the site", false, None),
            "---\nname: \"deploy\"\ndescription: \"Ship the site\"\n---\n\nBody.\n"
        );
    }

    /// A folded description spans as many lines as the author gave it, and all
    /// of them belong to the value being replaced.
    #[test]
    fn a_folded_description_goes_with_its_continuation_lines() {
        let doc = "---\nname: \"deploy\"\ndescription: >-\n  Ship the site to staging.\n\n  Use when asked to deploy.\nallowed-tools: Bash\n---\n\nBody.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship it", false, None),
            "---\nname: \"deploy\"\ndescription: \"Ship it\"\nallowed-tools: Bash\n---\n\nBody.\n"
        );
    }

    #[test]
    fn a_multi_line_description_is_written_as_the_form_writes_it() {
        let doc = "---\nname: \"deploy\"\ndescription: \"Ship it\"\n---\n\nBody.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship the site.\n\nUse when deploying.", false, None),
            "---\nname: \"deploy\"\ndescription: >-\n  Ship the site.\n\n  Use when deploying.\n---\n\nBody.\n"
        );
    }

    #[test]
    fn a_description_is_added_after_the_name_when_the_file_has_none() {
        let doc = "---\nname: \"deploy\"\nallowed-tools: Bash\n---\n\nBody.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship it", false, None),
            "---\nname: \"deploy\"\ndescription: \"Ship it\"\nallowed-tools: Bash\n---\n\nBody.\n"
        );
        let unnamed = "---\nallowed-tools: Bash\n---\n\nBody.\n";
        assert_eq!(
            rewrite(unnamed, "deploy", "Ship it", false, None),
            "---\ndescription: \"Ship it\"\nallowed-tools: Bash\n---\n\nBody.\n"
        );
    }

    /// A hand-made skill carries keys, comments and an order lpm knows nothing
    /// about. Everything but the one entry being changed comes back untouched.
    #[test]
    fn every_other_line_of_the_frontmatter_survives() {
        let doc = concat!(
            "---\n",
            "# how this one is wired\n",
            "allowed-tools: Bash(git:*)\n",
            "name: \"deploy\"\n",
            "description: 'Ship it'\n",
            "model:   sonnet\n",
            "metadata:\n",
            "  owner: infra\n",
            "---\n",
            "\n",
            "Body with --- in it.\n",
        );
        assert_eq!(
            rewrite(doc, "deploy", "Ship the site", false, None),
            concat!(
                "---\n",
                "# how this one is wired\n",
                "allowed-tools: Bash(git:*)\n",
                "name: \"deploy\"\n",
                "description: \"Ship the site\"\n",
                "model:   sonnet\n",
                "metadata:\n",
                "  owner: infra\n",
                "---\n",
                "\n",
                "Body with --- in it.\n",
            )
        );
    }

    #[test]
    fn a_file_without_frontmatter_gains_one_and_keeps_its_body() {
        let doc = "# Deploy\n\nRun the script.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship it", true, None),
            "---\nname: \"deploy\"\ndescription: \"Ship it\"\ndisable-model-invocation: true\n---\n\n# Deploy\n\nRun the script.\n"
        );
    }

    #[test]
    fn quotes_and_backslashes_in_a_description_are_escaped() {
        let doc = "---\ndescription: \"x\"\n---\n\nBody.\n";
        assert_eq!(
            rewrite(doc, "deploy", "Run \"deploy\" from C:\\bin", false, None),
            "---\ndescription: \"Run \\\"deploy\\\" from C:\\\\bin\"\n---\n\nBody.\n"
        );
    }

    /// Both markers are the same switch, so neither may be left behind.
    #[test]
    fn turning_it_on_writes_the_key_and_the_file_codex_reads() {
        let project = tempdir().unwrap();
        let (cwd, dir) = skill(
            project.path(),
            "---\ndescription: \"Ship it\"\n---\n\nBody.\n",
        );

        update(&cwd, &dir, &read(&dir), "Ship it", true).unwrap();

        assert_eq!(
            read(&dir),
            "---\ndescription: \"Ship it\"\ndisable-model-invocation: true\n---\n\nBody.\n"
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("agents/openai.yaml")).unwrap(),
            OPT_OUT
        );
    }

    #[test]
    fn turning_it_off_removes_the_key_and_the_folder_lpm_made() {
        let project = tempdir().unwrap();
        let (cwd, dir) = skill(
            project.path(),
            "---\ndescription: \"Ship it\"\ndisable-model-invocation: true\n---\n\nBody.\n",
        );
        std::fs::create_dir_all(dir.join("agents")).unwrap();
        std::fs::write(dir.join("agents/openai.yaml"), OPT_OUT).unwrap();

        update(&cwd, &dir, &read(&dir), "Ship it", false).unwrap();

        assert_eq!(read(&dir), "---\ndescription: \"Ship it\"\n---\n\nBody.\n");
        assert!(!dir.join("agents").exists());
    }

    /// Codex's own docs put the skill's interface in this file too, so the
    /// toggle may only ever add and remove its one key.
    #[test]
    fn a_hand_written_codex_file_keeps_everything_but_the_one_key() {
        let project = tempdir().unwrap();
        let (cwd, dir) = skill(
            project.path(),
            "---\ndescription: \"Ship it\"\n---\n\nBody.\n",
        );
        std::fs::create_dir_all(dir.join("agents")).unwrap();
        let sidecar = dir.join("agents/openai.yaml");
        std::fs::write(&sidecar, "interface:\n  arguments:\n    - name: target\n").unwrap();

        update(&cwd, &dir, &read(&dir), "Ship it", true).unwrap();
        let held_back = std::fs::read_to_string(&sidecar).unwrap();
        assert!(held_back.contains("target"), "{held_back}");
        assert!(
            held_back.contains("allow_implicit_invocation: false"),
            "{held_back}"
        );

        update(&cwd, &dir, &read(&dir), "Ship it", false).unwrap();
        let open = std::fs::read_to_string(&sidecar).unwrap();
        assert!(open.contains("target"), "{open}");
        assert!(!open.contains("allow_implicit_invocation"), "{open}");
        assert!(!open.contains("policy"), "{open}");
    }

    /// The file Codex reads moves first, so a SKILL.md that will not write has
    /// to put it back — a skill held back from one CLI and open to the other is
    /// the opposite of both answers the form offers.
    #[test]
    fn a_failed_write_puts_the_file_codex_reads_back_as_it_was() {
        let project = tempdir().unwrap();
        let (_, dir) = skill(
            project.path(),
            "---\ndescription: \"Ship it\"\n---\n\nBody.\n",
        );
        let sidecar = dir.join("agents/openai.yaml");

        // Nothing there to begin with: the rollback has to take the folder too.
        assert!(sync_opt_out(&sidecar, None, true).is_ok());
        assert_eq!(std::fs::read_to_string(&sidecar).unwrap(), OPT_OUT);
        restore_sidecar(&sidecar, None);
        assert!(!dir.join("agents").exists());

        // A file of the user's own: the rollback restores it byte for byte.
        let theirs = "interface:\n  arguments: []\n";
        std::fs::create_dir_all(dir.join("agents")).unwrap();
        std::fs::write(&sidecar, theirs).unwrap();
        assert!(sync_opt_out(&sidecar, Some(theirs.as_bytes()), true).is_ok());
        assert_ne!(std::fs::read_to_string(&sidecar).unwrap(), theirs);
        restore_sidecar(&sidecar, Some(theirs.as_bytes()));
        assert_eq!(std::fs::read_to_string(&sidecar).unwrap(), theirs);
    }

    #[test]
    fn a_file_lpm_cannot_read_stops_the_save_before_it_starts() {
        let project = tempdir().unwrap();
        let before = "---\ndescription: \"Ship it\"\n---\n\nBody.\n";
        let (cwd, dir) = skill(project.path(), before);
        std::fs::create_dir_all(dir.join("agents")).unwrap();
        let sidecar = dir.join("agents/openai.yaml");
        std::fs::write(&sidecar, "not: yaml: at: all\n").unwrap();

        assert!(update(&cwd, &dir, before, "Ship the site", true).is_err());
        assert_eq!(read(&dir), before);
        assert_eq!(
            std::fs::read_to_string(&sidecar).unwrap(),
            "not: yaml: at: all\n"
        );
    }

    #[test]
    fn a_stale_baseline_is_refused_by_name() {
        let project = tempdir().unwrap();
        let (cwd, dir) = skill(
            project.path(),
            "---\ndescription: \"Ship it\"\n---\n\nBody.\n",
        );

        let err = update(&cwd, &dir, "something else", "Ship the site", false).unwrap_err();
        assert_eq!(err, "modified");
        assert!(read(&dir).contains("Ship it"));
    }

    #[test]
    fn a_path_outside_the_allowlist_is_refused() {
        let project = tempdir().unwrap();
        let elsewhere = project.path().join("skills/deploy");
        std::fs::create_dir_all(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("SKILL.md"), "body").unwrap();

        assert!(update(
            &project.path().to_string_lossy(),
            &elsewhere,
            "body",
            "Ship it",
            false
        )
        .is_err());
        assert_eq!(
            std::fs::read_to_string(elsewhere.join("SKILL.md")).unwrap(),
            "body"
        );
    }

    #[test]
    fn a_description_the_cli_would_drop_is_refused() {
        let project = tempdir().unwrap();
        let before = "---\ndescription: \"Ship it\"\n---\n\nBody.\n";
        let (cwd, dir) = skill(project.path(), before);

        for bad in ["", "   ", "Ship <the> site"] {
            assert!(update(&cwd, &dir, before, bad, false).is_err(), "{bad:?}");
        }
        assert!(update(&cwd, &dir, before, &"x".repeat(DESCRIPTION_MAX + 1), false).is_err());
        assert_eq!(read(&dir), before);
    }

    /// The prose the form hands back replaces everything under the
    /// frontmatter, in the shape the create template writes.
    #[test]
    fn instructions_replace_the_body_and_nothing_above_it() {
        let doc = "---\nname: \"deploy\"\ndescription: \"Ship it\"\n---\n\n# Deploy\n\nRun it.\n";
        assert_eq!(
            rewrite(
                doc,
                "deploy",
                "Ship it",
                false,
                Some("# Deploy\n\n1. Build\n2. Ship"),
            ),
            "---\nname: \"deploy\"\ndescription: \"Ship it\"\n---\n\n# Deploy\n\n1. Build\n2. Ship\n"
        );
    }

    /// A body nobody edited is not something to reflow: the form sends none,
    /// and every byte under the frontmatter comes back as it was.
    #[test]
    fn a_body_the_form_left_alone_is_untouched() {
        let doc = "---\ndescription: \"Ship it\"\n---\n\n\tindented\n\n\n  and spaced   \n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship the site", false, None),
            doc.replace("Ship it", "Ship the site")
        );
    }

    #[test]
    fn a_crlf_file_keeps_its_line_endings() {
        let doc = "---\r\ndescription: \"Ship it\"\r\n---\r\n\r\nOld.\r\n";
        assert_eq!(
            rewrite(doc, "deploy", "Ship it", false, Some("New.")),
            "---\r\ndescription: \"Ship it\"\r\n---\r\n\r\nNew.\r\n"
        );
    }

    #[test]
    fn a_file_without_frontmatter_gets_one_over_the_new_body() {
        assert_eq!(
            rewrite(
                "Old prose.\n",
                "deploy",
                "Ship it",
                false,
                Some("New prose.")
            ),
            "---\nname: \"deploy\"\ndescription: \"Ship it\"\n---\n\nNew prose.\n"
        );
    }

    #[test]
    fn the_whole_file_is_written_at_once() {
        let project = tempdir().unwrap();
        let before = "---\ndescription: \"Ship it\"\n---\n\n# Deploy\n\nRun it.\n";
        let (cwd, dir) = skill(project.path(), before);

        write(
            &cwd,
            &dir,
            before,
            "Ship the site",
            false,
            Some("# Deploy\n\nRun it twice."),
        )
        .unwrap();

        assert_eq!(
            read(&dir),
            "---\ndescription: \"Ship the site\"\n---\n\n# Deploy\n\nRun it twice.\n"
        );
    }

    #[test]
    fn a_body_with_nothing_in_it_is_refused() {
        let project = tempdir().unwrap();
        let before = "---\ndescription: \"Ship it\"\n---\n\nBody.\n";
        let (cwd, dir) = skill(project.path(), before);

        assert!(write(&cwd, &dir, before, "Ship it", false, Some("  \n ")).is_err());
        assert_eq!(read(&dir), before);
    }
}
