// What agents made through `lpm generate`: one JSON line per file, kept on this
// computer. It answers "how was this made" for a file, today's spend for the
// daily limit, and this month's totals for Settings. The projects allowed to
// generate without asking live beside it.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;

const LOG_MAX_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Record {
    pub at: i64,
    pub kind: String,
    pub model: String,
    pub label: String,
    pub prompt: String,
    pub path: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub agent: String,
    pub cents: f64,
    pub bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Usage {
    pub images: u32,
    pub clips: u32,
    pub cents: f64,
    pub today_cents: f64,
}

fn log_path() -> PathBuf {
    crate::config::lpm_dir().join("generated.jsonl")
}

fn allowed_path() -> PathBuf {
    crate::config::lpm_dir().join("generate-allowed.json")
}

pub(crate) fn append(record: &Record) {
    let path = log_path();
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > LOG_MAX_BYTES) {
        if let Ok(bytes) = std::fs::read(&path) {
            let keep = bytes.len() / 2;
            let cut = bytes[keep..]
                .iter()
                .position(|&b| b == b'\n')
                .map_or(bytes.len(), |i| keep + i + 1);
            let _ =
                crate::fsatomic::write(&path, &bytes[cut..], crate::fsatomic::Mode::Exact(0o600));
        }
    }
    let Ok(line) = serde_json::to_string(record) else {
        return;
    };
    let _ = std::fs::create_dir_all(crate::config::lpm_dir());
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    if let Ok(mut file) = crate::fsperm::open_mode(&mut options, 0o600).open(&path) {
        let _ = writeln!(file, "{line}");
    }
}

fn records() -> Vec<Record> {
    let Ok(text) = std::fs::read_to_string(log_path()) else {
        return Vec::new();
    };
    parse(&text)
}

fn parse(text: &str) -> Vec<Record> {
    text.lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect()
}

/// The newest record of the file at `path`.
pub(crate) fn for_path(path: &str) -> Option<Record> {
    records().into_iter().rev().find(|r| r.path == path)
}

pub(crate) fn usage(month_start: i64, today_start: i64) -> Usage {
    totals(&records(), month_start, today_start)
}

fn totals(list: &[Record], month_start: i64, today_start: i64) -> Usage {
    let mut usage = Usage::default();
    for r in list.iter().filter(|r| r.at >= month_start) {
        if r.kind == "speech" {
            usage.clips += 1;
        } else {
            usage.images += 1;
        }
        usage.cents += r.cents;
        if r.at >= today_start {
            usage.today_cents += r.cents;
        }
    }
    usage
}

pub(crate) fn now() -> i64 {
    chrono::Local::now().timestamp()
}

pub(crate) fn today_start() -> i64 {
    use chrono::{Local, TimeZone};
    let midnight = Local::now().date_naive().and_hms_opt(0, 0, 0);
    midnight
        .and_then(|m| Local.from_local_datetime(&m).earliest())
        .map_or_else(now, |t| t.timestamp())
}

pub(crate) fn month_start() -> i64 {
    use chrono::{Datelike, Local, NaiveDate, TimeZone};
    let today = Local::now().date_naive();
    NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|m| Local.from_local_datetime(&m).earliest())
        .map_or_else(today_start, |t| t.timestamp())
}

/// Projects allowed to generate without asking ("Ask once per project").
pub(crate) fn allowed_projects() -> Vec<String> {
    std::fs::read_to_string(allowed_path())
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|v| {
            v.as_array().map(|a| {
                a.iter()
                    .filter_map(|p| p.as_str().map(str::to_string))
                    .collect()
            })
        })
        .unwrap_or_default()
}

pub(crate) fn is_allowed(project: &str) -> bool {
    !project.is_empty() && allowed_projects().iter().any(|p| p == project)
}

pub(crate) fn allow(project: &str) {
    if project.is_empty() || is_allowed(project) {
        return;
    }
    let mut list = allowed_projects();
    list.push(project.to_string());
    save_allowed(&list);
}

pub(crate) fn forget_allowed() {
    save_allowed(&[]);
}

fn save_allowed(list: &[String]) {
    let _ = std::fs::create_dir_all(crate::config::lpm_dir());
    if let Ok(bytes) = serde_json::to_vec(list) {
        let _ =
            crate::fsatomic::write(&allowed_path(), &bytes, crate::fsatomic::Mode::Exact(0o600));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(at: i64, kind: &str, cents: f64, path: &str) -> Record {
        Record {
            at,
            kind: kind.into(),
            cents,
            path: path.into(),
            ..Default::default()
        }
    }

    #[test]
    fn totals_count_this_month_and_today_apart() {
        let list = vec![
            record(50, "image", 13.4, "/a.png"),
            record(150, "image", 3.4, "/b.png"),
            record(250, "speech", 1.0, "/c.mp3"),
        ];
        let usage = totals(&list, 100, 200);
        assert_eq!((usage.images, usage.clips), (1, 1));
        assert!((usage.cents - 4.4).abs() < 1e-9);
        assert!((usage.today_cents - 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_bad_line_is_skipped_not_fatal() {
        let good = serde_json::to_string(&record(1, "image", 3.4, "/a.png")).unwrap();
        let list = parse(&format!("{{oops\n{good}\n\n"));
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/a.png");
    }

    #[test]
    fn the_day_starts_before_now_and_the_month_before_the_day() {
        assert!(today_start() <= now());
        assert!(month_start() <= today_start());
    }
}
