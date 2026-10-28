// Text search across a project, for the Files tab's Search view: every
// occurrence, grouped by file, and with a replacement typed, what each would
// become. The walk is ripgrep's, in parallel and honoring .gitignore, with the
// tree's skip list on top for projects outside git.
use crate::config::expand_home;
use crate::file_replace::{for_each_match, Pattern, Replacer};
use crate::file_search_filter::{Invalid, SearchFilters};
use crate::files::MENTION_SKIP_DIRS;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{sinks::Lossy, BinaryDetection, Searcher, SearcherBuilder};
use ignore::overrides::Override;
use ignore::{WalkBuilder, WalkState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

pub(crate) const MATCH_CAP: usize = 5_000;
// Larger files are logs, bundles and data dumps: slow to scan, rarely the hit.
pub(crate) const FILE_BYTES_CAP: u64 = 1024 * 1024;
// Under the 30 s a connected computer waits for an answer.
pub(crate) const TIME_BUDGET: Duration = Duration::from_secs(15);
const CONTEXT_CHARS: usize = 30;
const SNIPPET_CHARS: usize = 200;

#[derive(Deserialize, Default, Clone, Copy)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    pub match_case: bool,
    pub whole_word: bool,
    pub regex: bool,
}

/// One occurrence. Columns and lengths count UTF-16 units, as the editor and
/// JavaScript strings do.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    pub line: u64,
    pub col: usize,
    pub len: usize,
    // The line around the occurrence, which starts `start` units in.
    pub text: String,
    pub start: usize,
    // What a replace would put in its place.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replacement: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub matches: Vec<LineMatch>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileSearch {
    pub files: Vec<FileMatches>,
    // Stopped at the match cap or the time budget; more lines may match.
    pub truncated: bool,
    // The field that can't be searched with, when one can't.
    pub invalid: Option<Invalid>,
}

/// Every occurrence of `query` under `root` that `filters` let through, paths
/// relative to `root`; with a `replacement`, each says what it would become.
/// A newer search under the same `token` stops this one. Runs off the UI
/// thread.
#[tauri::command(async)]
pub fn search_files(
    root: String,
    query: String,
    options: SearchOptions,
    filters: Option<SearchFilters>,
    replacement: Option<String>,
    token: String,
) -> Result<FileSearch, String> {
    if root.is_empty() || query.is_empty() {
        return Ok(FileSearch::default());
    }
    let filters = filters.unwrap_or_default();
    let invalid = |invalid| {
        Ok(FileSearch {
            invalid: Some(invalid),
            ..FileSearch::default()
        })
    };
    let pattern = match build_matcher(&query, options) {
        Ok(matcher) => Pattern {
            matcher,
            replacer: replacement.map(|r| Replacer::new(&r, options.regex)),
        },
        Err(reason) => return invalid(Invalid::query(reason)),
    };
    let remote = crate::sshexec::remote_project_for_path(&root);
    let base = expand_home(&root);
    let filter_root = if remote.is_some() { "" } else { base.as_str() };
    let filter = match filters.matcher(Path::new(filter_root)) {
        Ok(filter) => filter,
        Err(e) => return invalid(e),
    };
    let key = search_key(&root, &token);
    let stop = begin(&key);
    let found = match remote {
        Some(ssh) => crate::file_search_ssh::search(
            &ssh,
            &root,
            &query,
            options,
            &filters,
            filter.as_ref(),
            &pattern,
            &stop,
        ),
        None => Ok(search_local(Path::new(&base), &pattern, filter, &stop)),
    };
    finish(&key, &stop);
    found
}

/// Stops the search running under `token`, if one is.
#[tauri::command]
pub fn cancel_file_search(root: String, token: String) {
    if let Some(stop) = running().lock().unwrap().remove(&search_key(&root, &token)) {
        stop.store(true, Ordering::Relaxed);
    }
}

pub(crate) fn search_key(root: &str, token: &str) -> String {
    format!("{root}\0{token}")
}

fn running() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn begin(key: &str) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    if let Some(previous) = running()
        .lock()
        .unwrap()
        .insert(key.to_string(), stop.clone())
    {
        previous.store(true, Ordering::Relaxed);
    }
    stop
}

fn finish(key: &str, stop: &Arc<AtomicBool>) {
    let mut running = running().lock().unwrap();
    if running.get(key).is_some_and(|s| Arc::ptr_eq(s, stop)) {
        running.remove(key);
    }
}

/// ripgrep's settings: one line at a time, so `^`/`$` anchor to lines and no
/// match runs past a line's end.
pub(crate) fn build_matcher(query: &str, options: SearchOptions) -> Result<RegexMatcher, String> {
    RegexMatcherBuilder::new()
        .case_insensitive(!options.match_case)
        .word(options.whole_word)
        .fixed_strings(!options.regex)
        .multi_line(true)
        .line_terminator(Some(b'\n'))
        .build(query)
        .map_err(|e| regex_reason(&e.to_string()))
}

// A regex error comes over several lines, the pattern and a caret under it
// first; the last line names the problem.
fn regex_reason(message: &str) -> String {
    let last = message
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or(message);
    last.trim().trim_start_matches("error:").trim().to_string()
}

fn search_local(
    base: &Path,
    pattern: &Pattern,
    filter: Option<Override>,
    stop: &AtomicBool,
) -> FileSearch {
    let started = Instant::now();
    let found = Mutex::new(Vec::new());
    let count = AtomicUsize::new(0);
    let truncated = AtomicBool::new(false);
    let (found_ref, count_ref, truncated_ref) = (&found, &count, &truncated);
    let mut walk = WalkBuilder::new(base);
    if let Some(filter) = filter {
        walk.overrides(filter);
    }
    walk.hidden(false)
        .max_filesize(Some(FILE_BYTES_CAP))
        .filter_entry(|entry| {
            let skipped = entry.depth() > 0
                && entry.file_type().is_some_and(|t| t.is_dir())
                && entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| MENTION_SKIP_DIRS.contains(&name));
            !skipped
        })
        .build_parallel()
        .run(|| {
            let mut searcher = searcher();
            Box::new(move |entry| {
                if stop.load(Ordering::Relaxed) {
                    return WalkState::Quit;
                }
                if count_ref.load(Ordering::Relaxed) >= MATCH_CAP || started.elapsed() > TIME_BUDGET
                {
                    truncated_ref.store(true, Ordering::Relaxed);
                    return WalkState::Quit;
                }
                let Ok(entry) = entry else {
                    return WalkState::Continue;
                };
                if !entry.file_type().is_some_and(|t| t.is_file()) {
                    return WalkState::Continue;
                }
                let matches = search_file(&mut searcher, pattern, entry.path());
                if !matches.is_empty() {
                    count_ref.fetch_add(matches.len(), Ordering::Relaxed);
                    let path = entry.path().strip_prefix(base).unwrap_or(entry.path());
                    found_ref.lock().unwrap().push(FileMatches {
                        path: path.to_string_lossy().into_owned(),
                        matches,
                    });
                }
                WalkState::Continue
            })
        });
    collect(found.into_inner().unwrap(), truncated.into_inner())
}

// Git's rule for binary files: a NUL byte.
fn searcher() -> Searcher {
    SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(0))
        .line_number(true)
        .build()
}

fn search_file(searcher: &mut Searcher, pattern: &Pattern, path: &Path) -> Vec<LineMatch> {
    let mut out = Vec::new();
    let _ = searcher.search_path(
        &pattern.matcher,
        path,
        Lossy(|line, text| {
            line_matches(pattern, line, text, &mut out);
            Ok(out.len() < MATCH_CAP)
        }),
    );
    out
}

/// Every occurrence on one line, `line` its 1-based number.
pub(crate) fn line_matches(pattern: &Pattern, line: u64, text: &str, out: &mut Vec<LineMatch>) {
    let text = text.trim_end_matches(['\n', '\r']);
    for_each_match(pattern, text, |start, end, replacement| {
        out.push(line_match(line, text, start, end, replacement));
        out.len() < MATCH_CAP
    });
}

// The line from a little before the occurrence, so a match far along a long
// line still shows.
fn line_match(
    line: u64,
    text: &str,
    start: usize,
    end: usize,
    replacement: Option<String>,
) -> LineMatch {
    let before = text[..start].trim_start();
    let skip = before.chars().count().saturating_sub(CONTEXT_CHARS);
    let mut snippet = String::new();
    if skip > 0 {
        snippet.push('…');
    }
    snippet.extend(before.chars().skip(skip));
    let at = utf16_len(&snippet);
    let room = SNIPPET_CHARS.saturating_sub(snippet.chars().count());
    snippet.extend(text[start..].chars().take(room));
    LineMatch {
        line,
        col: utf16_len(&text[..start]) + 1,
        len: utf16_len(&text[start..end]),
        text: snippet,
        start: at,
        replacement,
    }
}

pub(crate) fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Files in path order, folder by folder, cut to the match cap.
pub(crate) fn collect(mut files: Vec<FileMatches>, mut truncated: bool) -> FileSearch {
    files.sort_by_cached_key(|f| {
        let segments: Vec<String> = f.path.split(['/', '\\']).map(str::to_lowercase).collect();
        (segments, f.path.clone())
    });
    let mut room = MATCH_CAP;
    files.retain_mut(|f| {
        if room == 0 {
            truncated = true;
            return false;
        }
        if f.matches.len() > room {
            f.matches.truncate(room);
            truncated = true;
        }
        room -= f.matches.len();
        true
    });
    FileSearch {
        files,
        truncated,
        invalid: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(match_case: bool, whole_word: bool, regex: bool) -> SearchOptions {
        SearchOptions {
            match_case,
            whole_word,
            regex,
        }
    }

    fn search(dir: &Path, query: &str, options: SearchOptions) -> FileSearch {
        search_with(dir, query, options, None, None)
    }

    fn search_with(
        dir: &Path,
        query: &str,
        options: SearchOptions,
        filters: Option<SearchFilters>,
        replacement: Option<&str>,
    ) -> FileSearch {
        search_files(
            dir.to_string_lossy().into_owned(),
            query.into(),
            options,
            filters,
            replacement.map(String::from),
            "test".into(),
        )
        .unwrap()
    }

    fn plain(query: &str) -> Pattern {
        Pattern {
            matcher: build_matcher(query, SearchOptions::default()).unwrap(),
            replacer: None,
        }
    }

    fn hits(found: &FileSearch) -> Vec<(String, u64, usize)> {
        found
            .files
            .iter()
            .flat_map(|f| {
                f.matches
                    .iter()
                    .map(|m| (f.path.replace('\\', "/"), m.line, m.col))
            })
            .collect()
    }

    #[test]
    fn finds_every_occurrence_in_path_order() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src/cart")).unwrap();
        std::fs::write(
            dir.path().join("src/cart.ts"),
            "const total = useCartTotal();\nexport function useCartTotal() { return useCartTotal; }\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join("src/cart/index.ts"),
            "import { useCartTotal } from '..';\n",
        )
        .unwrap();
        std::fs::write(dir.path().join("README.md"), "nothing here\n").unwrap();
        std::fs::write(dir.path().join("logo.bin"), b"useCartTotal\0\x01").unwrap();
        let found = search(dir.path(), "usecarttotal", SearchOptions::default());
        assert_eq!(
            hits(&found),
            vec![
                ("src/cart/index.ts".into(), 1, 10),
                ("src/cart.ts".into(), 1, 15),
                ("src/cart.ts".into(), 2, 17),
                ("src/cart.ts".into(), 2, 41),
            ]
        );
        let first = &found.files[1].matches[0];
        assert_eq!(first.text, "const total = useCartTotal();");
        assert_eq!((first.start, first.len), (14, 12));
        assert!(!found.truncated);
        assert_eq!(found.invalid, None);
    }

    #[test]
    fn honors_gitignore_and_skips_dependency_folders() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".git")).unwrap();
        std::fs::create_dir_all(dir.path().join("node_modules/pkg")).unwrap();
        std::fs::create_dir_all(dir.path().join("out")).unwrap();
        std::fs::write(dir.path().join(".gitignore"), "out/\n").unwrap();
        std::fs::write(dir.path().join("out/bundle.js"), "needle\n").unwrap();
        std::fs::write(dir.path().join("node_modules/pkg/index.js"), "needle\n").unwrap();
        std::fs::write(dir.path().join(".env.example"), "needle=1\n").unwrap();
        std::fs::write(dir.path().join("main.rs"), "// needle\n").unwrap();
        let found = search(dir.path(), "needle", SearchOptions::default());
        assert_eq!(
            hits(&found),
            vec![(".env.example".into(), 1, 1), ("main.rs".into(), 1, 4)]
        );
    }

    #[test]
    fn match_case_whole_word_and_regex() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "Foo foo foobar\nbar42 baz7\n").unwrap();
        let cols = |query: &str, options| -> Vec<(u64, usize)> {
            hits(&search(dir.path(), query, options))
                .into_iter()
                .map(|(_, l, c)| (l, c))
                .collect()
        };
        assert_eq!(
            cols("foo", opts(false, false, false)),
            vec![(1, 1), (1, 5), (1, 9)]
        );
        assert_eq!(cols("foo", opts(true, false, false)), vec![(1, 5), (1, 9)]);
        assert_eq!(cols("foo", opts(false, true, false)), vec![(1, 1), (1, 5)]);
        assert_eq!(
            cols("[a-z]+\\d+", opts(false, false, true)),
            vec![(2, 1), (2, 7)]
        );
        assert_eq!(cols("^ba", opts(false, false, true)), vec![(2, 1)]);
        assert_eq!(cols("a.", opts(false, false, false)), vec![]);
    }

    #[test]
    fn an_invalid_regex_is_reported_not_failed() {
        let dir = tempfile::tempdir().unwrap();
        let found = search(dir.path(), "foo(", opts(false, false, true));
        assert_eq!(found.invalid, Some(Invalid::query("unclosed group".into())));
        assert!(found.files.is_empty());
        assert_eq!(
            search(dir.path(), "foo(", SearchOptions::default()).invalid,
            None
        );
    }

    #[test]
    fn columns_count_utf16_units_and_long_lines_keep_the_match() {
        let pattern = plain("needle");
        let mut out = Vec::new();
        line_matches(&pattern, 3, "  \"😀é\" needle\r\n", &mut out);
        assert_eq!(
            out,
            vec![LineMatch {
                line: 3,
                col: 9,
                len: 6,
                text: "\"😀é\" needle".into(),
                start: 6,
                replacement: None,
            }]
        );
        let long = format!("{}needle{}", "x".repeat(500), "y".repeat(500));
        let mut out = Vec::new();
        line_matches(&pattern, 1, &long, &mut out);
        let hit = &out[0];
        assert_eq!(hit.col, 501);
        assert_eq!(
            hit.text,
            format!("…{}needle{}", "x".repeat(30), "y".repeat(163))
        );
        assert_eq!(hit.start, 31);
    }

    #[test]
    fn searches_only_the_files_the_filters_let_through() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::create_dir_all(dir.path().join("fixtures")).unwrap();
        for path in ["src/a.ts", "src/a.test.ts", "fixtures/b.ts", "c.md"] {
            std::fs::write(dir.path().join(path), "needle\n").unwrap();
        }
        let filters = |include: &[&str], exclude: &[&str]| {
            Some(SearchFilters {
                include: include.iter().map(|s| s.to_string()).collect(),
                exclude: exclude.iter().map(|s| s.to_string()).collect(),
            })
        };
        let paths = |found: FileSearch| -> Vec<String> {
            hits(&found).into_iter().map(|(p, _, _)| p).collect()
        };
        let options = SearchOptions::default();
        assert_eq!(
            paths(search_with(
                dir.path(),
                "needle",
                options,
                filters(&["*.ts"], &["*.test.ts"]),
                None
            )),
            ["fixtures/b.ts", "src/a.ts"]
        );
        assert_eq!(
            paths(search_with(
                dir.path(),
                "needle",
                options,
                filters(&[], &["fixtures", "src"]),
                None
            )),
            ["c.md"]
        );
        let bad = search_with(
            dir.path(),
            "needle",
            options,
            filters(&["src/[a"], &[]),
            None,
        );
        assert_eq!(bad.invalid.map(|i| i.field), Some("include"));
    }

    #[test]
    fn previews_the_replacement_of_each_match() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.ts"), "fetchUser(id); fetchOrder(1);\n").unwrap();
        let found = search_with(
            dir.path(),
            r"fetch(\w+)",
            opts(true, false, true),
            None,
            Some("load$1"),
        );
        let previews: Vec<Option<&str>> = found.files[0]
            .matches
            .iter()
            .map(|m| m.replacement.as_deref())
            .collect();
        assert_eq!(previews, [Some("loadUser"), Some("loadOrder")]);
        let plain = search(dir.path(), "fetch", SearchOptions::default());
        assert_eq!(plain.files[0].matches[0].replacement, None);
    }

    #[test]
    fn a_newer_search_under_the_same_token_stops_the_older() {
        let first = begin("root\0pane");
        let second = begin("root\0pane");
        assert!(first.load(Ordering::Relaxed));
        assert!(!second.load(Ordering::Relaxed));
        finish("root\0pane", &first);
        cancel_file_search("root".into(), "pane".into());
        assert!(second.load(Ordering::Relaxed));
        assert!(!running().lock().unwrap().contains_key("root\0pane"));
    }

    #[test]
    fn collect_cuts_to_the_cap_in_path_order() {
        let file = |path: &str, n: usize| FileMatches {
            path: path.into(),
            matches: (0..n)
                .map(|i| LineMatch {
                    line: i as u64 + 1,
                    col: 1,
                    len: 1,
                    text: "x".into(),
                    start: 0,
                    replacement: None,
                })
                .collect(),
        };
        let found = collect(vec![file("b.ts", MATCH_CAP), file("A/z.ts", 2)], false);
        let paths: Vec<(&str, usize)> = found
            .files
            .iter()
            .map(|f| (f.path.as_str(), f.matches.len()))
            .collect();
        assert_eq!(paths, vec![("A/z.ts", 2), ("b.ts", MATCH_CAP - 2)]);
        assert!(found.truncated);
    }
}
