// The persisted mobile-server config (~/.lpm/remote.json) and the store that
// mutates it.
//
// Two lpm instances routinely share this one file: the installed release app and
// a `npm run tauri dev` debug build. Port, server id, name and push scoping are
// already split per flavor, but `devices` is genuinely shared — so a mutation can
// never be a blind write of this process's whole in-memory struct. That erases
// every device the other instance paired since we loaded, and the phone's next
// auth is refused. Every persisted change therefore goes through `update`:
// re-read the file, keep the settings this process owns, take `devices` and
// `pairing_code` from disk, apply the caller's intent, write atomically.
use crate::config;
use serde::{Deserialize, Serialize};
use std::os::unix::io::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

pub(crate) const DEFAULT_PUSH_RELAY: &str = "https://lpm.cx/api/push"; // APNs relay (holds the signing key)

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub(crate) struct Device {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) token_hash: String, // sha256(token) hex — the raw token lives only on the phone
    pub(crate) created_at: i64,
    // Push identity (registered via `apnsToken` after each auth). apns_token is the
    // hex APNs device token; apns_env is "production"|"sandbox"; push_key is the
    // phone's base64 AES-256 key the notification payload is sealed under.
    pub(crate) apns_token: String,
    pub(crate) apns_env: String,
    pub(crate) push_key: String,
    // Per-device notification prefs (from the phone's `notify` object). Agent
    // prefs default on for older records; automation prefs default off.
    #[serde(default = "default_true")]
    pub(crate) push_waiting: bool,
    #[serde(default = "default_true")]
    pub(crate) push_done: bool,
    #[serde(default = "default_true")]
    pub(crate) push_error: bool,
    pub(crate) push_automation_started: bool,
    pub(crate) push_automation_done: bool,
    pub(crate) push_automation_error: bool,
    // The flavor-aware server id of the instance that completed this pairing (dev
    // vs prod). None on legacy entries — treated as prod — so the dev instance
    // never pushes to them and their pushes keep flowing. Scopes push delivery so a
    // phone paired with only one flavor gets no phantom pushes from the other.
    #[serde(default)]
    pub(crate) paired_server_id: Option<String>,
}

// Manual Default (not derived) so `..Default::default()` agrees with serde: agent
// prefs start true, but a derived Default would make them false.
impl Default for Device {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            token_hash: String::new(),
            created_at: 0,
            apns_token: String::new(),
            apns_env: String::new(),
            push_key: String::new(),
            push_waiting: true,
            push_done: true,
            push_error: true,
            push_automation_started: false,
            push_automation_done: false,
            push_automation_error: false,
            paired_server_id: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub(crate) struct RemoteConfig {
    pub(crate) enabled: bool,
    pub(crate) port: u16,            // 0 => DEFAULT_PORT
    pub(crate) pairing_code: String, // non-empty while an unused pairing code is outstanding
    // Millis when pairing_code was armed. 0 means unstamped — a code armed before
    // this field existed, or one an instance on an older release preserved while
    // rewriting the file without it. remote.rs stamps it on first sight and runs
    // the TTL from there.
    #[serde(default)]
    pub(crate) pairing_code_armed_at: i64,
    pub(crate) tailscale: bool, // advertise this Mac's Tailscale address in the pairing QR
    pub(crate) push_relay: String, // override for the APNs relay URL (empty => DEFAULT_PUSH_RELAY)
    // Stable identity of this Mac, minted on first run and persisted. Sent to the
    // phone so it can distinguish and label multiple paired Macs, and mixed into
    // the push collapse id so same-named projects on different Macs don't collide.
    pub(crate) server_id: Option<String>,
    // The dev instance's own stable id, so a dev and a prod build sharing this
    // config present as two distinct Macs to the phone. Prod uses `server_id`,
    // dev uses this; each mints its own lazily. Absent in legacy configs.
    #[serde(default)]
    pub(crate) dev_server_id: Option<String>,
    pub(crate) devices: Vec<Device>,
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 0,
            pairing_code: String::new(),
            pairing_code_armed_at: 0,
            tailscale: true, // away-from-home works out of the box; the toggle opts out
            push_relay: String::new(),
            server_id: None,
            dev_server_id: None,
            devices: Vec::new(),
        }
    }
}

impl RemoteConfig {
    /// The APNs relay URL to POST sealed notifications to: the configured override
    /// when set, else the lpm website's default endpoint.
    pub(crate) fn effective_relay(&self) -> String {
        if self.push_relay.trim().is_empty() {
            DEFAULT_PUSH_RELAY.to_string()
        } else {
            self.push_relay.clone()
        }
    }

    /// Fill in this flavor's stable server id if absent, returning whether one was
    /// minted (so the caller knows to persist). Dev mints/owns `dev_server_id`,
    /// prod mints/owns `server_id`, so both coexist under one shared config.
    pub(crate) fn ensure_server_id(&mut self) -> bool {
        let slot = if is_dev_instance() {
            &mut self.dev_server_id
        } else {
            &mut self.server_id
        };
        if slot.as_deref().unwrap_or_default().is_empty() {
            *slot = Some(uuid::Uuid::new_v4().to_string());
            true
        } else {
            false
        }
    }

    /// This flavor's server id (may be empty until `ensure_server_id` mints one).
    /// Every wire/push use of the server id must go through this, never the raw
    /// field, so dev and prod stay distinguishable.
    pub(crate) fn flavor_server_id(&self) -> String {
        if is_dev_instance() {
            self.dev_server_id.clone().unwrap_or_default()
        } else {
            self.server_id.clone().unwrap_or_default()
        }
    }

    /// The prod (non-dev) server id — the default owner assumed for legacy device
    /// records that predate per-flavor push scoping.
    pub(crate) fn prod_server_id(&self) -> String {
        self.server_id.clone().unwrap_or_default()
    }
}

// Dev/prod discriminator for coexisting on one Mac with a shared ~/.lpm: the
// `npm run tauri dev` build compiles a debug binary; the shipped app is release.
// This drives the per-flavor port, server id, name suffix, and push scoping so a
// dev and a prod instance never fight over the same identity or port.
pub(crate) fn is_dev_instance() -> bool {
    cfg!(debug_assertions)
}

// --- the file ----------------------------------------------------------------

// Test-only override so a test exercising the real pair path (which persists on
// success) writes to a temp file instead of the user's ~/.lpm/remote.json. A
// static (not an env var) avoids the data race of mutating the process
// environment while other test threads run.
#[cfg(test)]
pub(crate) static TEST_CONFIG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Held for the whole body of any test that sets `TEST_CONFIG_PATH`. Without it,
/// two such tests running in parallel let one clear the override while the other
/// is mid-write — and that write lands on the user's real ~/.lpm/remote.json.
#[cfg(test)]
pub(crate) static TEST_CONFIG_PATH_GUARD: Mutex<()> = Mutex::new(());

/// A poisoned lock (some other thread panicked while holding it) must not turn
/// every later config change into a panic, so every lock in this module recovers
/// the guard instead of unwrapping.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `lock` for a caller that must not wait: `None` only for genuine contention,
/// never for a lock a panicking thread poisoned.
fn try_lock<T>(m: &Mutex<T>) -> Option<MutexGuard<'_, T>> {
    match m.try_lock() {
        Ok(g) => Some(g),
        Err(std::sync::TryLockError::Poisoned(e)) => Some(e.into_inner()),
        Err(std::sync::TryLockError::WouldBlock) => None,
    }
}

pub(crate) fn config_path() -> PathBuf {
    #[cfg(test)]
    if let Some(p) = lock(&TEST_CONFIG_PATH).clone() {
        return p;
    }
    config::lpm_dir().join("remote.json")
}

/// The config as it is on disk, or `None` when it is missing, unreadable or not
/// parseable.
fn read_config(path: &Path) -> Option<RemoteConfig> {
    parse_config(&std::fs::read(path).ok()?)
}

fn parse_config(bytes: &[u8]) -> Option<RemoteConfig> {
    serde_json::from_slice(bytes).ok()
}

pub(crate) fn load_config() -> RemoteConfig {
    read_config(&config_path()).unwrap_or_default()
}

/// Persist `cfg`, unless it serializes to exactly the bytes `unchanged_from`
/// already holds. Skipping the identical write keeps the paths that commonly
/// change nothing — a rejected pairing code, a push token cleared twice — from
/// fsyncing the file on every attempt.
fn write_config_unless_same(
    path: &Path,
    cfg: &RemoteConfig,
    unchanged_from: Option<&[u8]>,
) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    if unchanged_from == Some(data.as_slice()) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // remote.json holds device token hashes and push keys — Exact(0o600) so the
    // temp never exists at a wider mode and the file stays 0600 on first creation.
    crate::fsatomic::write(path, &data, crate::fsatomic::Mode::Exact(0o600))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
fn write_config(path: &Path, cfg: &RemoteConfig) -> Result<(), String> {
    write_config_unless_same(path, cfg, None)
}

// --- cross-process locking ---------------------------------------------------

const LOCK_ATTEMPTS: u32 = 50;
const LOCK_RETRY: Duration = Duration::from_millis(20);

/// An exclusive advisory lock on `<config>.lock`, held for the span of one
/// read-modify-write so a concurrent instance can't read between our read and our
/// write. Closing the file releases the flock, so `Drop` needs no body.
struct FileLock(#[allow(dead_code)] std::fs::File);

/// Whether a failed lock attempt is worth waiting on. Only genuine contention
/// (another instance holds it) and an interrupted call are: a filesystem that
/// doesn't implement advisory locks at all — some network home directories,
/// including on a headless Linux host — fails identically forever, and retrying
/// would put a full second of sleeps in front of every single save.
fn lock_retryable(errno: Option<i32>) -> bool {
    // EAGAIN shares EWOULDBLOCK's value on every target this builds for.
    matches!(errno, Some(libc::EWOULDBLOCK) | Some(libc::EINTR))
}

/// Take the lock, or give up and let the caller proceed unlocked — neither a
/// stuck lock holder nor a filesystem without locking may freeze pairing or a
/// settings save.
fn lock_file(path: &Path) -> Option<FileLock> {
    let mut name = path.file_name()?.to_os_string();
    name.push(".lock");
    let lock_path = path.with_file_name(name);
    if let Some(parent) = lock_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&lock_path)
        .ok()?;
    for _ in 0..LOCK_ATTEMPTS {
        if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
            return Some(FileLock(file));
        }
        if !lock_retryable(std::io::Error::last_os_error().raw_os_error()) {
            return None;
        }
        std::thread::sleep(LOCK_RETRY);
    }
    None
}

fn warn_lock_unavailable() {
    static WARNED: AtomicBool = AtomicBool::new(false);
    if !WARNED.swap(true, Ordering::Relaxed) {
        eprintln!("warning: could not lock remote.json — saving without cross-process locking");
    }
}

// --- read-modify-write -------------------------------------------------------

/// Serializes this process's remote.json writes. Deliberately not the hub's
/// in-memory config mutex: that one is read on the per-connection hot path and
/// must never be held across a file read or an fsync.
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// Re-base the settings this process owns onto the state we just read, so a
/// second instance's toggles never spontaneously flip under a running server.
/// `devices` and `pairing_code` (with its armed-at timestamp) deliberately stay
/// as they are on disk: another instance's pairings must survive our write, and
/// a code it already consumed must not come back to life.
fn rebase_owned_settings(next: &mut RemoteConfig, mem: &RemoteConfig) {
    next.enabled = mem.enabled;
    next.port = mem.port;
    next.tailscale = mem.tailscale;
    next.push_relay = mem.push_relay.clone();
    next.server_id = mem.server_id.clone().or_else(|| next.server_id.take());
    next.dev_server_id = mem
        .dev_server_id
        .clone()
        .or_else(|| next.dev_server_id.take());
}

/// What a mutation builds on: the parsed file plus the exact bytes it came from,
/// this process's own config when there is no file yet, or a refusal.
enum Base {
    Disk(RemoteConfig, Vec<u8>),
    FirstRun,
    Unusable(String),
}

/// Why a store operation could not be completed. The two are different problems
/// for the user: an unusable file freezes every save until it is replaced (and
/// the pairings in it may still be recoverable, so it is never overwritten),
/// while a failed write is about this one save.
#[derive(Debug)]
pub(crate) enum StoreError {
    Unusable(String),
    Write(String),
}

impl StoreError {
    pub(crate) fn is_unusable(&self) -> bool {
        matches!(self, StoreError::Unusable(_))
    }
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Unusable(m) | StoreError::Write(m) => f.write_str(m),
        }
    }
}

/// Classify the file. Only two states are safe to build a write on: a file we
/// parsed, and no file at all. Anything else — a read that failed, a non-empty
/// file that doesn't parse — means we don't know what is in there, and writing
/// our own snapshot over it would erase the very devices this module exists to
/// protect (and resurrect a revoked one, or a consumed pairing code).
fn read_base(path: &Path) -> Base {
    match std::fs::read(path) {
        Ok(raw) if raw.is_empty() => Base::FirstRun,
        Ok(raw) => match parse_config(&raw) {
            Some(cfg) => Base::Disk(cfg, raw),
            None => Base::Unusable(format!(
                "the mobile settings file at {} is damaged, so nothing was changed",
                path.display()
            )),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Base::FirstRun,
        Err(e) => Base::Unusable(format!(
            "could not read the mobile settings file at {}: {e}",
            path.display()
        )),
    }
}

/// One read-modify-write of the config file.
///
/// - `Ok(Some(v))` — `f` produced `v`, and it is both saved and in memory.
/// - `Ok(None)` — `f` declined; the file and the in-memory config are untouched.
/// - `Err(e)` — the config could not be read or could not be written; nothing
///   was changed, in the file or in memory.
fn update_at<T>(
    path: &Path,
    mem: &Mutex<RemoteConfig>,
    f: impl FnOnce(&mut RemoteConfig) -> Option<T>,
) -> Result<Option<T>, StoreError> {
    let _serialized = lock(&STORE_LOCK);
    let _locked = match lock_file(path) {
        Some(held) => Some(held),
        None => {
            warn_lock_unavailable();
            None
        }
    };
    let current = lock(mem).clone();
    let (mut next, raw) = match read_base(path) {
        Base::Disk(cfg, raw) => (cfg, Some(raw)),
        Base::FirstRun => (current.clone(), None),
        Base::Unusable(e) => return Err(StoreError::Unusable(e)),
    };
    rebase_owned_settings(&mut next, &current);
    let Some(out) = f(&mut next) else {
        return Ok(None); // the caller decided there is nothing to change
    };
    write_config_unless_same(path, &next, raw.as_deref()).map_err(StoreError::Write)?;
    *lock(mem) = next;
    Ok(Some(out))
}

/// Apply `f` to the persisted config and save it. The closure sees the state on
/// disk with this process's own settings re-based on top, so its intent wins over
/// both; returning `None` aborts, leaving file and memory untouched — what a
/// rejected pairing attempt needs so an unauthenticated caller can never move the
/// file. An `Err` means the change is not in effect anywhere, so a caller handing
/// out a credential must treat it as a failure.
///
/// The closure must not call back into the store (it holds the store lock) and
/// must not lock the hub's in-memory config.
pub(crate) fn update<T>(
    mem: &Mutex<RemoteConfig>,
    f: impl FnOnce(&mut RemoteConfig) -> Option<T>,
) -> Result<Option<T>, StoreError> {
    update_at(&config_path(), mem, f)
}

fn config_status_at(path: &Path) -> Result<(), StoreError> {
    let _serialized = lock(&STORE_LOCK);
    match read_base(path) {
        Base::Unusable(e) => Err(StoreError::Unusable(e)),
        _ => Ok(()),
    }
}

/// Whether the file could be used as the base of a save, changing nothing — what
/// startup needs to tell the user their pairings are frozen before they try
/// anything.
pub(crate) fn config_status() -> Result<(), StoreError> {
    config_status_at(&config_path())
}

fn adopt_devices(path: &Path, mem: &Mutex<RemoteConfig>) -> Result<(), StoreError> {
    match read_base(path) {
        Base::Disk(disk, _) => {
            lock(mem).devices = disk.devices;
            Ok(())
        }
        Base::FirstRun => Ok(()), // no file yet: nothing to adopt, but a real answer
        Base::Unusable(e) => Err(StoreError::Unusable(e)),
    }
}

fn refresh_devices_at(path: &Path, mem: &Mutex<RemoteConfig>) -> Result<(), StoreError> {
    let _serialized = lock(&STORE_LOCK);
    adopt_devices(path, mem)
}

fn try_refresh_devices_at(
    path: &Path,
    mem: &Mutex<RemoteConfig>,
) -> Option<Result<(), StoreError>> {
    let _serialized = try_lock(&STORE_LOCK)?;
    Some(adopt_devices(path, mem))
}

/// Adopt the on-disk device list, leaving every setting alone. Lets a long-running
/// instance accept a phone the other instance paired — and stop accepting one it
/// revoked — without waiting for a restart. `Err` means the file was not actually
/// consulted, so a caller throttling this doesn't spend its window on a read that
/// never happened.
pub(crate) fn refresh_devices(mem: &Mutex<RemoteConfig>) -> Result<(), StoreError> {
    refresh_devices_at(&config_path(), mem)
}

/// `refresh_devices` for a caller that cannot afford to wait: `None` when a
/// mutation holds the store, having read nothing and changed nothing. A save
/// retries the advisory lock for up to a second, and the caller that adopts
/// revocations on live connections runs ahead of their outbound queue — waiting
/// there would stall a phone's terminal output instead of just re-reading later.
pub(crate) fn try_refresh_devices(mem: &Mutex<RemoteConfig>) -> Option<Result<(), StoreError>> {
    try_refresh_devices_at(&config_path(), mem)
}

/// Hold the store for the span of a test, so a test can prove that a caller which
/// must not wait gives up instead.
#[cfg(test)]
pub(crate) fn hold_store_for_test() -> MutexGuard<'static, ()> {
    lock(&STORE_LOCK)
}

#[cfg(test)]
#[path = "remotestore_tests.rs"]
mod tests;
