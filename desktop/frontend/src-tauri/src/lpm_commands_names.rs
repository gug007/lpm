// What a skill's name and folder may be, and the paths that follow from a name.

const MAX_NAME_LEN: usize = 64;
const MAX_FOLDER_LEN: usize = 64;

/// Which entries of an old list are commands: `*.md` files named the way a
/// `/name` could be typed, at the root or one folder down.
pub(crate) fn legacy_name_of(file_name: &str) -> Option<&str> {
    let stem = file_name.strip_suffix(".md")?;
    let shaped = stem.len() <= MAX_NAME_LEN
        && stem.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    shaped.then_some(stem)
}

pub(crate) fn is_visible_folder(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.')
}

/// The Agent Skills rule, which agents enforce, for a name that is also a folder
/// that may be committed and checked out on any platform.
pub(crate) fn valid_name(name: &str) -> bool {
    name.len() <= MAX_NAME_LEN
        && name.split('-').all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
        && crate::fsname::is_portable_everywhere(name)
}

pub(crate) fn check_name(name: &str) -> Result<(), String> {
    if valid_name(name) {
        Ok(())
    } else {
        Err("Use lowercase letters, numbers and single hyphens for the name.".into())
    }
}

/// The closest valid name for a file named by looser rules.
pub(crate) fn skill_name(raw: &str) -> Option<String> {
    let lower: String = raw
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let name = lower.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    valid_name(&name).then_some(name)
}

pub(crate) fn clean_folder(folder: &str) -> Result<String, String> {
    let folder = folder.trim();
    if folder.is_empty() {
        return Err("Give the folder a name.".into());
    }
    if folder.chars().count() > MAX_FOLDER_LEN
        || folder.starts_with('.')
        || !crate::fsname::is_portable_everywhere(folder)
    {
        return Err(
            "A folder name can't start or end with a dot, or hold any of / \\ : * ? \" < > |.".into(),
        );
    }
    Ok(folder.to_string())
}

pub(crate) fn clean_folder_opt(folder: Option<&str>) -> Result<Option<String>, String> {
    match folder.map(str::trim).filter(|f| !f.is_empty()) {
        Some(f) => clean_folder(f).map(Some),
        None => Ok(None),
    }
}

pub(crate) fn skill_file(name: &str) -> String {
    format!("{name}/SKILL.md")
}

/// Codex's own switch for a skill only the user starts.
pub(crate) fn codex_policy_file(name: &str) -> String {
    format!("{name}/agents/openai.yaml")
}

pub(crate) fn place_label(folder: Option<&str>) -> String {
    match folder {
        Some(f) => format!("the {f} folder"),
        None => "No folder".to_string(),
    }
}
