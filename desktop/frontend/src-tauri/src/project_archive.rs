// Archived projects: out of the sidebar, the project switcher, the dock menu and
// the phone, with their setup, notes, memory and folder kept, and their
// automations paused. The names live in settings.json as `archivedProjects`,
// name → when it was archived (ms since the epoch), kept per machine. A
// project's duplicates and worktrees are archived with it.
use crate::config;
use crate::services::ServiceState;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use tauri::{AppHandle, Emitter, Manager};

pub const KEY: &str = "archivedProjects";

fn archived_in(settings: &Value) -> BTreeMap<String, u64> {
    settings
        .get(KEY)
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(name, at)| at.as_u64().map(|at| (name.clone(), at)))
        .collect()
}

/// Every archived project, with when it was archived.
pub fn archived() -> BTreeMap<String, u64> {
    archived_in(&config::load_settings())
}

/// Whether a listed project stays out of sight: it is archived, or it is a
/// copy of a project that is.
pub fn is_hidden(project: &Value, archived: &BTreeMap<String, u64>) -> bool {
    let named = |key: &str| {
        project
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|name| archived.contains_key(name))
    };
    named("name") || named("parentName")
}

/// Every project name out of sight, archived copies included.
pub fn hidden_names() -> HashSet<String> {
    let archived = archived();
    let mut out: HashSet<String> = archived.keys().cloned().collect();
    for name in archived.keys() {
        out.extend(config::duplicates_of(name).unwrap_or_default());
    }
    out
}

/// `settings` with `name` archived at `at`, or unarchived. The key drops out of
/// the file once nothing is archived.
fn with_archived(mut settings: Value, name: &str, at: Option<u64>) -> Result<Value, String> {
    let obj = settings.as_object_mut().ok_or("settings.json malformed")?;
    let mut map = obj
        .get(KEY)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    match at {
        Some(at) => {
            map.insert(name.to_string(), json!(at));
        }
        None => {
            map.remove(name);
        }
    }
    if map.is_empty() {
        obj.remove(KEY);
    } else {
        obj.insert(KEY.into(), Value::Object(map));
    }
    Ok(settings)
}

fn set_archived(name: &str, at: Option<u64>) -> Result<(), String> {
    config::save_settings(&with_archived(config::load_settings(), name, at)?)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn require_project(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Project required.".into());
    }
    if config::project_names().iter().any(|n| n == name) {
        Ok(())
    } else {
        Err(format!("no project named {name:?}"))
    }
}

/// The project and the duplicates and worktrees that go with it.
fn family(name: &str) -> Vec<String> {
    let mut out = vec![name.to_string()];
    out.extend(config::duplicates_of(name).unwrap_or_default());
    out
}

fn running_in(names: &[String]) -> Vec<String> {
    let live = crate::sessions::running_sessions();
    names
        .iter()
        .filter(|n| config::spawn_info(n).is_ok_and(|info| live.contains(&info.session)))
        .cloned()
        .collect()
}

fn automations_in(names: &[String]) -> usize {
    names.iter().map(|n| crate::jobs::job_count(n)).sum()
}

/// What archiving `name` would do, for its confirmation: whether services stop,
/// how many copies go with it, and how many automations pause.
#[tauri::command(async)]
pub fn archive_preview(name: String) -> Result<Value, String> {
    require_project(&name)?;
    let family = family(&name);
    Ok(json!({
        "running": !running_in(&family).is_empty(),
        "copies": family.len() - 1,
        "automations": automations_in(&family),
    }))
}

/// Stop the project's services (its copies' too) and archive it. Its terminals
/// close when the app drops it from the sidebar.
#[tauri::command(async)]
pub fn archive_project(app: AppHandle, name: String) -> Result<(), String> {
    require_project(&name)?;
    if archived().contains_key(&name) {
        return Ok(());
    }
    let state = app.state::<ServiceState>();
    for project in running_in(&family(&name)) {
        crate::services::stop_project_internal(&app, &state, &project)?;
    }
    set_archived(&name, Some(now_ms()))?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// Bring a project back where it was. Its automations resume from now rather
/// than catching up on the runs they missed.
#[tauri::command(async)]
pub fn unarchive_project(app: AppHandle, name: String) -> Result<(), String> {
    if !archived().contains_key(&name) {
        return Ok(());
    }
    set_archived(&name, None)?;
    for project in family(&name) {
        crate::jobs::resume_from_now(&project);
    }
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// The archived projects that still exist, for the Archive page. A call that
/// names a paired machine reaches that machine, which lists its own.
#[tauri::command(async)]
pub fn list_archived_projects() -> Vec<Value> {
    let names: HashSet<String> = config::project_names().into_iter().collect();
    archived()
        .into_iter()
        .filter(|(name, _)| names.contains(name))
        .map(|(name, at)| archived_entry(&name, at))
        .collect()
}

fn archived_entry(name: &str, at: u64) -> Value {
    let info = config::get_project(name, &Default::default())
        .ok()
        .flatten()
        .unwrap_or_else(|| json!({}));
    let family = family(name);
    json!({
        "name": name,
        "label": info.get("label"),
        "root": info.get("root"),
        "isRemote": info.get("isRemote"),
        "parentName": info.get("parentName"),
        "worktree": info.get("worktree"),
        "archivedAt": at,
        "copies": family.len() - 1,
        "automations": automations_in(&family),
    })
}

/// `archive_project <name>` / `unarchive_project <name>` from the CLI.
pub fn cmd_set_archived(args: &[String], app: &AppHandle, archive: bool) -> String {
    let Some(name) = args.first().filter(|n| !n.trim().is_empty()) else {
        let verb = if archive {
            "archive_project"
        } else {
            "unarchive_project"
        };
        return format!("ERROR: usage: {verb} <project>");
    };
    crate::socketsrv::reply(if archive {
        archive_project(app.clone(), name.clone())
    } else {
        unarchive_project(app.clone(), name.clone())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archives_and_unarchives_one_name_and_drops_the_key_when_empty() {
        let settings = json!({ "theme": "dark" });
        let one = with_archived(settings, "api", Some(5)).unwrap();
        assert_eq!(one[KEY], json!({ "api": 5 }));
        let two = with_archived(one, "web", Some(7)).unwrap();
        assert_eq!(archived_in(&two).len(), 2);
        let back = with_archived(two, "api", None).unwrap();
        assert_eq!(back[KEY], json!({ "web": 7 }));
        let none = with_archived(back, "web", None).unwrap();
        assert!(none.get(KEY).is_none());
        assert_eq!(none["theme"], "dark");
    }

    #[test]
    fn reads_only_names_with_a_time() {
        let settings = json!({ KEY: { "api": 5, "web": "soon", "docs": 9 } });
        let map = archived_in(&settings);
        assert_eq!(map.keys().cloned().collect::<Vec<_>>(), ["api", "docs"]);
        assert!(archived_in(&json!({ KEY: ["api"] })).is_empty());
    }

    #[test]
    fn hides_an_archived_project_and_its_copies() {
        let archived = archived_in(&json!({ KEY: { "api": 1 } }));
        assert!(is_hidden(&json!({ "name": "api" }), &archived));
        assert!(is_hidden(
            &json!({ "name": "api-2", "parentName": "api" }),
            &archived
        ));
        assert!(!is_hidden(
            &json!({ "name": "web", "parentName": "" }),
            &archived
        ));
        assert!(!is_hidden(&json!({ "name": "web" }), &BTreeMap::new()));
    }
}
