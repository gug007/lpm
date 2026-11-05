// Classifying a ~/.lpm filesystem event: which config category it touches, and
// what one event dirties. Split out of configwatch so the watcher plumbing and
// this pure, heavily-tested mapping each stay small.
use crate::lpm_commands_folds::is_folds_file;
use crate::lpm_commands_layout::LAYOUT_DIR;
use crate::peersync;
use crate::syncsurface::{is_os_junk, is_sync_global_dir, is_sync_global_file};
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) enum Category {
    Projects,
    Templates,
    // settings.json under ~/.lpm: a projects-category file, but its writes are
    // gated on a real portable-digest change (window drags rewrite it constantly).
    Settings,
    // groups.json (sidebar folders): per-machine and off the sync surface, but a
    // second local instance's write must re-hydrate this instance's layout —
    // every persist is a full overwrite from memory, so a stale layout would
    // otherwise clobber it right back.
    Sidebar,
    // memory/<project>/*.md: session memory, written by agent CLIs in a terminal
    // rather than by lpm, so the pane only learns about a save from here. Carries
    // the project segment so the emit names which project changed.
    Memory(String),
    // skill-layout/*.json: a list's folders, which a sync lands here without lpm
    // having changed anything else.
    Skills,
    // skill-layout/folds/*.json: which folders are closed. No skill changed, so
    // this stays apart from Skills, whose emit reads every list again.
    SkillFolds,
}

#[derive(Default, PartialEq, Debug)]
pub(crate) struct Dirty {
    pub(crate) projects: bool,
    pub(crate) templates: bool,
    pub(crate) sidebar: bool,
    // settings.json moved; whether that means anything is decided by the debounce
    // thread, which owns the digest. Reading it in the callback would re-arm the
    // watcher on Linux, where an open is itself an event.
    pub(crate) settings: bool,
    pub(crate) memory: BTreeSet<String>,
    pub(crate) skills: bool,
    pub(crate) skill_folds: bool,
}

impl Dirty {
    pub(crate) fn any(&self) -> bool {
        self.projects
            || self.templates
            || self.sidebar
            || self.settings
            || self.skills
            || self.skill_folds
            || !self.memory.is_empty()
    }

    pub(crate) fn merge(&mut self, other: Dirty) {
        self.projects |= other.projects;
        self.templates |= other.templates;
        self.sidebar |= other.sidebar;
        self.settings |= other.settings;
        self.memory.extend(other.memory);
        self.skills |= other.skills;
        self.skill_folds |= other.skill_folds;
    }
}

/// Map a filesystem event path to the config category it affects, or `None` when
/// the path is outside the watched surface. The global file/dir lists come from
/// syncsurface so this can't drift from what config sync actually mirrors. Pure
/// over `lpm` and the event path so it can be unit-tested without the filesystem.
pub(crate) fn classify(lpm: &Path, path: &Path) -> Option<Category> {
    let rel = path.strip_prefix(lpm).ok()?;
    let segs: Vec<&str> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect();
    if segs.last().is_some_and(|name| is_os_junk(name)) {
        return None;
    }
    match segs.as_slice() {
        [name] if *name == "settings.json" => Some(Category::Settings),
        [name] if *name == "groups.json" => Some(Category::Sidebar),
        [name] => is_sync_global_file(name).then_some(Category::Projects),
        ["projects", file] => file.ends_with(".yml").then_some(Category::Projects),
        ["templates", ..] => Some(Category::Templates),
        ["memory", project, ..] => Some(Category::Memory((*project).to_string())),
        _ if is_folds_file(rel) => Some(Category::SkillFolds),
        [dir, ..] if *dir == LAYOUT_DIR => Some(Category::Skills),
        [dir, ..] if is_sync_global_dir(dir) => Some(Category::Projects),
        _ => None,
    }
}

/// Whether a settings.json event changed portable content. `prev`/`new` are the
/// cached and freshly computed portable digests (`None` = file unreadable/absent
/// or un-parseable), so a repeated read failure (`None`→`None`) is correctly no
/// change while a real `Some`→`None` transition is. The caller updates the cache
/// to `new` regardless of the result.
pub(crate) fn settings_changed(prev: Option<&str>, new: Option<&str>) -> bool {
    prev != new
}

/// settings.json's portable digest and, from the same read, the sidebar's:
/// what the sidebar draws from it that the portable digest leaves out, being
/// per machine (the order and the pins).
pub(crate) fn settings_digests(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(bytes) = std::fs::read(path) else {
        return (None, None);
    };
    let sidebar = serde_json::from_slice::<serde_json::Value>(&bytes)
        .ok()
        .map(|v| serde_json::json!([v.get("sidebarOrder"), v.get("pinnedProjects")]).to_string());
    (peersync::settings_digest(&bytes).ok(), sidebar)
}

/// What one filesystem event dirties. Pure over `(root, event)` — no filesystem
/// access, which is the point: the settings digest is read by the debounce thread,
/// not here.
pub(crate) fn fold_event(root: &Path, ev: &notify::Event) -> Dirty {
    let mut d = Dirty::default();
    if crate::watchfilter::is_read_only(ev) {
        return d;
    }
    for p in &ev.paths {
        match classify(root, p) {
            Some(Category::Projects) => d.projects = true,
            Some(Category::Templates) => d.templates = true,
            Some(Category::Settings) => d.settings = true,
            Some(Category::Sidebar) => d.sidebar = true,
            Some(Category::Memory(project)) => {
                d.memory.insert(project);
            }
            Some(Category::Skills) => d.skills = true,
            Some(Category::SkillFolds) => d.skill_folds = true,
            None => {}
        }
    }
    d
}

/// Whether an event changed something in one of the global skill roots, which sit
/// outside `~/.lpm`. Pure, like `fold_event`.
pub(crate) fn touches_skills(roots: &[PathBuf], ev: &notify::Event) -> bool {
    !crate::watchfilter::is_read_only(ev)
        && ev.paths.iter().any(|p| {
            let junk = p.file_name().and_then(|n| n.to_str()).is_some_and(is_os_junk);
            !junk && roots.iter().any(|root| p.starts_with(root))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, CreateKind, ModifyKind, RenameMode};
    use notify::EventKind;
    use std::path::PathBuf;

    fn lpm() -> PathBuf {
        PathBuf::from("/Users/x/.lpm")
    }

    fn at(rel: &str) -> PathBuf {
        lpm().join(rel)
    }

    fn event(kind: EventKind, rel: &str) -> notify::Event {
        notify::Event::new(kind).add_path(at(rel))
    }

    #[test]
    fn a_skill_layout_is_a_skills_change() {
        assert_eq!(classify(&lpm(), &at("skill-layout/web.json")), Some(Category::Skills));
        assert_eq!(classify(&lpm(), &at("skill-layout/folds/web.json")), Some(Category::SkillFolds));
        let d = fold_event(&lpm(), &event(EventKind::Create(CreateKind::File), "skill-layout/web.json"));
        assert!(d.skills && !d.projects);
    }

    #[test]
    fn a_write_in_a_skill_root_touches_skills() {
        let roots = [PathBuf::from("/Users/x/.agents/skills")];
        let at_path = |kind: EventKind, path: &str| notify::Event::new(kind).add_path(path.into());
        let write = EventKind::Modify(ModifyKind::Any);
        let touches = |path: &str| touches_skills(&roots, &at_path(write, path));
        assert!(touches("/Users/x/.agents/skills/deploy/SKILL.md"));
        assert!(!touches("/Users/x/.agents/skills/deploy/.DS_Store"));
        assert!(!touches("/Users/x/.agents/skills-old/deploy/SKILL.md"));
        assert!(!touches("/Users/x/.lpm/global.yml"));
        let open = EventKind::Access(AccessKind::Open(AccessMode::Read));
        let read = at_path(open, "/Users/x/.agents/skills/deploy/SKILL.md");
        assert!(!touches_skills(&roots, &read));
    }

    #[test]
    fn sidebar_digest_follows_order_and_pins_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let digest = |body: &str| {
            std::fs::write(&path, body).unwrap();
            settings_digests(&path).1
        };
        let base = digest(r#"{"sidebarOrder":["api"],"theme":"dark"}"#);
        assert_eq!(base, digest(r#"{"sidebarOrder":["api"],"theme":"light"}"#));
        assert_ne!(base, digest(r#"{"sidebarOrder":["api"],"pinnedProjects":["api"]}"#));
        assert_ne!(base, digest(r#"{"sidebarOrder":["web","api"]}"#));
    }

    /// The bug: the callback read settings.json, the read was an open, the open
    /// was an event, the event ran the callback. A pegged core with no writer.
    #[test]
    fn opening_settings_json_dirties_nothing() {
        let ev = event(
            EventKind::Access(AccessKind::Open(AccessMode::Any)),
            "settings.json",
        );
        assert_eq!(fold_event(&lpm(), &ev), Dirty::default());
    }

    /// lpm and peersync both write settings.json as temp-then-rename, which
    /// arrives as a rename, not a write — so the gate must key on that.
    #[test]
    fn renaming_settings_json_into_place_is_seen() {
        let ev = event(
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            "settings.json",
        );
        assert!(fold_event(&lpm(), &ev).settings);
    }

    #[test]
    fn a_new_project_file_dirties_projects() {
        let ev = event(EventKind::Create(CreateKind::File), "projects/web.yml");
        let d = fold_event(&lpm(), &ev);
        assert!(d.projects && !d.settings);
    }

    #[test]
    fn one_event_can_dirty_several_categories() {
        let ev = notify::Event::new(EventKind::Create(CreateKind::File))
            .add_path(at("projects/web.yml"))
            .add_path(at("templates/base.yml"))
            .add_path(at("memory/web/session.md"));
        let d = fold_event(&lpm(), &ev);
        assert!(d.projects && d.templates);
        assert_eq!(d.memory.iter().cloned().collect::<Vec<_>>(), vec!["web"]);
    }

    #[test]
    fn top_level_allowlist_honored() {
        assert_eq!(
            classify(&lpm(), &at("global.yml")),
            Some(Category::Projects)
        );
        // groups.json (sidebar folders) is per-machine and off the sync surface;
        // it classifies as Sidebar so another local instance's write re-hydrates
        // this instance's layout instead of being clobbered by it.
        assert_eq!(
            classify(&lpm(), &at("groups.json")),
            Some(Category::Sidebar)
        );
        assert_eq!(
            classify(&lpm(), &at("commit-instructions.txt")),
            Some(Category::Projects)
        );
        // branch-name-instructions.txt joined the sync surface (delta 1), so the
        // watcher now classifies it and emits a refresh when it changes.
        assert_eq!(
            classify(&lpm(), &at("branch-name-instructions.txt")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn top_level_settings_is_its_own_category() {
        // settings.json is gated on a portable-digest change, so it classifies
        // distinctly from the byte-replace global files; a nested settings.json
        // (e.g. under a synced dir) is not the gated top-level one.
        assert_eq!(
            classify(&lpm(), &at("settings.json")),
            Some(Category::Settings)
        );
        assert_eq!(
            classify(&lpm(), &at("generator-icons/settings.json")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn top_level_non_allowlisted_ignored() {
        assert_eq!(classify(&lpm(), &at("message-history.db")), None);
        assert_eq!(classify(&lpm(), &at("peer.json")), None);
        assert_eq!(classify(&lpm(), &at("lpm.sock")), None);
        assert_eq!(classify(&lpm(), &at("settings.json.tmp")), None);
    }

    #[test]
    fn projects_only_yml() {
        assert_eq!(
            classify(&lpm(), &at("projects/web.yml")),
            Some(Category::Projects)
        );
        assert_eq!(classify(&lpm(), &at("projects/web.yaml")), None);
        assert_eq!(classify(&lpm(), &at("projects/notes.txt")), None);
    }

    #[test]
    fn templates_recursive_is_templates() {
        assert_eq!(
            classify(&lpm(), &at("templates/base.yml")),
            Some(Category::Templates)
        );
        assert_eq!(
            classify(&lpm(), &at("templates/nested/x.yml")),
            Some(Category::Templates)
        );
    }

    #[test]
    fn memory_files_carry_their_project() {
        assert_eq!(
            classify(&lpm(), &at("memory/web/auth-refactor.md")),
            Some(Category::Memory("web".into()))
        );
        // The project directory appearing at all is a change worth emitting.
        assert_eq!(
            classify(&lpm(), &at("memory/web")),
            Some(Category::Memory("web".into()))
        );
        // The memory root itself is not attributable to any project.
        assert_eq!(classify(&lpm(), &at("memory")), None);
    }

    #[test]
    fn finder_metadata_is_not_a_config_edit() {
        assert_eq!(classify(&lpm(), &at("memory/.DS_Store")), None);
        assert_eq!(classify(&lpm(), &at("memory/web/.DS_Store")), None);
        assert_eq!(classify(&lpm(), &at("templates/.DS_Store")), None);
        assert_eq!(classify(&lpm(), &at("generator-icons/Thumbs.db")), None);
        assert_eq!(classify(&lpm(), &at("zdotdir/desktop.ini")), None);
    }

    #[test]
    fn synced_dirs_map_to_projects() {
        assert_eq!(
            classify(&lpm(), &at("generator-icons/a.png")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("zdotdir/.zshrc")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("zdotdir/nested/f")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn outside_root_is_none() {
        assert_eq!(classify(&lpm(), Path::new("/etc/passwd")), None);
        assert_eq!(classify(&lpm(), &lpm()), None);
    }

    #[test]
    fn settings_gate_transitions() {
        // First observation with a computable digest counts as changed.
        assert!(settings_changed(None, Some("a")));
        // Same digest -> no emit (window drag rewrites bounds only).
        assert!(!settings_changed(Some("a"), Some("a")));
        // Real portable change -> emit.
        assert!(settings_changed(Some("a"), Some("b")));
    }

    #[test]
    fn settings_gate_read_failures_dont_storm() {
        // File became unreadable after having a digest -> one change.
        assert!(settings_changed(Some("a"), None));
        // Repeated failures with no prior digest -> silent.
        assert!(!settings_changed(None, None));
    }
}
