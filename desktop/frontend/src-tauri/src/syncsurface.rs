// Single source of truth for which ~/.lpm config files and dirs cross machines,
// and how. Before this module, peersync.rs (GLOBAL_FILES / GLOBAL_DIRS /
// PROJECT_LOCAL_KEYS) and transfer.rs (TOP_LEVEL_FILES / PER_MACHINE_KEYS) each
// hand-maintained their own lists, and they had drifted: terminals.json was
// export-only, branch-name-instructions.txt was in neither list while its three
// sibling instruction files were synced+exported, and detachedWindows (per-machine
// detached-window geometry) rode along with settings sync/export instead of being
// pinned local. peersync.rs, transfer.rs, and configwatch.rs now read only the
// accessors below, so the two surfaces can no longer diverge.
//
// `sync`   — mirrored by Mac-to-Mac config sync (the old peersync GLOBAL_FILES /
//            GLOBAL_DIRS). settings.json syncs through a special portable digest +
//            merge; every other synced file is a whole-file newest-wins replace.
// `export` — carried in the tarball export and clobbered on import (the old
//            transfer TOP_LEVEL_FILES, plus zdotdir). settings.json and
//            accounts.json are exported/imported through their own merge paths, so
//            they are deliberately NOT export items here.

struct GlobalFile {
    name: &'static str,
    sync: bool,
    export: bool,
}

struct GlobalDir {
    name: &'static str,
    sync: bool,
    export: bool,
}

// Order is chosen so `sync_global_files()` reproduces the old GLOBAL_FILES order
// and `export_top_level_files()` reproduces the old TOP_LEVEL_FILES order exactly
// (each with branch-name-instructions.txt appended), keeping the export archive's
// file order byte-identical for pre-existing files.
const GLOBAL_FILES: &[GlobalFile] = &[
    GlobalFile { name: "global.yml", sync: true, export: true },
    GlobalFile { name: "settings.json", sync: true, export: false },
    GlobalFile { name: "groups.json", sync: true, export: false },
    GlobalFile { name: "composer-actions.json", sync: true, export: false },
    GlobalFile { name: "generators.json", sync: true, export: false },
    GlobalFile { name: "terminals.json", sync: false, export: true },
    GlobalFile { name: "commit-instructions.txt", sync: true, export: true },
    GlobalFile { name: "pr-title-instructions.txt", sync: true, export: true },
    GlobalFile { name: "pr-description-instructions.txt", sync: true, export: true },
    GlobalFile { name: "branch-name-instructions.txt", sync: true, export: true },
];

const GLOBAL_DIRS: &[GlobalDir] = &[
    GlobalDir { name: "generator-icons", sync: true, export: false },
    GlobalDir { name: "zdotdir", sync: true, export: true },
];

/// Machine-local settings.json keys: stripped on export, kept (never overwritten
/// by an incoming value) on import and peer sync, and excluded from the portable
/// settings digest so they never trigger a sync. Window geometry, sidebar width
/// and project order, last-selected project, and per-project detached-window state.
pub(crate) const PER_MACHINE_KEYS: [&str; 8] = [
    "windowWidth",
    "windowHeight",
    "windowX",
    "windowY",
    "sidebarWidth",
    "sidebarOrder",
    "lastSelectedProject",
    "detachedWindows",
];

/// Project YAML keys stripped before the portable digest and preserved locally on
/// apply — the machine-specific parts a synced project must not carry between Macs.
pub(crate) const PROJECT_LOCAL_KEYS: [&str; 5] =
    ["root", "ssh", "claudeAccount", "parent_name", "worktree"];

/// Whole-file global config units mirrored by peer sync (settings.json among them,
/// via its special digest/merge). Old peersync GLOBAL_FILES + branch-name.
pub(crate) fn sync_global_files() -> impl Iterator<Item = &'static str> {
    GLOBAL_FILES.iter().filter(|f| f.sync).map(|f| f.name)
}

/// Whether `name` is a whole-file unit that participates in sync — the write-side
/// allowlist a peer's apply is restricted to (peersync::safe_global_rel) and the
/// FSEvents watcher's top-level classifier both consult this.
pub(crate) fn is_sync_global_file(name: &str) -> bool {
    GLOBAL_FILES.iter().any(|f| f.sync && f.name == name)
}

/// Top-level files copied verbatim into the export archive and clobbered on
/// import. Old transfer TOP_LEVEL_FILES + branch-name.
pub(crate) fn export_top_level_files() -> impl Iterator<Item = &'static str> {
    GLOBAL_FILES.iter().filter(|f| f.export).map(|f| f.name)
}

/// Global config directories synced file-by-file (generator-icons, zdotdir).
pub(crate) fn sync_global_dirs() -> impl Iterator<Item = &'static str> {
    GLOBAL_DIRS.iter().filter(|d| d.sync).map(|d| d.name)
}

/// Whether `dir` is a synced global directory (peersync::safe_global_rel prefix
/// check and the watcher's directory classifier consult this).
pub(crate) fn is_sync_global_dir(dir: &str) -> bool {
    GLOBAL_DIRS.iter().any(|d| d.sync && d.name == dir)
}

/// Global config directories carried in the export archive (zdotdir today;
/// generator-icons is sync-only).
pub(crate) fn export_global_dirs() -> impl Iterator<Item = &'static str> {
    GLOBAL_DIRS.iter().filter(|d| d.export).map(|d| d.name)
}

#[cfg(test)]
mod tests {
    use super::*;

    // These freeze the derived sets against the pre-manifest constants so any
    // future drift fails loudly. The expected lists are the OLD hand-maintained
    // constants plus this phase's two deltas (branch-name-instructions.txt and
    // detachedWindows), written out explicitly rather than recomputed.

    #[test]
    fn sync_files_are_old_global_files_plus_branch_name() {
        let got: Vec<&str> = sync_global_files().collect();
        assert_eq!(
            got,
            vec![
                "global.yml",
                "settings.json",
                "groups.json",
                "composer-actions.json",
                "generators.json",
                "commit-instructions.txt",
                "pr-title-instructions.txt",
                "pr-description-instructions.txt",
                "branch-name-instructions.txt",
            ]
        );
    }

    #[test]
    fn export_files_are_old_top_level_plus_branch_name() {
        let got: Vec<&str> = export_top_level_files().collect();
        assert_eq!(
            got,
            vec![
                "global.yml",
                "terminals.json",
                "commit-instructions.txt",
                "pr-title-instructions.txt",
                "pr-description-instructions.txt",
                "branch-name-instructions.txt",
            ]
        );
    }

    #[test]
    fn terminals_is_export_only_and_settings_is_sync_only() {
        // The two files that gave the surfaces their asymmetry stay put.
        let sync: Vec<&str> = sync_global_files().collect();
        let export: Vec<&str> = export_top_level_files().collect();
        assert!(export.contains(&"terminals.json") && !sync.contains(&"terminals.json"));
        assert!(sync.contains(&"settings.json") && !export.contains(&"settings.json"));
    }

    #[test]
    fn per_machine_keys_are_old_six_plus_detached_windows_and_sidebar_order() {
        assert_eq!(
            PER_MACHINE_KEYS,
            [
                "windowWidth",
                "windowHeight",
                "windowX",
                "windowY",
                "sidebarWidth",
                "sidebarOrder",
                "lastSelectedProject",
                "detachedWindows",
            ]
        );
    }

    #[test]
    fn project_local_keys_unchanged() {
        assert_eq!(
            PROJECT_LOCAL_KEYS,
            ["root", "ssh", "claudeAccount", "parent_name", "worktree"]
        );
    }

    #[test]
    fn dir_sets_unchanged() {
        let sync: Vec<&str> = sync_global_dirs().collect();
        assert_eq!(sync, vec!["generator-icons", "zdotdir"]);
        let export: Vec<&str> = export_global_dirs().collect();
        assert_eq!(export, vec!["zdotdir"]);
        assert!(is_sync_global_dir("generator-icons"));
        assert!(is_sync_global_dir("zdotdir"));
        assert!(!is_sync_global_dir("notes"));
    }

    #[test]
    fn is_sync_global_file_matches_the_sync_set() {
        assert!(is_sync_global_file("branch-name-instructions.txt"));
        assert!(is_sync_global_file("global.yml"));
        assert!(is_sync_global_file("settings.json"));
        // Export-only file is not a sync unit.
        assert!(!is_sync_global_file("terminals.json"));
        assert!(!is_sync_global_file("peer.json"));
    }
}
