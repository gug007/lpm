// The Search view on an SSH project: the host's ripgrep when it has one, else
// its grep, read as it prints and cut off at the same cap and budget. Each line
// it reports is filtered and matched again here, so paths, columns, highlights
// and replacements come out as they do for a local project.
use crate::config::SshSettings;
use crate::file_match::{Pattern, SearchOptions};
use crate::file_search::{
    collect, line_matches, FileMatches, FileSearch, FILE_BYTES_CAP, MATCH_CAP, TIME_BUDGET,
};
use crate::file_search_filter::PathFilter;
use crate::files::MENTION_SKIP_DIRS;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(100);

// `filter` is compiled for paths relative to the project, as the host prints
// them.
pub(crate) fn search(
    ssh: &SshSettings,
    root: &str,
    query: &str,
    options: SearchOptions,
    filter: &PathFilter,
    pattern: &Pattern,
    stop: &AtomicBool,
) -> Result<FileSearch, String> {
    let (program, args) = match crate::sshexec::remote_program(ssh, "rg") {
        Some(rg) => (rg, rg_args(query, options, &filter.globs)),
        None => ("grep".to_string(), grep_args(query, options)),
    };
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut child = crate::sshexec::remote_command(ssh, root, &program, &refs, &[])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no output from the host")?;
    let stderr = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = pipe.read_to_string(&mut text);
            text
        })
    });
    // Read on a thread of its own, so a stop or the budget lands even while
    // the host prints nothing.
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(256);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut record = Vec::new();
            match reader.read_until(b'\n', &mut record) {
                Ok(0) | Err(_) => return,
                Ok(_) if tx.send(record).is_err() => return,
                Ok(_) => {}
            }
        }
    });

    let started = Instant::now();
    let mut files: Vec<FileMatches> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut count = 0;
    let mut truncated = false;
    let finished = loop {
        if stop.load(Ordering::Relaxed) {
            break false;
        }
        if count >= MATCH_CAP || started.elapsed() > TIME_BUDGET {
            truncated = true;
            break false;
        }
        let record = match rx.recv_timeout(POLL) {
            Ok(record) => record,
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break true,
        };
        let Some((path, line, text)) = parse_record(&record) else {
            continue;
        };
        if !filter.keeps(&path) {
            continue;
        }
        let mut matches = Vec::new();
        line_matches(pattern, line, &text, &mut matches, MATCH_CAP - count);
        if matches.is_empty() {
            continue;
        }
        count += matches.len();
        match index.get(&path) {
            Some(&i) => files[i].matches.extend(matches),
            None => {
                index.insert(path.clone(), files.len());
                files.push(FileMatches { path, matches });
            }
        }
    };
    drop(rx);
    if !finished {
        let _ = child.kill();
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let err = stderr.and_then(|t| t.join().ok()).unwrap_or_default();
    // Both exit 1 when nothing matched and 2 when some file couldn't be read;
    // with their file errors silenced, anything left on stderr is the reason
    // (no ssh connection, say).
    if finished && files.is_empty() && !status.success() && !err.trim().is_empty() {
        return Err(err.trim().to_string());
    }
    Ok(collect(files, truncated))
}

fn rg_args(query: &str, options: SearchOptions, globs: &[String]) -> Vec<String> {
    let mut args: Vec<String> = [
        "--no-heading",
        "--null",
        "--line-number",
        "--color=never",
        "--no-messages",
        "--hidden",
    ]
    .map(String::from)
    .to_vec();
    args.push(format!("--max-filesize={FILE_BYTES_CAP}"));
    args.push(
        if options.match_case {
            "--case-sensitive"
        } else {
            "--ignore-case"
        }
        .into(),
    );
    if options.whole_word {
        args.push("--word-regexp".into());
    }
    if !options.regex {
        args.push("--fixed-strings".into());
    }
    args.extend(MENTION_SKIP_DIRS.iter().map(|dir| format!("--glob=!{dir}")));
    args.extend(globs.iter().map(|glob| format!("--glob={glob}")));
    args.extend(["--regexp".into(), query.into(), ".".into()]);
    args
}

// grep's regexes are POSIX extended ones; a line the two dialects disagree on
// drops out when it is matched again here.
fn grep_args(query: &str, options: SearchOptions) -> Vec<String> {
    let mut args: Vec<String> = ["-rIns", "--null"].map(String::from).to_vec();
    if !options.match_case {
        args.push("-i".into());
    }
    if options.whole_word {
        args.push("-w".into());
    }
    args.push(if options.regex { "-E" } else { "-F" }.into());
    args.extend(
        MENTION_SKIP_DIRS
            .iter()
            .map(|dir| format!("--exclude-dir={dir}")),
    );
    args.extend(["-e".into(), query.into(), ".".into()]);
    args
}

// `path NUL line:text`, the same from both: the NUL ends the name so any
// character can be in it.
fn parse_record(record: &[u8]) -> Option<(String, u64, String)> {
    let nul = record.iter().position(|&b| b == 0)?;
    let path = String::from_utf8_lossy(&record[..nul]);
    let rest = &record[nul + 1..];
    let colon = rest.iter().position(|&b| b == b':')?;
    let line = std::str::from_utf8(&rest[..colon]).ok()?.parse().ok()?;
    let text = String::from_utf8_lossy(&rest[colon + 1..]).into_owned();
    Some((
        path.strip_prefix("./").unwrap_or(&path).to_string(),
        line,
        text,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_records_with_any_file_name() {
        assert_eq!(
            parse_record(b"./src/a: b.ts\x0012:  let x = useCartTotal();\n"),
            Some((
                "src/a: b.ts".into(),
                12,
                "  let x = useCartTotal();\n".into()
            ))
        );
        assert_eq!(
            parse_record(b"README.md\x003:see it\r\n").map(|r| r.1),
            Some(3)
        );
        assert_eq!(parse_record(b"no separator\n"), None);
    }

    #[test]
    fn passes_the_options_to_both_tools() {
        let literal = SearchOptions::default();
        let rg = rg_args("a.b", literal, &[]);
        assert!(rg.contains(&"--ignore-case".into()) && rg.contains(&"--fixed-strings".into()));
        assert!(rg.ends_with(&["--regexp".into(), "a.b".into(), ".".into()]));
        let exact = SearchOptions {
            match_case: true,
            whole_word: true,
            regex: true,
        };
        let rg = rg_args("a.b", exact, &[]);
        assert!(rg.contains(&"--case-sensitive".into()) && rg.contains(&"--word-regexp".into()));
        assert!(!rg.contains(&"--fixed-strings".into()));
        let grep = grep_args("-x", exact);
        assert!(
            grep.contains(&"-w".into())
                && grep.contains(&"-E".into())
                && !grep.contains(&"-i".into())
        );
        assert!(grep.ends_with(&["-e".into(), "-x".into(), ".".into()]));
        assert!(grep_args("x", literal).contains(&"-F".into()));
        let rg = rg_args("x", literal, &["**/src/**".into(), "!*.test.ts".into()]);
        assert!(
            rg.contains(&"--glob=**/src/**".into()) && rg.contains(&"--glob=!*.test.ts".into())
        );
    }
}
