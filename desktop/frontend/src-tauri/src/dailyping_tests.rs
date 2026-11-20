use super::*;
use std::cell::Cell;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc;

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn after(last: &str) -> Option<NaiveDate> {
    Some(day(last))
}

const INSTALLED: &str = "2026-09-14";

fn ping(weekly: bool, monthly: bool, new: bool, cohort: &str) -> Option<Ping> {
    Some(Ping {
        weekly,
        monthly,
        new,
        cohort: cohort.into(),
    })
}

fn once(dir: &Path, today: &str, send: impl Fn(&Url) -> bool) -> bool {
    ping_once(dir, "https://p.example/ping", "desktop", day(today), send)
}

#[test]
fn the_first_ping_of_a_fresh_install_is_new_and_starts_the_week_and_month() {
    let today = day("2026-11-20");
    assert_eq!(due(None, today, today), ping(true, true, true, "2026-11"));
}

#[test]
fn an_install_from_before_pings_is_not_new() {
    assert_eq!(
        due(None, day("2026-03-02"), day("2026-11-20")),
        ping(true, true, false, "2026-03")
    );
}

#[test]
fn one_ping_a_day() {
    let installed = day(INSTALLED);
    assert_eq!(due(after("2026-11-20"), installed, day("2026-11-20")), None);
    assert_eq!(
        due(after("2026-11-19"), installed, day("2026-11-20")),
        ping(false, false, false, "2026-09")
    );
}

#[test]
fn a_week_starts_on_monday() {
    let installed = day(INSTALLED);
    assert_eq!(
        due(after("2026-11-16"), installed, day("2026-11-22")),
        ping(false, false, false, "2026-09")
    );
    assert_eq!(
        due(after("2026-11-22"), installed, day("2026-11-23")),
        ping(true, false, false, "2026-09")
    );
}

#[test]
fn a_week_that_spans_new_year_counts_once() {
    let installed = day(INSTALLED);
    assert_eq!(
        due(after("2026-12-28"), installed, day("2027-01-03")),
        ping(false, true, false, "2026-09")
    );
    assert_eq!(
        due(after("2027-01-03"), installed, day("2027-01-04")),
        ping(true, false, false, "2026-09")
    );
}

#[test]
fn a_month_starts_on_the_first() {
    assert_eq!(
        due(after("2026-11-30"), day(INSTALLED), day("2026-12-01")),
        ping(false, true, false, "2026-09")
    );
}

#[test]
fn a_clock_set_back_sends_nothing() {
    assert_eq!(
        due(after("2026-11-20"), day(INSTALLED), day("2026-11-18")),
        None
    );
}

#[test]
fn on_until_turned_off() {
    assert!(allows(&serde_json::json!({})));
    assert!(allows(&serde_json::json!({ "dailyPing": true })));
    assert!(!allows(&serde_json::json!({ "dailyPing": false })));
}

#[test]
fn the_url_carries_flags_and_no_id() {
    let url = ping_url(
        "https://ping.example/ping",
        &Ping {
            weekly: true,
            monthly: false,
            new: false,
            cohort: "2026-09".into(),
        },
        "host",
    )
    .unwrap();
    let query: Vec<(String, String)> = url.query_pairs().into_owned().collect();
    let keys: Vec<&str> = query.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(keys, ["v", "os", "arch", "kind", "w", "m", "new", "cohort"]);
    let value = |key: &str| query.iter().find(|(k, _)| k == key).unwrap().1.clone();
    assert_eq!(value("v"), crate::commands_real::get_version());
    assert_eq!(value("os"), std::env::consts::OS);
    assert_eq!(value("kind"), "host");
    assert_eq!(
        (value("w"), value("m"), value("new")),
        ("1".into(), "0".into(), "0".into())
    );
    assert_eq!(value("cohort"), "2026-09");
}

#[test]
fn a_settled_ping_is_noted_and_not_sent_again_that_day() {
    let dir = tempfile::tempdir().unwrap();
    let sends = Cell::new(0);
    let count = |_: &Url| {
        sends.set(sends.get() + 1);
        true
    };

    assert!(once(dir.path(), "2026-11-20", count));
    assert!(once(dir.path(), "2026-11-20", count));
    assert_eq!(sends.get(), 1);

    let saved: Value =
        serde_json::from_slice(&std::fs::read(dir.path().join(STAMP_FILE)).unwrap()).unwrap();
    assert_eq!(saved["last"], "2026-11-20");
    assert!(saved["installed"]
        .as_str()
        .is_some_and(|d| d <= "2026-11-20"));
}

#[test]
fn an_unsettled_ping_is_tried_again() {
    let dir = tempfile::tempdir().unwrap();
    assert!(!once(dir.path(), "2026-11-20", |_| false));
    assert!(!dir.path().join(STAMP_FILE).exists());
    assert!(once(dir.path(), "2026-11-20", |_| true));
}

#[test]
fn the_install_month_stays_what_the_first_ping_said() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join(STAMP_FILE),
        r#"{"last":"2026-11-19","installed":"2026-02-03"}"#,
    )
    .unwrap();
    let seen = Cell::new(String::new());
    once(dir.path(), "2026-11-20", |url| {
        seen.set(url.to_string());
        true
    });
    assert!(seen.take().contains("cohort=2026-02"));
}

/// A stand-in ping server on a local port that answers `status` and hands back
/// each request line it got.
fn server(status: u16) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}/ping", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut reader = BufReader::new(&stream);
            let mut request = String::new();
            let _ = reader.read_line(&mut request);
            let mut header = String::new();
            while reader.read_line(&mut header).is_ok_and(|n| n > 2) {
                header.clear();
            }
            let _ = tx.send(request.trim().to_string());
            let _ = (&stream).write_all(
                format!("HTTP/1.1 {status} X\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .as_bytes(),
            );
        }
    });
    (base, rx)
}

#[test]
fn a_counted_or_refused_ping_is_settled_and_a_failing_server_is_not() {
    for (status, settled) in [(204, true), (400, true), (429, false), (503, false)] {
        let (base, requests) = server(status);
        let url = Url::parse(&format!("{base}?kind=desktop")).unwrap();
        assert_eq!(send(&url), settled, "status {status}");
        assert_eq!(requests.recv().unwrap(), "GET /ping?kind=desktop HTTP/1.1");
    }
}

#[test]
fn no_server_is_not_settled() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}/ping", listener.local_addr().unwrap());
    drop(listener);
    assert!(!send(&Url::parse(&base).unwrap()));
}

#[test]
fn a_settled_day_is_checked_again_within_an_hour() {
    let at = |s: &str| DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc);
    let spread = Duration::from_secs(300);
    assert_eq!(nap(at("2026-11-20T18:40:00Z"), spread), MAX_NAP);
    assert_eq!(
        nap(at("2026-11-20T23:50:00Z"), spread),
        Duration::from_secs(900)
    );
    assert_eq!(
        nap(at("2026-11-20T23:59:59Z"), Duration::ZERO),
        Duration::from_secs(1)
    );
}
