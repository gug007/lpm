// What a skill's name and folder may be, and the paths that follow from a name.

const MAX_NAME_LEN: usize = 64;
const MAX_FOLDER_LEN: usize = 64;
const MAX_FOLDER_PATH_LEN: usize = 255;
pub(crate) const FOLDER_SEP: char = '/';

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

/// A folder is the path to it, so `Work/Reviews` sits inside `Work`.
pub(crate) fn clean_folder(folder: &str) -> Result<String, String> {
    let levels: Vec<&str> =
        folder.split(FOLDER_SEP).map(str::trim).filter(|level| !level.is_empty()).collect();
    if levels.is_empty() {
        return Err("Give the folder a name.".into());
    }
    let unusable = |level: &&str| {
        level.chars().count() > MAX_FOLDER_LEN
            || level.starts_with('.')
            || !crate::fsname::is_portable_everywhere(level)
    };
    if levels.iter().any(unusable) {
        return Err(
            "A folder name can't start or end with a dot, or hold any of \\ : * ? \" < > |.".into(),
        );
    }
    let path = levels.join(&FOLDER_SEP.to_string());
    if path.chars().count() > MAX_FOLDER_PATH_LEN {
        return Err("Those folders are nested too deep.".into());
    }
    Ok(path)
}

pub(crate) fn clean_folder_opt(folder: Option<&str>) -> Result<Option<String>, String> {
    match folder.map(str::trim).filter(|f| !f.is_empty()) {
        Some(f) => clean_folder(f).map(Some),
        None => Ok(None),
    }
}

/// Adds `path` and the folders it sits inside to `folders`, and gives it back as
/// the list spells it: the list treats folder names the same whatever their case.
pub(crate) fn add_folder(folders: &mut Vec<String>, path: &str) -> String {
    let mut spelled = String::new();
    for level in path.split(FOLDER_SEP) {
        let next = if spelled.is_empty() { level.to_string() } else { format!("{spelled}{FOLDER_SEP}{level}") };
        spelled = match folders.iter().find(|f| f.eq_ignore_ascii_case(&next)) {
            Some(listed) => listed.clone(),
            None => {
                folders.push(next.clone());
                next
            }
        };
    }
    spelled
}

/// What `folder` becomes when the folder `from` becomes `to`, with None for the
/// top of the list. The outer None leaves a folder outside `from` as it is.
pub(crate) fn moved_folder(folder: &str, from: &str, to: Option<&str>) -> Option<Option<String>> {
    let rest = match folder.strip_prefix(from)? {
        "" => None,
        rest => Some(rest.strip_prefix(FOLDER_SEP)?),
    };
    Some(match (to, rest) {
        (Some(to), Some(rest)) => Some(format!("{to}{FOLDER_SEP}{rest}")),
        (Some(to), None) => Some(to.to_string()),
        (None, rest) => rest.map(str::to_string),
    })
}

/// Sorts what's inside a folder right after it, ahead of `Work notes` for `Work`.
pub(crate) fn folder_order(folder: &str) -> Vec<String> {
    folder.split(FOLDER_SEP).map(str::to_lowercase).collect()
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
