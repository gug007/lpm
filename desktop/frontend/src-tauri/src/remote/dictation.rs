// A phone's take, transcribed by this Mac's VoiceToText. The phone's mic records
// and streams what it hears (`dictateAudio`); VoiceToText turns it into text with
// the model the user picked, and its events go back as `dictation` frames, the
// same ones the desktop recorder draws from. VoiceToText sends a take's events
// only to the connection that started it, so each phone take holds a socket of
// its own and never touches the desktop's. Closing that socket cancels the take,
// which is how a phone that went away ends it.
use super::RemoteWatch;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, SyncSender};
use std::sync::Arc;

/// The phone may send `dictateStart`, `dictateAudio`, `dictateStop` and
/// `dictateCancel`. Offered only while an installed VoiceToText takes audio from
/// other apps; without one the phone uses its own recognizer.
pub(super) const FEATURE: &str = "dictation";

// One take per connection, under one key in the connection's `watches`.
const WATCH: &str = "dictation";
#[cfg(target_os = "macos")]
const OUTDATED: &str = "Update VoiceToText to dictate from your phone.";
#[cfg(target_os = "macos")]
const START_ID: u64 = 1;
#[cfg(target_os = "macos")]
const STOP_ID: u64 = 2;

// `Started` and `Over` come from VoiceToText's side of a take.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
enum Step {
    Audio(String),
    Stop,
    Started,
    Over,
}

pub(super) struct Take {
    id: String,
    feed: Sender<Step>,
}

pub(super) fn available() -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::voicetotext_api::takes_audio()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Answer one of `dictateStart`, `dictateAudio`, `dictateStop`, `dictateCancel`.
pub(super) fn handle(
    out: &SyncSender<String>,
    watches: &mut HashMap<String, RemoteWatch>,
    t: &str,
    v: &Value,
) {
    let id = v.get("id").and_then(Value::as_str).unwrap_or_default();
    if t == "dictateStart" {
        end(watches);
        let (feed, steps) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let worker = (id.to_string(), feed.clone(), steps, stop.clone());
        spawn_take(worker, out.clone());
        let take = Take {
            id: id.to_string(),
            feed,
        };
        watches.insert(
            WATCH.to_string(),
            RemoteWatch {
                stop,
                _watcher: None,
                take: Some(take),
            },
        );
        return;
    }
    let Some(take) = watches
        .get(WATCH)
        .and_then(|w| w.take.as_ref())
        .filter(|take| take.id == id)
    else {
        return;
    };
    match t {
        "dictateAudio" => {
            let pcm = v.get("pcm").and_then(Value::as_str).unwrap_or_default();
            let _ = take.feed.send(Step::Audio(pcm.to_string()));
        }
        "dictateStop" => {
            let _ = take.feed.send(Step::Stop);
        }
        _ => end(watches),
    }
}

fn end(watches: &mut HashMap<String, RemoteWatch>) {
    if let Some(w) = watches.remove(WATCH) {
        w.stop.store(true, Ordering::SeqCst);
    }
}

type Worker = (String, Sender<Step>, Receiver<Step>, Arc<AtomicBool>);

// A worker's own thread holds the frame back rather than dropping it: a phone
// that is still connected is waiting on this.
fn report(out: &SyncSender<String>, id: &str, mut event: Value) {
    event["t"] = json!("dictation");
    event["id"] = json!(id);
    let _ = out.send(event.to_string());
}

fn refusal(code: &str, message: &str) -> Value {
    json!({ "event": "error", "code": code, "message": message })
}

#[cfg(not(target_os = "macos"))]
fn spawn_take((id, ..): Worker, out: SyncSender<String>) {
    let refused = refusal(
        "unavailable",
        "Voice dictation is not available on this platform",
    );
    report(&out, &id, refused);
}

#[cfg(target_os = "macos")]
fn spawn_take((id, feed, steps, stop): Worker, out: SyncSender<String>) {
    use crate::voicetotext_api::{self as api, Unavailable};
    use std::net::Shutdown;
    std::thread::spawn(move || {
        let stream = match api::open() {
            Ok(stream) => stream,
            Err(why) => {
                let refused = match why {
                    Unavailable::NotInstalled => {
                        refusal("unavailable", "VoiceToText is not installed.")
                    }
                    Unavailable::Legacy => refusal("unavailable", OUTDATED),
                    Unavailable::Failed(message) => refusal("unavailable", &message),
                };
                return report(&out, &id, refused);
            }
        };
        let Ok(events) = stream.try_clone() else {
            return report(
                &out,
                &id,
                refusal("unavailable", "Could not reach VoiceToText."),
            );
        };
        let reader = (id.clone(), feed, stop.clone(), out);
        std::thread::spawn(move || read_events(events, reader));
        write_steps(&stream, &steps, &stop);
        let _ = stream.shutdown(Shutdown::Both);
    });
}

// Audio waits here until VoiceToText says it is recording, which can take as long
// as launching it and loading its model, so the phone can start talking at once.
#[cfg(target_os = "macos")]
fn write_steps(mut stream: &crate::ipc::UnixStream, steps: &Receiver<Step>, stop: &AtomicBool) {
    use std::io::Write;
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::Duration;
    const POLL: Duration = Duration::from_millis(100);
    const WRITE_TIMEOUT: Duration = Duration::from_secs(2);

    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let audio = |pcm: &str| json!({ "method": "audio", "params": { "pcm": pcm } }).to_string();
    let halt = json!({ "id": STOP_ID, "method": "stop" }).to_string();
    let begin =
        json!({ "id": START_ID, "method": "startStream", "params": { "client": "lpm-phone" } });
    if writeln!(stream, "{begin}").is_err() {
        return;
    }
    let mut waiting = Vec::new();
    let mut started = false;
    let mut stopping = false;
    while !stop.load(Ordering::SeqCst) {
        let lines = match steps.recv_timeout(POLL) {
            Ok(Step::Audio(pcm)) if started => vec![audio(&pcm)],
            Ok(Step::Audio(pcm)) => {
                waiting.push(pcm);
                continue;
            }
            Ok(Step::Stop) if started => vec![halt.clone()],
            Ok(Step::Stop) => {
                stopping = true;
                continue;
            }
            Ok(Step::Started) => {
                started = true;
                let mut lines: Vec<String> = waiting.drain(..).map(|pcm| audio(&pcm)).collect();
                if stopping {
                    lines.push(halt.clone());
                }
                lines
            }
            Ok(Step::Over) | Err(RecvTimeoutError::Disconnected) => return,
            Err(RecvTimeoutError::Timeout) => continue,
        };
        for line in lines {
            if writeln!(stream, "{line}").is_err() {
                return;
            }
        }
    }
}

// Forwards the take's events to the phone until it ends: every take ends with
// `state: idle`, so a socket that closes first means VoiceToText went away.
#[cfg(target_os = "macos")]
fn read_events(
    stream: crate::ipc::UnixStream,
    (id, feed, stop, out): (String, Sender<Step>, Arc<AtomicBool>, SyncSender<String>),
) {
    use crate::voicetotext_api::translate;
    use std::io::{BufRead, BufReader};

    let mut ended = false;
    for line in BufReader::new(stream).lines() {
        let Ok(line) = line else { break };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let method = (msg.get("id").and_then(Value::as_u64) == Some(START_ID)).then_some("start");
        let Some(event) = translate(&msg, method) else {
            continue;
        };
        let kind = event["event"].as_str().unwrap_or_default();
        if kind == "started" {
            let _ = feed.send(Step::Started);
        }
        ended = kind == "state" && event["state"] == "idle";
        if ended {
            break;
        }
        if kind == "error" && event["code"] == "unknown_method" {
            report(&out, &id, refusal("unavailable", OUTDATED));
        } else {
            report(&out, &id, event);
        }
    }
    if !ended && !stop.load(Ordering::SeqCst) {
        let lost = refusal(
            "disconnected",
            "VoiceToText quit before the transcript was ready.",
        );
        report(&out, &id, lost);
    }
    let _ = feed.send(Step::Over);
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use crate::ipc::UnixStream;
    use std::io::{BufRead, BufReader, Write};
    use std::time::Duration;

    struct Harness {
        voice: BufReader<UnixStream>,
        feed: Sender<Step>,
        phone: Receiver<String>,
        stop: Arc<AtomicBool>,
    }

    // Runs a take's two threads against a stand-in for VoiceToText.
    fn take() -> Harness {
        let (ours, voice) = UnixStream::pair().unwrap();
        voice
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let (feed, steps) = mpsc::channel();
        let (out, phone) = mpsc::sync_channel(16);
        let stop = Arc::new(AtomicBool::new(false));
        let events = ours.try_clone().unwrap();
        let reader = ("take".to_string(), feed.clone(), stop.clone(), out);
        std::thread::spawn(move || read_events(events, reader));
        let stopped = stop.clone();
        std::thread::spawn(move || {
            write_steps(&ours, &steps, &stopped);
            let _ = ours.shutdown(std::net::Shutdown::Both);
        });
        Harness {
            voice: BufReader::new(voice),
            feed,
            phone,
            stop,
        }
    }

    impl Harness {
        fn request(&mut self) -> Value {
            let mut line = String::new();
            self.voice.read_line(&mut line).unwrap();
            serde_json::from_str(&line).unwrap()
        }

        fn answer(&mut self, msg: Value) {
            writeln!(self.voice.get_mut(), "{msg}").unwrap();
        }

        fn frame(&self) -> Value {
            let frame = self.phone.recv_timeout(Duration::from_secs(5)).unwrap();
            serde_json::from_str(&frame).unwrap()
        }
    }

    #[test]
    fn audio_waits_for_recording_and_keeps_its_order() {
        let mut h = take();
        assert_eq!(h.request()["method"], "startStream");
        h.feed.send(Step::Audio("one".into())).unwrap();
        h.feed.send(Step::Stop).unwrap();
        h.answer(json!({ "id": 1, "ok": true, "result": { "model": { "name": "Parakeet" } } }));
        assert_eq!(h.frame()["event"], "started");
        assert_eq!(h.request()["params"]["pcm"], "one");
        assert_eq!(h.request()["method"], "stop");
    }

    #[test]
    fn events_reach_the_phone_named_for_the_take() {
        let mut h = take();
        h.request();
        h.answer(json!({ "event": "transcript", "text": "hello", "duration": 1.5 }));
        let frame = h.frame();
        assert_eq!(frame["t"], "dictation");
        assert_eq!(frame["id"], "take");
        assert_eq!(frame["event"], "transcript");
        assert_eq!(frame["text"], "hello");
    }

    #[test]
    fn a_refused_start_reaches_the_phone_and_ends_the_take() {
        let mut h = take();
        h.request();
        h.answer(json!({ "id": 1, "ok": false, "error": { "code": "busy", "message": "Busy." } }));
        h.answer(json!({ "event": "state", "state": "idle" }));
        assert_eq!(h.frame()["code"], "busy");
        let mut line = String::new();
        assert_eq!(
            h.voice.read_line(&mut line).unwrap(),
            0,
            "the socket closes"
        );
    }

    #[test]
    fn an_older_voicetotext_is_told_apart() {
        let mut h = take();
        h.request();
        let unknown = json!({ "code": "unknown_method", "message": "Unknown method." });
        h.answer(json!({ "id": 1, "ok": false, "error": unknown }));
        let frame = h.frame();
        assert_eq!(frame["code"], "unavailable");
        assert_eq!(frame["message"], OUTDATED);
    }

    #[test]
    fn voicetotext_quitting_mid_take_is_reported() {
        let mut h = take();
        h.request();
        h.voice
            .get_ref()
            .shutdown(std::net::Shutdown::Both)
            .unwrap();
        assert_eq!(h.frame()["code"], "disconnected");
    }

    #[test]
    fn stopping_closes_the_socket_without_a_report() {
        let mut h = take();
        h.request();
        h.stop.store(true, Ordering::SeqCst);
        let mut line = String::new();
        assert_eq!(
            h.voice.read_line(&mut line).unwrap(),
            0,
            "the socket closes"
        );
        assert!(h.phone.recv_timeout(Duration::from_millis(200)).is_err());
    }
}
