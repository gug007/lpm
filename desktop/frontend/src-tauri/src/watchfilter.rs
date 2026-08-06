// A file being opened or closed is not a file changing. notify's inotify backend
// arms every watch with IN_OPEN and IN_CLOSE unconditionally and offers no way to
// drop them from the mask, so any handler that reads a file inside a directory it
// watches re-triggers itself forever — a pegged core with no external writer and,
// because the content never changed, no visible output.
//
// Dropping the whole Access family is safe: every real mutation is also delivered
// as Create or Modify (a write raises IN_MODIFY; an atomic temp-then-rename raises
// IN_MOVED_TO), and the macOS FSEvents backend never reports opens at all, so this
// is a no-op there rather than a second code path. It has to be a denylist, not an
// allowlist of Create/Modify/Remove: FSEvents signals "events were dropped, rescan"
// as EventKind::Other, which an allowlist would swallow.
pub(crate) fn is_read_only(ev: &notify::Event) -> bool {
    matches!(ev.kind, notify::EventKind::Access(_))
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{
        AccessKind, AccessMode, CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode,
    };
    use notify::EventKind;

    fn ev(kind: EventKind) -> notify::Event {
        notify::Event::new(kind)
    }

    #[test]
    fn opens_and_closes_are_not_changes() {
        assert!(is_read_only(&ev(EventKind::Access(AccessKind::Open(
            AccessMode::Any
        )))));
        assert!(is_read_only(&ev(EventKind::Access(AccessKind::Close(
            AccessMode::Read
        )))));
        // Dropped too: nothing in this crate uses close-write as a "done writing"
        // signal, and every write is also delivered as Modify or Create.
        assert!(is_read_only(&ev(EventKind::Access(AccessKind::Close(
            AccessMode::Write
        )))));
    }

    #[test]
    fn every_real_mutation_survives() {
        assert!(!is_read_only(&ev(EventKind::Create(CreateKind::File))));
        assert!(!is_read_only(&ev(EventKind::Modify(ModifyKind::Data(
            DataChange::Any
        )))));
        // An atomic temp-then-rename — how lpm writes settings.json — arrives here.
        assert!(!is_read_only(&ev(EventKind::Modify(ModifyKind::Name(
            RenameMode::To
        )))));
        assert!(!is_read_only(&ev(EventKind::Remove(RemoveKind::File))));
    }

    #[test]
    fn rescan_hints_and_imprecise_events_survive() {
        assert!(!is_read_only(&ev(EventKind::Other)));
        assert!(!is_read_only(&ev(EventKind::Any)));
    }

    /// The mechanism itself, which only a real inotify kernel can show: a handler
    /// that reads a file inside the directory it watches. Without the filter this
    /// diverges into tens of thousands of callbacks.
    #[cfg(target_os = "linux")]
    #[test]
    fn reading_a_watched_file_does_not_re_trigger_the_watcher() {
        use notify::{RecursiveMode, Watcher};
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        std::fs::write(&file, b"{}").unwrap();

        let hits = Arc::new(AtomicUsize::new(0));
        let (cb_hits, cb_file) = (hits.clone(), file.clone());
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(ev) = res else { return };
            if is_read_only(&ev) {
                return;
            }
            cb_hits.fetch_add(1, Ordering::SeqCst);
            let _ = std::fs::read(&cb_file);
        })
        .unwrap();
        watcher
            .watch(dir.path(), RecursiveMode::NonRecursive)
            .unwrap();

        std::fs::write(&file, b"{\"a\":1}").unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        assert!(
            hits.load(Ordering::SeqCst) < 20,
            "self-sustaining open loop: {} callbacks in 1s",
            hits.load(Ordering::SeqCst)
        );
    }
}
