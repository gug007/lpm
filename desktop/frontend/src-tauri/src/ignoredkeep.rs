// The list of files a project remembers to sync with another computer, and the
// engine that keeps them in step while both computers are connected.
//
// Keeping in step is two-way. Each file's digest is recorded whenever both
// computers agree on it, so a later difference says which side moved: the one
// that no longer matches the record. When both moved, nothing is touched and the
// user is asked instead. A file one side deleted is left alone rather than copied
// back.
use crate::ignoredrun::{Remote, Side};
use crate::ignoredstep::{bring_all_in_step, Peer};
use crate::peerclient::PeerClientHub;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const EVERY: Duration = Duration::from_secs(30);

/// What one project keeps in step with one other computer.
#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncList {
    pub remote_root: String,
    pub paths: Vec<String>,
    #[serde(default)]
    pub keep: bool,
    /// What each file held when both computers last agreed on it.
    #[serde(default)]
    pub last: HashMap<String, String>,
    /// Files changed on both computers since then, waiting for the user.
    #[serde(default)]
    pub conflicts: Vec<String>,
    /// Why the last attempt to keep them in step failed, until one succeeds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Each project's lists, by the computer they sync with.
type Store = HashMap<String, HashMap<String, SyncList>>;

static STORE: Mutex<()> = Mutex::new(());

fn store_path() -> PathBuf {
    crate::config::lpm_dir()
        .join("ignored-sync")
        .join("lists.json")
}

fn load_all() -> Store {
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_all(all: &Store) -> Result<(), String> {
    let path = store_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(all).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o600))
        .map_err(|e| e.to_string())
}

pub(crate) fn get(project: &str, slug: &str) -> Option<SyncList> {
    let _g = STORE.lock().unwrap();
    load_all().get_mut(project)?.remove(slug)
}

/// The computers a project keeps a list for.
pub(crate) fn slugs(project: &str) -> Vec<String> {
    let _g = STORE.lock().unwrap();
    load_all()
        .remove(project)
        .map(|lists| lists.into_keys().collect())
        .unwrap_or_default()
}

pub(crate) fn covered(path: &str, by: &[String]) -> bool {
    by.iter().any(|p| {
        path == p.trim_end_matches('/') || (p.ends_with('/') && path.starts_with(p.as_str()))
    })
}

/// Remember a project's list for one computer. What was agreed for files the
/// new list still covers is kept, so changing the list never turns old
/// agreements into conflicts.
pub(crate) fn put(project: &str, slug: &str, mut list: SyncList) -> Result<(), String> {
    let _g = STORE.lock().unwrap();
    let mut all = load_all();
    let lists = all.entry(project.to_string()).or_default();
    if let Some(old) = lists.remove(slug) {
        if old.remote_root == list.remote_root {
            list.last = old
                .last
                .into_iter()
                .filter(|(p, _)| covered(p, &list.paths))
                .collect();
        }
    }
    list.conflicts.clear();
    list.error = None;
    lists.insert(slug.to_string(), list);
    save_all(&all)
}

pub(crate) fn forget(project: &str, slug: &str) -> Result<(), String> {
    let _g = STORE.lock().unwrap();
    let mut all = load_all();
    let Some(lists) = all.get_mut(project) else {
        return Ok(());
    };
    if lists.remove(slug).is_some() {
        if lists.is_empty() {
            all.remove(project);
        }
        save_all(&all)?;
    }
    Ok(())
}

/// Change one stored list, writing the store only when `f` reports a change.
pub(crate) fn update(project: &str, slug: &str, f: impl FnOnce(&mut SyncList) -> bool) {
    let _g = STORE.lock().unwrap();
    let mut all = load_all();
    if all
        .get_mut(project)
        .and_then(|lists| lists.get_mut(slug))
        .is_some_and(f)
    {
        let _ = save_all(&all);
    }
}

/// An Undo just put `paths` back. A list kept in step that covers any of them
/// would copy the other computer's version straight back over them, or theirs
/// over the other's, so it stops keeping in step and forgets what it agreed
/// on: turned on again, any difference is asked about. Answers whether it did.
pub(crate) fn pause_after_undo(project: &str, slug: &str, paths: &[String]) -> bool {
    let mut paused = false;
    update(project, slug, |l| {
        paused = l.keep && paths.iter().any(|p| covered(p, &l.paths));
        if paused {
            l.keep = false;
            l.last.clear();
        }
        paused
    });
    paused
}

struct Inner {
    app: AppHandle,
    hub: PeerClientHub,
    wake: Mutex<bool>,
    cv: Condvar,
    stopped: AtomicBool,
}

#[derive(Clone)]
pub struct Engine(Arc<Inner>);

impl Engine {
    pub fn new(app: AppHandle, hub: PeerClientHub) -> Self {
        Engine(Arc::new(Inner {
            app,
            hub,
            wake: Mutex::new(false),
            cv: Condvar::new(),
            stopped: AtomicBool::new(false),
        }))
    }

    pub fn start(&self) {
        let engine = self.clone();
        std::thread::spawn(move || loop {
            {
                let woken = engine.0.wake.lock().unwrap();
                let (mut woken, _) = engine
                    .0
                    .cv
                    .wait_timeout_while(woken, EVERY, |w| !*w)
                    .unwrap();
                *woken = false;
            }
            if engine.0.stopped.load(Ordering::Relaxed) {
                return;
            }
            engine.sweep();
        });
    }

    pub fn stop(&self) {
        self.0.stopped.store(true, Ordering::Relaxed);
        self.nudge();
    }

    /// Run a sweep now rather than at the next tick: a list was just turned on.
    pub fn nudge(&self) {
        *self.0.wake.lock().unwrap() = true;
        self.0.cv.notify_all();
    }

    fn sweep(&self) {
        let projects: Vec<(String, Vec<(String, SyncList)>)> = {
            let _g = STORE.lock().unwrap();
            load_all()
                .into_iter()
                .map(|(project, lists)| {
                    let kept = lists.into_iter().filter(|(_, l)| l.keep).collect();
                    (project, kept)
                })
                .collect()
        };
        for (project, lists) in projects {
            let lists: Vec<_> = lists
                .into_iter()
                .filter(|(slug, _)| self.0.hub.require_ignored_sync(slug).is_ok())
                .collect();
            if lists.is_empty() {
                continue;
            }
            let Some(_held) = crate::gitbring::lock_landing(&project) else {
                continue;
            };
            self.cycle(&project, &lists);
        }
    }

    fn cycle(&self, project: &str, lists: &[(String, SyncList)]) {
        let failed = |slug: &str, e: String| {
            update(project, slug, |l| {
                l.error.replace(e.clone()).as_ref() != Some(&e)
            });
        };
        let here = match crate::gitbring::local_root(project) {
            Ok(root) => Side::Here(root.into()),
            Err(e) => return lists.iter().for_each(|(slug, _)| failed(slug, e.clone())),
        };
        let peers: Vec<Peer> = lists
            .iter()
            .map(|(slug, list)| Peer {
                slug: slug.clone(),
                there: Side::There(Remote {
                    hub: &self.0.hub,
                    slug: slug.clone(),
                    cwd: list.remote_root.clone(),
                }),
            })
            .collect();
        let stop = || {
            if self.0.stopped.load(Ordering::Relaxed) {
                Err("lpm is closing".to_string())
            } else {
                Ok(())
            }
        };
        let rounds = bring_all_in_step(project, &here, &peers, None, &stop, &mut |_, _, _, _| {});
        for (slug, res) in rounds {
            let Some((_, list)) = lists.iter().find(|(s, _)| *s == slug) else {
                continue;
            };
            let step = match res {
                Ok(step) => step,
                Err(e) => {
                    failed(&slug, e);
                    continue;
                }
            };
            if let Some(e) = step.error {
                failed(&slug, e);
                continue;
            }
            if !step.conflicts.is_empty() && step.conflicts != list.conflicts {
                let machine = crate::ignoredsync::machine_name(&self.0.hub, &slug);
                let _ = self.0.app.emit(
                    "ignored-sync-conflict",
                    json!({ "project": project, "slug": slug, "remoteRoot": list.remote_root, "machine": machine, "paths": step.conflicts }),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_list_covers_its_folders_and_exact_files() {
        let by = vec!["certs/".to_string(), ".env".to_string()];
        assert!(covered("certs/key.pem", &by));
        assert!(covered(".env", &by));
        assert!(!covered(".env.local", &by));
        assert!(!covered("certsx/key.pem", &by));
    }
}
