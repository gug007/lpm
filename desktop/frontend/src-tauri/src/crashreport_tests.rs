use super::*;
use sentry::{Client, Hub, Level, Scope};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::Mutex;

#[derive(Default)]
struct Recorder {
    envelopes: Mutex<Vec<Envelope>>,
}

impl Recorder {
    fn events(&self) -> Vec<Event<'static>> {
        let envelopes = self.envelopes.lock().unwrap();
        envelopes.iter().filter_map(|e| e.event().cloned()).collect()
    }
}

impl Transport for Recorder {
    fn send_envelope(&self, envelope: Envelope) {
        self.envelopes.lock().unwrap().push(envelope);
    }
}

#[derive(Default)]
struct RecorderFactory {
    recorder: Arc<Recorder>,
    opened: AtomicBool,
}

impl TransportFactory for RecorderFactory {
    fn create_transport_with_options(&self, _: TransportOptions) -> Arc<dyn Transport> {
        self.opened.store(true, Ordering::Release);
        self.recorder.clone()
    }
}

struct Fixture {
    hub: Arc<Hub>,
    consent: Arc<AtomicBool>,
    factory: Arc<RecorderFactory>,
}

fn hub(
    dsn: &str,
    transport: Arc<dyn TransportFactory>,
    consented: bool,
) -> (Arc<Hub>, Arc<AtomicBool>) {
    let consent = Arc::new(AtomicBool::new(consented));
    let asked = consent.clone();
    let client = Client::with_options(options(
        dsn.parse().unwrap(),
        Arc::new(move || asked.load(Ordering::Acquire)),
        transport,
    ));
    let hub = Hub::new(Some(Arc::new(client)), Arc::new(Scope::default()));
    (Arc::new(hub), consent)
}

fn fixture(consented: bool) -> Fixture {
    let factory = Arc::new(RecorderFactory::default());
    let (hub, consent) = hub("https://key@sentry.invalid/1", factory.clone(), consented);
    Fixture {
        hub,
        consent,
        factory,
    }
}

#[test]
fn nothing_is_sent_or_even_connected_without_consent() {
    let f = fixture(false);
    f.hub.capture_message("boom", Level::Error);
    assert!(f.hub.client().unwrap().flush(None));
    assert!(f.factory.recorder.events().is_empty());
    assert!(!f.factory.opened.load(Ordering::Acquire));
}

#[test]
fn consent_is_asked_again_for_every_event() {
    let f = fixture(false);
    f.hub.capture_message("before", Level::Error);
    f.consent.store(true, Ordering::Release);
    f.hub.capture_message("during", Level::Error);
    f.consent.store(false, Ordering::Release);
    f.hub.capture_message("after", Level::Error);

    let events = f.factory.recorder.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].message.as_deref(), Some("during"));
}

#[test]
fn an_event_leaves_without_the_machine_or_its_owner() {
    let f = fixture(true);
    f.hub.capture_message(
        "open /Users/alice/Projects/app failed, token=abc123",
        Level::Error,
    );

    let events = f.factory.recorder.events();
    assert_eq!(events[0].server_name, None);
    assert_eq!(events[0].user, None);
    assert!(!events[0].contexts.contains_key("device"));
    assert!(events[0].contexts.contains_key("os"));
    assert_eq!(
        events[0].message.as_deref(),
        Some("open ~/Projects/app failed, token=[REDACTED]")
    );
    assert_eq!(events[0].release.as_deref(), Some("lpm-desktop@dev"));
}

#[test]
fn a_panic_is_named_and_grouped_by_where_it_was_raised() {
    let f = fixture(true);
    Hub::run(f.hub.clone(), || {
        let _ = std::panic::catch_unwind(|| panic!("no such dir /home/bob/work"));
    });

    let events = f.factory.recorder.events();
    assert_eq!(events.len(), 1);
    let event = &events[0];
    assert_eq!(event.level, Level::Fatal);
    assert_eq!(
        event.exception.values[0].value.as_deref(),
        Some("no such dir ~/work")
    );
    let location = &event.tags["panic.location"];
    assert!(location.contains("crashreport_tests.rs:"), "{location}");
    assert_eq!(event.fingerprint.len(), 2);
    assert_eq!(event.fingerprint[0], "panic");
}

#[test]
fn redact_agrees_with_the_frontend_on_the_shared_examples() {
    let examples: Vec<(String, String)> =
        serde_json::from_str(include_str!("../../src/redaction.vectors.json")).unwrap();
    for (input, expected) in examples {
        assert_eq!(redact(&input), expected, "{input}");
    }
}

// The real transport, against a listener standing in for Sentry.
#[test]
fn a_consented_event_is_posted_to_the_dsn_host() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (posted, received) = mpsc::channel();
    std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(&stream);
        let mut request = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            request.push_str(&line);
            if line == "\r\n" {
                break;
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        request.push_str(&String::from_utf8_lossy(&body));
        (&stream)
            .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}")
            .unwrap();
        let _ = posted.send(request);
    });

    let (hub, consent) = hub(
        &format!("http://key@127.0.0.1:{port}/1"),
        Arc::new(DefaultTransportFactory),
        false,
    );
    hub.capture_message("held back", Level::Error);
    consent.store(true, Ordering::Release);
    hub.capture_message("lost /Users/alice/.lpm/settings.json", Level::Error);
    hub.client().unwrap().flush(Some(Duration::from_secs(10)));

    let request = received.recv_timeout(Duration::from_secs(10)).unwrap();
    assert!(request.starts_with("POST /api/1/envelope/"), "{request}");
    assert!(request.contains("lost ~/.lpm/settings.json"), "{request}");
    assert!(!request.contains("alice"), "{request}");
    assert!(!request.contains("server_name"), "{request}");
    // Not the event from before the switch, and not a count of it either.
    assert!(!request.contains("held back"), "{request}");
    assert!(!request.contains("client_report"), "{request}");
}
