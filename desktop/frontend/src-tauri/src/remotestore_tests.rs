use super::*;

fn device(id: &str) -> Device {
    Device {
        id: id.into(),
        name: id.into(),
        token_hash: format!("hash-{id}"),
        created_at: 1,
        ..Default::default()
    }
}

fn seeded(cfg: RemoteConfig) -> Mutex<RemoteConfig> {
    Mutex::new(cfg)
}

/// `update_at` for the common case of a change that always applies.
fn apply_update(
    path: &Path,
    mem: &Mutex<RemoteConfig>,
    f: impl FnOnce(&mut RemoteConfig),
) -> Result<(), StoreError> {
    update_at(path, mem, |cfg| {
        f(cfg);
        Some(())
    })
    .map(|_| ())
}

fn on_disk(path: &Path) -> RemoteConfig {
    read_config(path).expect("config file")
}

fn ids(cfg: &RemoteConfig) -> Vec<String> {
    cfg.devices.iter().map(|d| d.id.clone()).collect()
}

fn inode(path: &Path) -> u64 {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(path).unwrap().ino()
}

// The user-visible bug: this process loaded the config, the other instance
// paired a phone afterwards, and our next write must not erase it.
#[test]
fn write_preserves_a_device_another_instance_added() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let mut start = RemoteConfig {
        devices: vec![device("mine")],
        ..Default::default()
    };
    write_config(&path, &start).unwrap();
    let mem = seeded(start.clone());

    start.devices.push(device("theirs"));
    write_config(&path, &start).unwrap();

    apply_update(&path, &mem, |cfg| cfg.devices.push(device("fresh"))).unwrap();

    assert_eq!(ids(&on_disk(&path)), ["mine", "theirs", "fresh"]);
    assert_eq!(ids(&mem.lock().unwrap()), ["mine", "theirs", "fresh"]);
}

#[test]
fn settings_write_keeps_disk_devices_and_consumed_code() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    write_config(
        &path,
        &RemoteConfig {
            devices: vec![device("a"), device("b")],
            pairing_code: "AAAA-BBBB".into(),
            ..Default::default()
        },
    )
    .unwrap();
    let mem = seeded(RemoteConfig {
        devices: vec![device("a"), device("b")],
        pairing_code: "AAAA-BBBB".into(),
        ..Default::default()
    });

    // The other instance revokes "a" and a phone consumes the pairing code.
    write_config(
        &path,
        &RemoteConfig {
            devices: vec![device("b")],
            pairing_code: String::new(),
            ..Default::default()
        },
    )
    .unwrap();

    apply_update(&path, &mem, |cfg| {
        cfg.enabled = true;
        cfg.port = 9100;
        cfg.tailscale = false;
    })
    .unwrap();

    let disk = on_disk(&path);
    assert_eq!(ids(&disk), ["b"], "a revoked elsewhere stays revoked");
    assert!(disk.pairing_code.is_empty(), "consumed code stays consumed");
    assert!(disk.enabled);
    assert_eq!(disk.port, 9100);
    assert!(!disk.tailscale);
}

#[test]
fn revoke_sticks_across_a_later_unrelated_write() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let seed = RemoteConfig {
        devices: vec![device("a"), device("b")],
        ..Default::default()
    };
    write_config(&path, &seed).unwrap();
    let mem = seeded(seed);

    apply_update(&path, &mem, |cfg| cfg.devices.retain(|d| d.id != "a")).unwrap();
    assert_eq!(ids(&on_disk(&path)), ["b"]);

    apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap();
    assert_eq!(ids(&on_disk(&path)), ["b"], "revoked device stays gone");
}

// An unauthenticated caller (a wrong pairing code) reaches the store on every
// attempt. Declining must be inert: no rewrite of a file another instance owns
// half of, and no change to what this process is serving from memory — even
// though our settings differ from disk, so a rewrite would not be a no-op.
#[test]
fn a_declined_update_leaves_the_file_and_memory_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    write_config(
        &path,
        &RemoteConfig {
            enabled: false,
            port: 0,
            devices: vec![device("theirs")],
            ..Default::default()
        },
    )
    .unwrap();
    let mem = seeded(RemoteConfig {
        enabled: true,
        port: 9100,
        devices: vec![device("ours")],
        ..Default::default()
    });
    let before_bytes = std::fs::read(&path).unwrap();
    let before_inode = inode(&path);

    let out = update_at(&path, &mem, |cfg| {
        cfg.devices.push(device("sneaked"));
        None::<()>
    });

    assert!(out.unwrap().is_none(), "the update reports it did nothing");
    assert_eq!(std::fs::read(&path).unwrap(), before_bytes);
    assert_eq!(inode(&path), before_inode, "the file was not rewritten");
    let now = mem.lock().unwrap();
    assert_eq!(ids(&now), ["ours"], "memory keeps its own device list");
    assert!(now.enabled, "and its own settings");
    assert_eq!(now.port, 9100);
}

// A save that fails must not leave memory believing it succeeded: the revoke path
// reports the failure to the user while dropping the device from memory, and the
// next successful write would then persist a revoke that was reported as failed.
#[test]
fn a_failed_write_is_not_committed_to_memory() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let closed = dir.path().join("closed");
    std::fs::create_dir(&closed).unwrap();
    let path = closed.join("remote.json");
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });
    // Running as root would write through this anyway; tests run as the user.
    std::fs::set_permissions(&closed, PermissionsExt::from_mode(0o500)).unwrap();

    let out = apply_update(&path, &mem, |cfg| {
        cfg.devices.clear();
        cfg.enabled = true;
    });
    std::fs::set_permissions(&closed, PermissionsExt::from_mode(0o700)).unwrap();

    let err = out.expect_err("the save failure is reported");
    assert!(
        !err.is_unusable(),
        "the file was readable — the write is what failed: {err}"
    );
    let now = mem.lock().unwrap();
    assert_eq!(ids(&now), ["a"], "the device is still authorized");
    assert!(!now.enabled);
}

// A file we can't parse is not ours to replace: overwriting it with this
// process's snapshot is exactly the device loss this store exists to prevent.
#[test]
fn a_damaged_file_is_never_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    std::fs::write(&path, b"{ not json").unwrap();
    let mem = seeded(RemoteConfig {
        devices: vec![device("a"), device("b")],
        ..Default::default()
    });

    let err = apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap_err();

    assert!(err.is_unusable(), "and nothing can be saved until it is");
    assert!(
        err.to_string().contains("remote.json"),
        "the message names the file: {err}"
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"{ not json");
    assert!(!mem.lock().unwrap().enabled, "memory is untouched too");
}

#[test]
fn an_unreadable_file_aborts_the_update() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    std::fs::create_dir(&path).unwrap(); // cannot be read as a file
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    let err = apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap_err();

    assert!(err.is_unusable());
    assert!(
        err.to_string().contains("remote.json"),
        "the message names the file: {err}"
    );
    assert!(!mem.lock().unwrap().enabled);
}

#[test]
fn missing_file_falls_back_to_memory_devices() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    apply_update(&path, &mem, |cfg| cfg.port = 9000).unwrap();

    assert_eq!(ids(&on_disk(&path)), ["a"]);
    assert_eq!(on_disk(&path).port, 9000);
}

// A zero-length file is the other first-run shape (an install that created it and
// got no further): there is nothing to lose, so the update proceeds from memory.
#[test]
fn empty_file_falls_back_to_memory_devices() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    std::fs::write(&path, b"").unwrap();
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    apply_update(&path, &mem, |cfg| cfg.port = 9000).unwrap();

    assert_eq!(ids(&on_disk(&path)), ["a"]);
    assert_eq!(on_disk(&path).port, 9000);
}

#[test]
fn refresh_devices_adopts_disk_list_without_touching_settings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    write_config(
        &path,
        &RemoteConfig {
            enabled: false,
            port: 1,
            tailscale: false,
            devices: vec![device("b"), device("c")],
            ..Default::default()
        },
    )
    .unwrap();
    let mem = seeded(RemoteConfig {
        enabled: true,
        port: 9000,
        tailscale: true,
        devices: vec![device("a"), device("b")],
        ..Default::default()
    });

    assert!(refresh_devices_at(&path, &mem).is_ok());

    let now = mem.lock().unwrap();
    assert_eq!(ids(&now), ["b", "c"], "adds c, drops a");
    assert!(now.enabled, "settings stay this process's own");
    assert_eq!(now.port, 9000);
    assert!(now.tailscale);
}

// The caller throttles this to once a second, so a read that never happened must
// say so — otherwise one transient failure turns every connection in that window
// away for a whole second.
#[test]
fn refresh_devices_reports_an_unreadable_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    std::fs::write(&path, b"garbage").unwrap();
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    let err = refresh_devices_at(&path, &mem).expect_err("reports it read nothing");
    assert!(err.is_unusable(), "{err}");

    assert_eq!(ids(&mem.lock().unwrap()), ["a"]);
}

// A save can hold the store for a second while it waits its turn at the advisory
// lock. The caller that keeps live connections honest runs ahead of a phone's
// outbound queue, so it must come straight back instead — an unread list costs a
// few more seconds of a stale revoke, a stalled queue costs terminal output.
#[test]
fn a_refresh_that_must_not_wait_gives_up_on_a_busy_store() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    write_config(
        &path,
        &RemoteConfig {
            devices: vec![device("b")],
            ..Default::default()
        },
    )
    .unwrap();
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    let held = lock(&STORE_LOCK);
    let started = std::time::Instant::now();
    assert!(
        try_refresh_devices_at(&path, &mem).is_none(),
        "it reports the store is busy"
    );
    assert!(
        started.elapsed() < LOCK_RETRY,
        "and returns instead of waiting: {:?}",
        started.elapsed()
    );
    assert_eq!(ids(&mem.lock().unwrap()), ["a"], "nothing was read");
    drop(held);

    for _ in 0..100 {
        // A parallel test's save is the same "busy" answer, so retry past it.
        if let Some(out) = try_refresh_devices_at(&path, &mem) {
            out.expect("the read happened");
            break;
        }
        std::thread::sleep(LOCK_RETRY);
    }
    assert_eq!(
        ids(&mem.lock().unwrap()),
        ["b"],
        "a free store still adopts the list"
    );
}

#[test]
fn refresh_devices_treats_a_missing_file_as_read() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let mem = seeded(RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    });

    assert!(
        refresh_devices_at(&path, &mem).is_ok(),
        "no file is a real answer"
    );

    assert_eq!(ids(&mem.lock().unwrap()), ["a"]);
}

// Startup reads the file only to find out whether saving will work at all, so
// the answer must match what a real mutation would do — and the probe itself
// must leave a damaged file exactly as it found it.
#[test]
fn config_status_refuses_only_a_file_it_cannot_use() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    assert!(config_status_at(&path).is_ok(), "no file yet is first run");

    std::fs::write(&path, b"").unwrap();
    assert!(config_status_at(&path).is_ok(), "an empty file is too");

    write_config(&path, &RemoteConfig::default()).unwrap();
    assert!(config_status_at(&path).is_ok());

    std::fs::write(&path, b"{ not json").unwrap();
    let err = config_status_at(&path).expect_err("a damaged file is refused");
    assert!(err.is_unusable());
    assert!(
        err.to_string().contains("remote.json"),
        "the message names the file: {err}"
    );
    assert_eq!(
        std::fs::read(&path).unwrap(),
        b"{ not json",
        "the probe changes nothing"
    );
}

#[test]
fn only_contention_is_worth_retrying_the_lock() {
    assert!(lock_retryable(Some(libc::EWOULDBLOCK)), "someone holds it");
    assert!(lock_retryable(Some(libc::EINTR)));
    assert!(
        !lock_retryable(Some(libc::ENOTSUP)),
        "a filesystem without advisory locks fails identically forever"
    );
    assert!(!lock_retryable(Some(libc::EOPNOTSUPP)));
    assert!(!lock_retryable(Some(libc::EBADF)));
    assert!(!lock_retryable(None));
}

#[test]
fn server_ids_survive_a_write_by_the_other_flavor() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    write_config(
        &path,
        &RemoteConfig {
            server_id: Some("prod-1".into()),
            dev_server_id: Some("dev-1".into()),
            ..Default::default()
        },
    )
    .unwrap();
    // This process only ever minted its own flavor's slot.
    let mut mem_cfg = RemoteConfig::default();
    mem_cfg.ensure_server_id();
    let mine = mem_cfg.flavor_server_id();
    let mem = seeded(mem_cfg);

    apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap();

    let disk = on_disk(&path);
    assert_eq!(disk.flavor_server_id(), mine, "our slot is ours");
    let other = if is_dev_instance() {
        disk.server_id.as_deref()
    } else {
        disk.dev_server_id.as_deref()
    };
    assert!(other.is_some(), "the other flavor's id survives");
}

// fsatomic replaces the file by rename, so a fresh inode is proof a write
// happened — and an unchanged inode proof that none did.
#[test]
fn an_update_that_changes_nothing_does_not_rewrite_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let seed = RemoteConfig {
        devices: vec![device("a")],
        ..Default::default()
    };
    write_config(&path, &seed).unwrap();
    let mem = seeded(seed);
    let before = inode(&path);

    apply_update(&path, &mem, |_| {}).unwrap();
    assert_eq!(inode(&path), before);

    apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap();
    assert_ne!(inode(&path), before);
}

#[test]
fn config_file_is_written_owner_only() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    let mem = seeded(RemoteConfig::default());
    apply_update(&path, &mem, |cfg| cfg.enabled = true).unwrap();
    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}

// Old remote.json (written before push support) has neither the device push
// fields nor push_relay; #[serde(default)] must load it with empty defaults and
// the effective relay must fall back to the built-in endpoint. The per-status
// notification prefs are absent too and must default to enabled, not false.
#[test]
fn old_json_loads_with_default_push_fields() {
    let json = r#"{
        "enabled": true, "lan": false, "port": 0, "pairing_code": "",
        "tailscale": true,
        "devices": [{ "id": "d1", "name": "iPhone",
                      "token_hash": "abc", "created_at": 1 }]
    }"#;
    let cfg: RemoteConfig = serde_json::from_str(json).unwrap();
    assert!(cfg.push_relay.is_empty());
    assert!(cfg.server_id.is_none());
    // Per-flavor fields added later must default in from a legacy config.
    assert!(cfg.dev_server_id.is_none());
    assert_eq!(cfg.effective_relay(), DEFAULT_PUSH_RELAY);
    assert_eq!(cfg.devices.len(), 1);
    assert!(cfg.devices[0].paired_server_id.is_none());
    assert!(cfg.devices[0].apns_token.is_empty());
    assert!(cfg.devices[0].apns_env.is_empty());
    assert!(cfg.devices[0].push_key.is_empty());
    assert!(cfg.devices[0].push_waiting);
    assert!(cfg.devices[0].push_done);
    assert!(cfg.devices[0].push_error);
    assert!(!cfg.devices[0].push_automation_started);
    assert!(!cfg.devices[0].push_automation_done);
    assert!(!cfg.devices[0].push_automation_error);
}

// A legacy file round-trips through a read-modify-write with every unknown-to-
// nobody field intact, so an older install's remote.json keeps working.
#[test]
fn legacy_file_survives_a_read_modify_write() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("remote.json");
    std::fs::write(
        &path,
        r#"{ "enabled": true, "port": 0, "pairing_code": "", "tailscale": true,
             "server_id": "prod-1",
             "devices": [{ "id": "d1", "name": "iPhone",
                           "token_hash": "abc", "created_at": 1 }] }"#,
    )
    .unwrap();
    let mem = seeded(load_from(&path));

    apply_update(&path, &mem, |cfg| cfg.tailscale = false).unwrap();

    let disk = on_disk(&path);
    assert_eq!(ids(&disk), ["d1"]);
    assert_eq!(disk.devices[0].token_hash, "abc");
    assert!(disk.devices[0].push_waiting, "prefs keep defaulting on");
    assert_eq!(disk.server_id.as_deref(), Some("prod-1"));
    assert!(!disk.tailscale);
}

fn load_from(path: &Path) -> RemoteConfig {
    read_config(path).unwrap_or_default()
}

#[test]
fn ensure_server_id_mints_once_and_is_stable() {
    // Flavor-agnostic: ensure_server_id mints this build's flavor slot
    // (dev_server_id under test's debug profile, server_id in release), so the
    // test asserts through flavor_server_id() rather than a specific field.
    let mut cfg = RemoteConfig::default();
    assert!(cfg.flavor_server_id().is_empty());
    assert!(cfg.ensure_server_id(), "first call mints");
    let first = cfg.flavor_server_id();
    assert!(!first.is_empty());
    assert!(!cfg.ensure_server_id(), "second call is a no-op");
    assert_eq!(cfg.flavor_server_id(), first, "stable across calls");
}
