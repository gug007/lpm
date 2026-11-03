// Host half of an agent's copy: an agent on a paired computer reads or writes
// files here, held to what this machine allows that computer. Off until someone
// turns it on; then inside this machine's projects, or its home folder too, and
// never inside lpm's own folder, where the pairing tokens live.
//
// The bytes travel the way a sync's do (ignoredhost.rs): a root every frame
// names, project-relative paths, pieces landed beside their place and swapped in
// whole, with what they replace kept for Undo.
use super::{host_state_value, result_frame, save_config, PeerHub};
use crate::agentfiles::{self, Access, Policy, Scope};
use crate::ignoredhost::{self, str_arg};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// Shown on this machine when a paired computer's agent copied files here.
pub(crate) const SERVED_EVENT: &str = "agent-files-served";

/// A copy asks for hundreds of frames, and listing the roots reads every
/// project's config.
const ROOTS_TRUST: Duration = Duration::from_secs(10);

pub(super) fn policy_of(hub: &PeerHub, device_id: &str) -> Policy {
    hub.inner
        .config
        .lock()
        .unwrap()
        .host
        .devices
        .iter()
        .find(|d| d.id == device_id)
        .map_or_else(Policy::default, |d| d.agent_files)
}

fn set_policy(hub: &PeerHub, device_id: &str, policy: Policy) -> Result<(), String> {
    let snapshot = {
        let mut cfg = hub.inner.config.lock().unwrap();
        let device = cfg
            .host
            .devices
            .iter_mut()
            .find(|d| d.id == device_id)
            .ok_or("that computer isn't paired with this one")?;
        device.agent_files = policy;
        cfg.clone()
    };
    save_config(&snapshot)?;
    let frame = json!({ "t": "agentPolicy", "policy": policy }).to_string();
    for conn in hub.inner.clients.lock().unwrap().values() {
        if conn.device_id == device_id && !conn.guest {
            let _ = conn.tx.try_send(frame.clone());
        }
    }
    Ok(())
}

/// This machine's own settings for what `id`'s agents may copy, and whether
/// they may run commands, set here. What is left out stays as it is.
#[tauri::command(async)]
pub fn peer_host_set_agent_files(
    app: AppHandle,
    hub: State<'_, PeerHub>,
    id: String,
    files: Option<Access>,
    scope: Option<Scope>,
    run: Option<bool>,
) -> Result<Value, String> {
    let policy = policy_of(&hub, &id).merged(&agentfiles::changes(files, scope, run))?;
    set_policy(&hub, &id, policy)?;
    let _ = app.emit("peer-state-changed", ());
    Ok(host_state_value(&hub))
}

pub(super) fn handle(
    app: &AppHandle,
    hub: &PeerHub,
    out: &SyncSender<String>,
    device_id: &str,
    t: &str,
    v: &Value,
) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (app, hub, out) = (app.clone(), hub.clone(), out.clone());
    let (device, verb, v) = (device_id.to_string(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let policy = policy_of(&hub, &device);
        let res = match verb.as_str() {
            "agentPolicySet" => policy.merged(&v["policy"]).and_then(|p| {
                set_policy(&hub, &device, p)?;
                let _ = app.emit("peer-state-changed", ());
                Ok(json!(p))
            }),
            "agentResolve" => resolve(policy, &v),
            "agentManifest" => manifest(policy, &v),
            "agentRead" => read(policy, &v),
            "agentWrite" => write(policy, &v),
            "agentFinish" => finish(&v).inspect(|reply| {
                let n = |k: &str| reply[k].as_u64().unwrap_or(0);
                let files = n("added") + n("replaced");
                served(&app, &hub, &device, "write", files, str_arg(reply, "path"));
            }),
            // The asking Mac's lpm, not its agent, says a read finished: what
            // left here is noted even though nothing here sees a copy end.
            "agentDone" => {
                let files = v["files"].as_u64().unwrap_or(0);
                served(&app, &hub, &device, "read", files, str_arg(&v, "path"));
                Ok(json!({}))
            }
            _ => Err(format!("unknown agent request: {verb}")),
        };
        let frame = match res {
            Ok(value) => result_frame(&req_id, true, value),
            Err(e) => result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
    });
}

fn canonical(path: impl AsRef<Path>) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn home() -> Option<PathBuf> {
    dirs::home_dir().and_then(canonical)
}

type RootsCache = Mutex<Option<(Instant, Vec<PathBuf>)>>;

/// Every local project's root here, read at most once per [`ROOTS_TRUST`].
fn project_roots() -> Vec<PathBuf> {
    static CACHE: OnceLock<RootsCache> = OnceLock::new();
    let cell = CACHE.get_or_init(|| Mutex::new(None));
    if let Some((at, roots)) = cell.lock().unwrap().as_ref() {
        if at.elapsed() < ROOTS_TRUST {
            return roots.clone();
        }
    }
    let mut roots: Vec<PathBuf> = crate::config::project_names()
        .into_iter()
        .filter_map(|name| match crate::config::project_root(&name) {
            Ok((root, false)) => canonical(root),
            _ => None,
        })
        .collect();
    roots.sort();
    roots.dedup();
    *cell.lock().unwrap() = Some((Instant::now(), roots.clone()));
    roots
}

/// The folders `scope` opens to agents: every local project here, and the
/// home folder too when that is what this machine allows.
fn allowed_roots(scope: Scope) -> Vec<PathBuf> {
    let mut roots = project_roots();
    if scope == Scope::Home {
        roots.extend(home());
    }
    roots
}

fn outside_message(scope: Scope) -> &'static str {
    match scope {
        Scope::Projects => "is outside the lpm projects that computer lets agents copy",
        Scope::Home => "is outside the home folder and lpm projects that computer lets agents copy",
    }
}

fn lpm_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| canonical(crate::config::lpm_dir()))
        .as_deref()
}

fn refuse_lpm_dir(abs: &Path) -> Result<(), String> {
    if lpm_dir().is_some_and(|lpm| abs.starts_with(lpm)) {
        return Err("lpm's own folder can't be copied by agents".into());
    }
    Ok(())
}

/// One of the folders this machine opens to the asking computer's agents, as a
/// frame names it.
struct Root {
    path: PathBuf,
    /// Only a root around lpm's own folder (the home folder) can name a path in
    /// it, so only then is each path checked.
    holds_lpm: bool,
}

impl Root {
    fn new(policy: Policy, v: &Value) -> Result<Root, String> {
        let cwd = str_arg(v, "cwd");
        let path = canonical(cwd).ok_or("that folder is missing on the other computer")?;
        if !allowed_roots(policy.scope).contains(&path) {
            return Err(format!("{cwd} {}", outside_message(policy.scope)));
        }
        let holds_lpm = lpm_dir().is_some_and(|lpm| lpm.starts_with(&path));
        Ok(Root { path, holds_lpm })
    }

    /// Where `rel` lives under this root.
    fn join(&self, rel: &str) -> Result<PathBuf, String> {
        let abs = crate::ignoredpath::resolve(&self.path, rel)?;
        if self.holds_lpm {
            refuse_lpm_dir(&abs)?;
        }
        Ok(abs)
    }
}

fn rel_of(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .map(|r| {
            r.components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
}

/// Where `raw` is on this machine, through every link: the path itself when it
/// exists, else its folder (which must) and the name to make there.
fn locate(raw: &str) -> Result<PathBuf, String> {
    let expanded = crate::config::expand_home(raw.trim());
    let path = Path::new(&expanded);
    if !path.is_absolute() {
        return Err(format!("{raw} isn't a full path on the other computer"));
    }
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(format!("{raw} can't hold . or .."));
    }
    if let Some(found) = canonical(path) {
        return Ok(found);
    }
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(format!("{raw} isn't there"));
    };
    let folder = canonical(parent).ok_or_else(|| format!("{} isn't there", parent.display()))?;
    Ok(folder.join(name))
}

/// What the asking computer copies from or to: which open folder holds it, its
/// path inside that folder, and what is there now.
fn resolve(policy: Policy, v: &Value) -> Result<Value, String> {
    policy.allows(v["write"].as_bool().unwrap_or(false))?;
    let raw = str_arg(v, "path");
    let abs = locate(raw)?;
    refuse_lpm_dir(&abs)?;
    let root = allowed_roots(policy.scope)
        .into_iter()
        .filter(|r| abs.starts_with(r))
        .max_by_key(|r| r.components().count())
        .ok_or_else(|| format!("{raw} {}", outside_message(policy.scope)))?;
    let rel = rel_of(&root, &abs);
    if !rel.is_empty() {
        crate::ignoredpath::resolve(&root, &rel)?;
    }
    let meta = std::fs::symlink_metadata(&abs).ok();
    let dir = meta
        .as_ref()
        .is_some_and(|m| m.is_dir() && !m.file_type().is_symlink());
    let children: Vec<String> = if rel.is_empty() && dir {
        crate::ignoredpath::sorted_children(&root)
            .into_iter()
            .map(|(name, _)| name)
            .collect()
    } else {
        Vec::new()
    };
    Ok(json!({
        "root": root.to_string_lossy(),
        "rel": rel,
        "path": abs.to_string_lossy(),
        "exists": meta.is_some(),
        "dir": dir,
        "home": home().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default(),
        "children": children,
    }))
}

/// The files the paths hold, without digests: a copy sends every one anyway.
fn manifest(policy: Policy, v: &Value) -> Result<Value, String> {
    policy.allows(false)?;
    let root = Root::new(policy, v)?;
    let paths: Vec<String> = serde_json::from_value(v["paths"].clone()).unwrap_or_default();
    for path in &paths {
        root.join(path)?;
    }
    let files = crate::ignoredscan::files(&root.path, &paths)?;
    Ok(json!({ "files": files }))
}

fn read(policy: Policy, v: &Value) -> Result<Value, String> {
    policy.allows(false)?;
    let root = Root::new(policy, v)?;
    for piece in ignoredhost::pieces_of(v) {
        root.join(str_arg(piece, "path"))?;
    }
    ignoredhost::read_pieces(&root.path, v)
}

/// Each batch's root, which every later frame of it must name too, and the
/// first file it lands, for the log and the note shown here.
fn batches() -> &'static Mutex<HashMap<String, (PathBuf, String)>> {
    static BATCHES: OnceLock<Mutex<HashMap<String, (PathBuf, String)>>> = OnceLock::new();
    BATCHES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn write(policy: Policy, v: &Value) -> Result<Value, String> {
    policy.allows(true)?;
    let root = Root::new(policy, v)?;
    let force = v["force"].as_bool().unwrap_or(false);
    for piece in ignoredhost::pieces_of(v) {
        let path = str_arg(piece, "path");
        let abs = root.join(path)?;
        let starts = piece["offset"].as_u64().unwrap_or(0) == 0;
        if starts && !force && std::fs::symlink_metadata(&abs).is_ok() {
            return Err(format!("{path} is already there; --force replaces it"));
        }
    }
    let first = ignoredhost::pieces_of(v)
        .first()
        .map(|p| {
            root.path
                .join(str_arg(p, "path"))
                .to_string_lossy()
                .into_owned()
        })
        .unwrap_or_default();
    let (batch_root, _) = batches()
        .lock()
        .unwrap()
        .entry(str_arg(v, "batch").to_string())
        .or_insert_with(|| (root.path.clone(), first))
        .clone();
    if batch_root != root.path {
        return Err("that copy started in another folder".into());
    }
    ignoredhost::write_pieces(v, || Ok(root.path.clone()))
}

fn finish(v: &Value) -> Result<Value, String> {
    let mut reply = ignoredhost::finish(v)?;
    if let Some((_, path)) = batches().lock().unwrap().remove(str_arg(v, "batch")) {
        reply["path"] = json!(path);
    }
    Ok(reply)
}

/// Note a finished read or write here: in the log, and on screen.
fn served(app: &AppHandle, hub: &PeerHub, device_id: &str, op: &str, files: u64, path: &str) {
    if files == 0 {
        return;
    }
    let machine = hub.device_name(device_id);
    let entry =
        json!({ "side": "host", "machine": machine, "op": op, "files": files, "path": path });
    agentfiles::log(entry.clone());
    let _ = app.emit(SERVED_EVENT, entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_with_dot_dot_is_refused_before_it_is_looked_up() {
        assert!(locate("/tmp/../etc/passwd").is_err());
        assert!(locate("relative/path").is_err());
    }

    #[test]
    fn a_missing_file_is_located_in_its_existing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let want = canonical(dir.path()).unwrap().join("new.txt");
        let got = locate(&dir.path().join("new.txt").to_string_lossy()).unwrap();
        assert_eq!(got, want);
        assert!(locate(&dir.path().join("no/such/new.txt").to_string_lossy()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_link_out_of_a_folder_resolves_to_where_it_points() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "x").unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(outside.path().join("secret"), &link).unwrap();
        let got = locate(&link.to_string_lossy()).unwrap();
        assert!(got.starts_with(canonical(outside.path()).unwrap()));
    }

    #[test]
    fn rel_of_joins_with_forward_slashes() {
        let root = Path::new("/a/b");
        assert_eq!(rel_of(root, Path::new("/a/b/c/d.txt")), "c/d.txt");
        assert_eq!(rel_of(root, Path::new("/a/b")), "");
    }

    #[test]
    fn nothing_is_open_while_the_policy_is_off() {
        let off = Policy::default();
        let v = json!({ "path": "/tmp/x", "write": false });
        assert!(resolve(off, &v).is_err());
        assert!(manifest(off, &json!({ "cwd": "/tmp", "paths": ["x"] })).is_err());
        assert!(read(off, &json!({ "cwd": "/tmp", "pieces": [] })).is_err());
    }

    #[test]
    fn read_only_refuses_writes() {
        let read_only = Policy {
            access: Access::Read,
            scope: Scope::Home,
            run: false,
        };
        let v = json!({ "cwd": "/tmp", "batch": "0123456789abcdef", "pieces": [] });
        let err = write(read_only, &v).unwrap_err();
        assert!(err.contains("only copy files from here"), "{err}");
    }
}
