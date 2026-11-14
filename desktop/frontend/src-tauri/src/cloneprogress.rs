// What `git clone --progress` writes to stderr, read as phases. git redraws a
// progress line in place with \r, so the stream is split on \r and \n alike.
use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Phase {
    Counting,
    Compressing,
    Receiving,
    Resolving,
    Checkout,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Progress {
    pub phase: Phase,
    pub percent: Option<u8>,
    pub done: Option<u64>,
    pub total: Option<u64>,
    /// How much has come down so far, as git prints it ("812.00 MiB").
    pub size: Option<String>,
    pub speed: Option<String>,
    pub finished: bool,
}

fn phase_of(label: &str) -> Option<Phase> {
    Some(match label {
        "Enumerating objects" | "Counting objects" => Phase::Counting,
        "Compressing objects" => Phase::Compressing,
        "Receiving objects" | "Unpacking objects" => Phase::Receiving,
        "Resolving deltas" => Phase::Resolving,
        "Updating files" | "Checking out files" | "Filtering content" => Phase::Checkout,
        _ => return None,
    })
}

/// One progress line, e.g. `Receiving objects:  62% (765/1234), 812.00 MiB |
/// 18.00 MiB/s` or `remote: Enumerating objects: 1234, done.`. None for
/// anything else git says, which is what an error message is made of.
pub(crate) fn parse(line: &str) -> Option<Progress> {
    let line = line.trim();
    let line = line.strip_prefix("remote:").map_or(line, str::trim_start);
    let (label, rest) = line.split_once(':')?;
    let phase = phase_of(label.trim())?;
    let rest = rest.trim();
    let (body, finished) = match rest.strip_suffix(", done.") {
        Some(body) => (body, true),
        None => (rest, false),
    };
    let mut progress = Progress {
        phase,
        percent: None,
        done: None,
        total: None,
        size: None,
        speed: None,
        finished,
    };
    let Some((pct, after)) = body.split_once('%') else {
        progress.done = Some(body.trim().parse().ok()?);
        return Some(progress);
    };
    progress.percent = Some(pct.trim().parse::<u8>().ok()?.min(100));
    let Some(inner) = after.trim_start().strip_prefix('(') else {
        return Some(progress);
    };
    let (counts, tail) = inner.split_once(')')?;
    if let Some((done, total)) = counts.split_once('/') {
        progress.done = done.trim().parse().ok();
        progress.total = total.trim().parse().ok();
    }
    if let Some(throughput) = tail.trim().strip_prefix(',') {
        let mut parts = throughput
            .split('|')
            .map(str::trim)
            .filter(|s| !s.is_empty());
        progress.size = parts.next().map(str::to_string);
        progress.speed = parts.next().map(str::to_string);
    }
    Some(progress)
}

/// Splits a byte stream into the lines git drew, carrying a partial line over
/// to the next chunk and dropping the terminal escapes git may add.
#[derive(Default)]
pub(crate) struct Lines {
    buf: Vec<u8>,
}

impl Lines {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut out = Vec::new();
        for &b in chunk {
            if b == b'\r' || b == b'\n' {
                out.extend(self.take());
            } else {
                self.buf.push(b);
            }
        }
        out
    }

    pub fn finish(&mut self) -> Option<String> {
        self.take()
    }

    fn take(&mut self) -> Option<String> {
        if self.buf.is_empty() {
            return None;
        }
        let raw = String::from_utf8_lossy(&self.buf).into_owned();
        self.buf.clear();
        let line = strip_escapes(&raw);
        let line = line.trim();
        (!line.is_empty()).then(|| line.to_string())
    }
}

fn strip_escapes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        if chars.peek() == Some(&'[') {
            chars.next();
            for nc in chars.by_ref() {
                if ('\u{40}'..='\u{7e}').contains(&nc) {
                    break;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receiving_with_size_and_speed() {
        let p = parse("Receiving objects:  62% (765/1234), 812.00 MiB | 18.00 MiB/s").unwrap();
        assert_eq!(p.phase, Phase::Receiving);
        assert_eq!(p.percent, Some(62));
        assert_eq!((p.done, p.total), (Some(765), Some(1234)));
        assert_eq!(p.size.as_deref(), Some("812.00 MiB"));
        assert_eq!(p.speed.as_deref(), Some("18.00 MiB/s"));
        assert!(!p.finished);
    }

    #[test]
    fn receiving_done() {
        let p =
            parse("Receiving objects: 100% (1234/1234), 1.20 GiB | 18.00 MiB/s, done.").unwrap();
        assert_eq!(p.percent, Some(100));
        assert_eq!(p.size.as_deref(), Some("1.20 GiB"));
        assert_eq!(p.speed.as_deref(), Some("18.00 MiB/s"));
        assert!(p.finished);
    }

    #[test]
    fn remote_phases() {
        let enumerating = parse("remote: Enumerating objects: 1234, done.").unwrap();
        assert_eq!(enumerating.phase, Phase::Counting);
        assert_eq!(enumerating.percent, None);
        assert_eq!(enumerating.done, Some(1234));
        assert!(enumerating.finished);

        let counting = parse("remote: Counting objects:  40% (494/1234)        ").unwrap();
        assert_eq!(counting.phase, Phase::Counting);
        assert_eq!(counting.percent, Some(40));

        let compressing = parse("remote: Compressing objects: 100% (800/800), done.").unwrap();
        assert_eq!(compressing.phase, Phase::Compressing);
        assert!(compressing.finished);
    }

    #[test]
    fn resolving_and_checkout() {
        let resolving = parse("Resolving deltas:  45% (180/400)").unwrap();
        assert_eq!(resolving.phase, Phase::Resolving);
        assert_eq!(resolving.percent, Some(45));
        assert_eq!(resolving.size, None);

        for line in [
            "Updating files:  30% (300/1000)",
            "Checking out files:  30% (300/1000)",
            "Filtering content:  50% (1/2), 1.00 MiB | 1.00 MiB/s",
        ] {
            let p = parse(line).unwrap();
            assert_eq!(p.phase, Phase::Checkout, "{line}");
            assert!(p.percent.is_some(), "{line}");
        }
    }

    #[test]
    fn unpacking_counts_as_receiving() {
        let p = parse("Unpacking objects: 100% (3/3), 1.23 KiB | 630.00 KiB/s, done.").unwrap();
        assert_eq!(p.phase, Phase::Receiving);
        assert_eq!(p.size.as_deref(), Some("1.23 KiB"));
        assert!(p.finished);
    }

    #[test]
    fn other_lines_are_not_progress() {
        for line in [
            "Cloning into 'storefront'...",
            "remote: Total 1234 (delta 400), reused 1000 (delta 300), pack-reused 0",
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
            "fatal: repository 'https://github.com/acme/nope/' not found",
            "Receiving objects: lots",
            "",
        ] {
            assert_eq!(parse(line), None, "{line}");
        }
    }

    #[test]
    fn lines_split_on_carriage_returns_across_chunks() {
        let mut lines = Lines::default();
        assert_eq!(
            lines.push(b"Receiving objects:  1% (1/100)\rReceiving obj"),
            vec!["Receiving objects:  1% (1/100)".to_string()]
        );
        assert_eq!(
            lines.push(b"ects:  2% (2/100)\r\nremote: Total 3\x1b[K\n"),
            vec![
                "Receiving objects:  2% (2/100)".to_string(),
                "remote: Total 3".to_string()
            ]
        );
        assert_eq!(lines.push(b"fatal: boom"), Vec::<String>::new());
        assert_eq!(lines.finish().as_deref(), Some("fatal: boom"));
        assert_eq!(lines.finish(), None);
    }
}
