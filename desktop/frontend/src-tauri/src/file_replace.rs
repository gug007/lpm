// Replace in files, from the Search view. Each file is read again and matched
// line by line with the search's own matcher, so the change is the preview the
// user saw. A file that changes between that read and the write is left
// alone, and the last replace can be taken back while nothing has touched the
// files since.
use crate::config::expand_home;
use crate::file_browser::checked_rel;
use crate::file_match::{
    build_matcher, for_each_match, utf16_len, Pattern, Replacer, SearchOptions,
};
use crate::file_search::{search_key, FILE_BYTES_CAP};
use crate::files::{refuse_remote_write, write_file_if_unchanged};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

// Past these, undo is left to Git.
const UNDO_BYTES: usize = 32 * 1024 * 1024;
const UNDO_WINDOW: Duration = Duration::from_secs(120);

/// The match a single Replace aims at: its line and UTF-16 column, as listed.
#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct MatchAt {
    pub line: u64,
    pub col: usize,
}

/// `text` with its matches replaced, or with `at`, only that one. Returns how
/// many were replaced.
pub(crate) fn replace_text(pattern: &Pattern, text: &str, at: Option<MatchAt>) -> (String, usize) {
    let mut out = String::with_capacity(text.len());
    let mut count = 0;
    for (i, raw) in text.split_inclusive('\n').enumerate() {
        let line = i as u64 + 1;
        let body = raw.trim_end_matches(['\n', '\r']);
        if at.is_some_and(|a| a.line != line) {
            out.push_str(raw);
            continue;
        }
        let mut last = 0;
        for_each_match(pattern, body, |start, end, replacement| {
            if at.is_some_and(|a| a.col != utf16_len(&body[..start]) + 1) {
                return true;
            }
            out.push_str(&body[last..start]);
            out.push_str(&replacement.unwrap_or_default());
            last = end;
            count += 1;
            at.is_none()
        });
        out.push_str(&body[last..]);
        out.push_str(&raw[body.len()..]);
    }
    (out, count)
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceOutcome {
    pub replaced: usize,
    pub files: usize,
    pub skipped: Vec<SkippedFile>,
    // undo_replace can take it back.
    pub undoable: bool,
}

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UndoOutcome {
    pub restored: usize,
    pub skipped: Vec<SkippedFile>,
}

struct Undo {
    path: String,
    rel: String,
    before: String,
    after: String,
}

/// Replaces the matches of `query` in `paths` (relative to `root`), or with
/// `at`, the one match there in the single path given. Runs off the UI thread.
#[tauri::command(async)]
pub fn replace_in_files(
    root: String,
    query: String,
    options: SearchOptions,
    replacement: String,
    paths: Vec<String>,
    at: Option<MatchAt>,
    token: String,
) -> Result<ReplaceOutcome, String> {
    if root.is_empty() || query.is_empty() {
        return Ok(ReplaceOutcome::default());
    }
    refuse_remote_write(&root)?;
    let matcher = build_matcher(&query, options)
        .map_err(|reason| format!("Not a valid regular expression: {reason}"))?;
    let pattern = Pattern {
        matcher,
        replacer: Some(Replacer::new(&replacement, options.regex)),
    };
    let base = expand_home(&root);
    let mut outcome = ReplaceOutcome::default();
    let mut undo = Vec::new();
    for rel in paths {
        match replace_file(Path::new(&base), &rel, &pattern, at) {
            Ok(Some((count, done))) => {
                outcome.replaced += count;
                outcome.files += 1;
                undo.push(done);
            }
            Ok(None) => {}
            Err(reason) => outcome.skipped.push(SkippedFile { path: rel, reason }),
        }
    }
    outcome.undoable = stash(search_key(&root, &token), undo);
    Ok(outcome)
}

/// Puts back the files the last replace under `token` changed, each one only
/// while it still holds what the replace wrote.
#[tauri::command(async)]
pub fn undo_replace(root: String, token: String) -> Result<UndoOutcome, String> {
    let entry = {
        let mut stash = undo_stash().lock().unwrap();
        stash.retain(|_, (at, _)| at.elapsed() < UNDO_WINDOW);
        stash.remove(&search_key(&root, &token))
    };
    let Some((_, undo)) = entry else {
        return Err("This replace can no longer be undone".into());
    };
    let mut outcome = UndoOutcome::default();
    for u in undo {
        match swap(&u.path, &u.after, &u.before, "Changed since the replace") {
            Ok(()) => outcome.restored += 1,
            Err(reason) => outcome.skipped.push(SkippedFile {
                path: u.rel,
                reason,
            }),
        }
    }
    Ok(outcome)
}

// Writes `to` over `path` only while it still holds `from`.
fn swap(path: &str, from: &str, to: &str, changed: &str) -> Result<(), String> {
    let result = write_file_if_unchanged(path.to_string(), from.to_string(), to.to_string())?;
    if result.written {
        Ok(())
    } else {
        Err(changed.to_string())
    }
}

fn replace_file(
    base: &Path,
    rel: &str,
    pattern: &Pattern,
    at: Option<MatchAt>,
) -> Result<Option<(usize, Undo)>, String> {
    let rel = checked_rel(rel).map_err(|_| "Outside the project".to_string())?;
    if rel.is_empty() {
        return Err("Outside the project".into());
    }
    let path = base.join(&rel).to_string_lossy().into_owned();
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > FILE_BYTES_CAP {
        return Err("Too large to change here".into());
    }
    if crate::git::is_binary(&bytes) {
        return Err("Binary file".into());
    }
    let before = String::from_utf8(bytes).map_err(|_| "Not UTF-8 text".to_string())?;
    let (after, count) = replace_text(pattern, &before, at);
    if count == 0 {
        return match at {
            Some(_) => Err("Changed since the search".into()),
            None => Ok(None),
        };
    }
    // An agent may have written it since the read above.
    swap(&path, &before, &after, "Changed since the search")?;
    let undo = Undo {
        path,
        rel,
        before,
        after,
    };
    Ok(Some((count, undo)))
}

type Stash = HashMap<String, (Instant, Vec<Undo>)>;

fn undo_stash() -> &'static Mutex<Stash> {
    static STASH: OnceLock<Mutex<Stash>> = OnceLock::new();
    STASH.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stash(key: String, undo: Vec<Undo>) -> bool {
    let mut stash = undo_stash().lock().unwrap();
    stash.retain(|_, (at, _)| at.elapsed() < UNDO_WINDOW);
    stash.remove(&key);
    let bytes: usize = undo.iter().map(|u| u.before.len() + u.after.len()).sum();
    if undo.is_empty() || bytes > UNDO_BYTES {
        return false;
    }
    stash.insert(key, (Instant::now(), undo));
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pattern(query: &str, replace: &str, regex: bool) -> Pattern {
        let options = SearchOptions {
            regex,
            ..SearchOptions::default()
        };
        Pattern {
            matcher: build_matcher(query, options).unwrap(),
            replacer: Some(Replacer::new(replace, regex)),
        }
    }

    #[test]
    fn replaces_every_match_and_keeps_line_endings() {
        let text = "useCart();\r\nconst a = usecart + useCart;\nlast useCart";
        let (out, n) = replace_text(&pattern("usecart", "useBasket", false), text, None);
        assert_eq!(
            out,
            "useBasket();\r\nconst a = useBasket + useBasket;\nlast useBasket"
        );
        assert_eq!(n, 4);
    }

    #[test]
    fn a_regex_replacement_takes_capture_groups() {
        let text = "fetchUser(id)\nfetchOrder(42)\n";
        let (out, n) = replace_text(
            &pattern(r"fetch(\w+)\((\w+)\)", "load$1(${2})", true),
            text,
            None,
        );
        assert_eq!(out, "loadUser(id)\nloadOrder(42)\n");
        assert_eq!(n, 2);
        let (literal, _) = replace_text(&pattern("id", "$1", false), "id\n", None);
        assert_eq!(literal, "$1\n");
    }

    #[test]
    fn replaces_only_the_match_at_a_place() {
        let text = "a 😀 foo foo\nfoo\n";
        let (out, n) = replace_text(
            &pattern("foo", "bar", false),
            text,
            Some(MatchAt { line: 1, col: 10 }),
        );
        assert_eq!(out, "a 😀 foo bar\nfoo\n");
        assert_eq!(n, 1);
        let (same, none) = replace_text(
            &pattern("foo", "bar", false),
            text,
            Some(MatchAt { line: 1, col: 2 }),
        );
        assert_eq!((same.as_str(), none), (text, 0));
    }

    #[test]
    fn previews_what_a_replace_writes() {
        let p = pattern(r"(\w+)Total", "${1}Sum", true);
        let mut previews = Vec::new();
        for_each_match(&p, "useCartTotal + cartTotal", |_, _, r| {
            previews.push(r.unwrap());
            true
        });
        assert_eq!(previews, ["useCartSum", "cartSum"]);
    }

    fn token(name: &str) -> String {
        format!("replace-test-{name}")
    }

    #[test]
    fn writes_files_skips_what_it_cannot_change_and_undoes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/a.ts"), "useCart(); useCart();\n").unwrap();
        std::fs::write(dir.path().join("b.bin"), b"useCart\0").unwrap();
        std::fs::write(dir.path().join("c.ts"), "nothing\n").unwrap();
        let paths = ["src/a.ts", "b.bin", "c.ts", "../escape.ts"]
            .map(String::from)
            .to_vec();
        let out = replace_in_files(
            root.clone(),
            "useCart".into(),
            SearchOptions::default(),
            "useBasket".into(),
            paths,
            None,
            token("undo"),
        )
        .unwrap();
        assert_eq!((out.replaced, out.files, out.undoable), (2, 1, true));
        assert_eq!(
            out.skipped,
            [
                SkippedFile {
                    path: "b.bin".into(),
                    reason: "Binary file".into()
                },
                SkippedFile {
                    path: "../escape.ts".into(),
                    reason: "Outside the project".into()
                },
            ]
        );
        let a = dir.path().join("src/a.ts");
        assert_eq!(
            std::fs::read_to_string(&a).unwrap(),
            "useBasket(); useBasket();\n"
        );

        let back = undo_replace(root.clone(), token("undo")).unwrap();
        assert_eq!((back.restored, back.skipped.len()), (1, 0));
        assert_eq!(
            std::fs::read_to_string(&a).unwrap(),
            "useCart(); useCart();\n"
        );
        assert!(undo_replace(root, token("undo")).is_err());
    }

    #[test]
    fn undo_leaves_a_file_changed_since() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let a = dir.path().join("a.ts");
        std::fs::write(&a, "foo\n").unwrap();
        let out = replace_in_files(
            root.clone(),
            "foo".into(),
            SearchOptions::default(),
            "bar".into(),
            vec!["a.ts".into()],
            None,
            token("changed"),
        )
        .unwrap();
        assert!(out.undoable);
        std::fs::write(&a, "bar, edited by an agent\n").unwrap();
        let back = undo_replace(root, token("changed")).unwrap();
        assert_eq!(back.restored, 0);
        assert_eq!(back.skipped[0].reason, "Changed since the replace");
        assert_eq!(
            std::fs::read_to_string(&a).unwrap(),
            "bar, edited by an agent\n"
        );
    }

    #[test]
    fn a_single_replace_refuses_a_line_that_moved() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.ts"), "x\nfoo\n").unwrap();
        let out = replace_in_files(
            dir.path().to_string_lossy().into_owned(),
            "foo".into(),
            SearchOptions::default(),
            "bar".into(),
            vec!["a.ts".into()],
            Some(MatchAt { line: 1, col: 1 }),
            token("moved"),
        )
        .unwrap();
        assert_eq!(out.replaced, 0);
        assert_eq!(out.skipped[0].reason, "Changed since the search");
        assert!(!out.undoable);
    }
}
