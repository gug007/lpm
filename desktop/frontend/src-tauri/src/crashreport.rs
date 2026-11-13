// Crash reports to Sentry, sent only from a machine whose owner turned them on
// (Settings › General › Privacy). A build without LPM_SENTRY_DSN has none of it.
//
// Consent is read from settings.json at the moment something would be sent, so
// turning it off stops this process, the session daemon and a headless host
// alike, with nothing to restart.

use crate::config;
use regex::Regex;
use sentry::integrations::backtrace::ProcessStacktraceIntegration;
use sentry::integrations::contexts::ContextIntegration;
use sentry::integrations::panic::PanicIntegration;
use sentry::protocol::{Event, Stacktrace};
use sentry::transports::DefaultTransportFactory;
use sentry::types::Dsn;
use sentry::{ClientOptions, Envelope, Transport, TransportFactory, TransportOptions};
use serde::Serialize;
use serde_json::Value;
use std::borrow::Cow;
use std::panic::PanicHookInfo;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

/// The settings.json switch. Per machine (syncsurface.rs): saying yes on one
/// computer never turns reports on for another.
pub(crate) const CONSENT_KEY: &str = "crashReports";

type Consent = Arc<dyn Fn() -> bool + Send + Sync>;

fn dsn() -> Option<&'static str> {
    option_env!("LPM_SENTRY_DSN")
        .map(str::trim)
        .filter(|dsn| !dsn.is_empty())
}

fn consented() -> bool {
    config::load_settings()
        .get(CONSENT_KEY)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn release() -> String {
    format!("lpm-desktop@{}", crate::commands_real::get_version())
}

fn environment() -> &'static str {
    if crate::commands_real::get_version() == "dev" {
        "development"
    } else {
        "production"
    }
}

/// Start reporting this process's panics. Hold the guard for the life of the
/// process: dropping it sends what is still queued.
pub fn init(process: &'static str) -> Option<sentry::ClientInitGuard> {
    let dsn = dsn()?.parse::<Dsn>().ok()?;
    let guard = sentry::init(options(
        dsn,
        Arc::new(consented),
        Arc::new(DefaultTransportFactory),
    ));
    sentry::configure_scope(|scope| {
        scope.set_tag("process", process);
        scope.set_tag("arch", std::env::consts::ARCH);
        scope.set_tag("headless", crate::sys::headless());
    });
    Some(guard)
}

fn options(dsn: Dsn, consent: Consent, transport: Arc<dyn TransportFactory>) -> ClientOptions {
    let mut options = ClientOptions::new();
    options.dsn = Some(dsn);
    options.release = Some(release().into());
    options.environment = Some(environment().into());
    options.default_integrations = false;
    options.integrations = vec![
        // The OS and the compiler; what model of computer it is stays here.
        Arc::new(ContextIntegration::new().add_device(false)),
        Arc::new(PanicIntegration::new().add_extractor(panic_event)),
        Arc::new(ProcessStacktraceIntegration),
    ];
    // Consent is not asked here: an event dropped at this point is counted, and
    // the count is sent along with the next report.
    options.before_send = Some(Arc::new(|event| Some(scrub(event))));
    options.transport = Some(Arc::new(ConsentGated { consent, transport }));
    options
}

// Release builds are stripped, so the stack is addresses that differ from one
// build to the next. Where the panic was raised is what names it and what
// groups it with the others like it.
fn panic_event(info: &PanicHookInfo<'_>) -> Option<Event<'static>> {
    let mut event = PanicIntegration::new().event_from_panic_info(info);
    if let Some(location) = info.location() {
        let location = format!("{}:{}", location.file(), location.line());
        event.fingerprint = Cow::Owned(vec!["panic".into(), location.clone().into()]);
        event.tags.insert("panic.location".into(), location);
    }
    Some(event)
}

/// The one way out: an envelope goes on only while the owner agrees, and the
/// connection behind it is not opened before the first one that does.
struct ConsentGated {
    consent: Consent,
    transport: Arc<dyn TransportFactory>,
}

impl TransportFactory for ConsentGated {
    fn create_transport_with_options(&self, options: TransportOptions) -> Arc<dyn Transport> {
        let factory = self.transport.clone();
        Arc::new(ConsentGate {
            consent: self.consent.clone(),
            opened: AtomicBool::new(false),
            transport: LazyLock::new(Box::new(move || {
                factory.create_transport_with_options(options)
            })),
        })
    }
}

type Opener = Box<dyn FnOnce() -> Arc<dyn Transport> + Send>;

struct ConsentGate {
    consent: Consent,
    opened: AtomicBool,
    transport: LazyLock<Arc<dyn Transport>, Opener>,
}

impl Transport for ConsentGate {
    fn send_envelope(&self, envelope: Envelope) {
        if (self.consent)() {
            self.opened.store(true, Ordering::Release);
            self.transport.send_envelope(envelope);
        }
    }

    fn flush(&self, timeout: Duration) -> bool {
        !self.opened.load(Ordering::Acquire) || self.transport.flush(timeout)
    }

    fn shutdown(&self, timeout: Duration) -> bool {
        !self.opened.load(Ordering::Acquire) || self.transport.shutdown(timeout)
    }
}

fn scrub(mut event: Event<'static>) -> Event<'static> {
    event.server_name = None;
    event.message = event.message.as_deref().map(redact);
    for exception in &mut event.exception.values {
        exception.value = exception.value.as_deref().map(redact);
        scrub_frames(exception.stacktrace.as_mut());
    }
    scrub_frames(event.stacktrace.as_mut());
    for thread in &mut event.threads.values {
        scrub_frames(thread.stacktrace.as_mut());
    }
    for value in event.tags.values_mut() {
        *value = redact(value);
    }
    event
}

fn scrub_frames(stacktrace: Option<&mut Stacktrace>) {
    for frame in stacktrace.into_iter().flat_map(|s| &mut s.frames) {
        frame.abs_path = frame.abs_path.as_deref().map(redact);
        frame.filename = frame.filename.as_deref().map(redact);
    }
}

static OWN_HOME: LazyLock<Option<String>> = LazyLock::new(|| {
    dirs::home_dir()
        .map(|home| home.to_string_lossy().into_owned())
        .filter(|home| home.len() > 1)
});
static HOME_DIR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:/Users/|/home/|\b[a-z]:[\\/]Users[\\/])[^/\\\s:]+").unwrap()
});
static BEARER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(Bearer\s+)[A-Za-z0-9._~+/=-]+").unwrap());
static SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b((?:authorization|api[_-]?key|password|passphrase|private[_-]?key|secret|token)",
        r#"\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)"#,
    ))
    .unwrap()
});

/// Whose machine this is and anything shaped like a credential stay here. The
/// frontend's `redactDiagnosticString` follows the same rules, and both are
/// held to the examples in src/redaction.vectors.json.
fn redact(text: &str) -> String {
    let text = match OWN_HOME.as_deref() {
        Some(home) => Cow::Owned(text.replace(home, "~")),
        None => Cow::Borrowed(text),
    };
    let text = HOME_DIR.replace_all(&text, "~");
    let text = BEARER.replace_all(&text, "${1}[REDACTED]");
    SECRET.replace_all(&text, "${1}[REDACTED]").into_owned()
}

#[derive(Serialize)]
pub struct CrashReportConfig {
    dsn: &'static str,
    release: String,
    environment: &'static str,
}

/// What the webview needs to report its own errors the same way, or nothing in
/// a build that reports none.
#[tauri::command]
pub fn crash_report_config() -> Option<CrashReportConfig> {
    Some(CrashReportConfig {
        dsn: dsn()?,
        release: release(),
        environment: environment(),
    })
}

/// Whether this machine's owner has reports switched on, read now. The webview
/// asks before each send, so every window answers to the one settings file.
#[tauri::command]
pub fn crash_reports_allowed() -> bool {
    consented()
}

#[cfg(test)]
#[path = "crashreport_tests.rs"]
mod tests;
