// `lpm cp`: an agent copies files between this computer and one it connects to.
//
// The other computer decides what it opens to this one's agents and enforces it
// (peer/agentfiles.rs). This side decides who is asking: the socket names the
// calling process, which must run inside the lpm tab it claims to be, and a
// person allows the copy in lpm before a byte moves — once, or for the rest of
// that tab's life. Keys, credentials and files that run on their own there
// always ask again. Runs of automations can't copy at all (runguard.rs).
use crate::agentapprove::{self, Caller, Decision, Kind, Request, What};
use crate::agentfiles;
use crate::ignoredrun::{self, AgentCopy, Remote, Side};
use crate::ignoredscan::FileRec;
use crate::peerclient::{names_computer, take_computer, Computer, PeerClientHub};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::Cell;
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(30);
/// The sensitive files a request names; the rest are counted.
const SENSITIVE_SHOWN: usize = 5;

/// What `lpm cp` sends: both ends as typed, the folder it ran in, and the tab
/// it says it runs in.
#[derive(Default, Deserialize)]
#[serde(default)]
struct Ask {
    src: String,
    dst: String,
    force: bool,
    cwd: String,
    pane: String,
    project: String,
}

enum End {
    Here(String),
    There(Computer, String),
}

impl End {
    fn raw(&self) -> &str {
        match self {
            End::Here(raw) | End::There(_, raw) => raw,
        }
    }

    /// `path` as the person reads it: on the other computer, after its name.
    fn label(&self, path: &str) -> String {
        match self {
            End::Here(_) => path.to_string(),
            End::There(c, _) => format!("{}:{path}", c.name),
        }
    }
}

/// `NAME:PATH` on another computer, or a path here. A one-letter prefix is a
/// Windows drive, not a computer.
fn parse_end(raw: &str, computers: &mut Vec<Computer>) -> Result<End, String> {
    let Some((prefix, path)) = raw.split_once(':') else {
        return Ok(End::Here(raw.to_string()));
    };
    if !names_computer(prefix) {
        return Ok(End::Here(raw.to_string()));
    }
    let computer = take_computer(prefix, computers)?;
    Ok(End::There(computer, path.to_string()))
}

/// One end of a copy: the folder its frames name, the path under it, and what
/// is there now. The other computer answers `agentResolve` in this shape.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Spot {
    root: String,
    rel: String,
    path: String,
    exists: bool,
    dir: bool,
    children: Vec<String>,
    home: String,
}

impl Spot {
    fn name(&self) -> String {
        self.path
            .replace('\\', "/")
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .to_string()
    }
}

/// `raw` on this computer, read from `cwd` when it isn't a full path.
fn local_spot(raw: &str, cwd: &str) -> Result<Spot, String> {
    let path = Path::new(cwd).join(crate::config::expand_home(raw));
    if !path.is_absolute() {
        return Err(format!("{raw} isn't a full path"));
    }
    if let Ok(found) = std::fs::canonicalize(&path) {
        let meta = std::fs::symlink_metadata(&found).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            return Ok(Spot {
                root: found.to_string_lossy().into_owned(),
                children: crate::ignoredpath::sorted_children(&found)
                    .into_iter()
                    .map(|(name, _)| name)
                    .collect(),
                path: found.to_string_lossy().into_owned(),
                exists: true,
                dir: true,
                ..Default::default()
            });
        }
        let (parent, name) = split(&found)?;
        return Ok(Spot {
            root: parent.to_string_lossy().into_owned(),
            rel: name,
            path: found.to_string_lossy().into_owned(),
            exists: true,
            ..Default::default()
        });
    }
    let (parent, name) = split(&path)?;
    let parent =
        std::fs::canonicalize(&parent).map_err(|_| format!("{} isn't there", parent.display()))?;
    Ok(Spot {
        path: parent.join(&name).to_string_lossy().into_owned(),
        root: parent.to_string_lossy().into_owned(),
        rel: name,
        ..Default::default()
    })
}

fn split(path: &Path) -> Result<(PathBuf, String), String> {
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => {
            Ok((parent.to_path_buf(), name.to_string_lossy().into_owned()))
        }
        _ => Err(format!("{} can't be copied as a whole", path.display())),
    }
}

fn remote_spot(hub: &PeerClientHub, slug: &str, raw: &str, write: bool) -> Result<Spot, String> {
    let v = hub.peer_request(
        slug,
        RESOLVE_TIMEOUT,
        json!({ "t": "agentResolve", "path": raw, "write": write }),
    )?;
    serde_json::from_value(v).map_err(|e| e.to_string())
}

/// Where the source's own name lands under the destination's root.
fn landing(src: &Spot, dst: &Spot, dst_raw: &str) -> Result<String, String> {
    if dst.exists && dst.dir {
        let name = src.name();
        return Ok(if dst.rel.is_empty() {
            name
        } else {
            format!("{}/{name}", dst.rel)
        });
    }
    if dst_raw.ends_with('/') || dst_raw.ends_with('\\') {
        return Err(format!("{dst_raw} isn't there"));
    }
    if dst.exists && src.dir {
        return Err(format!(
            "{dst_raw} is a file; a folder can't be copied over it"
        ));
    }
    Ok(dst.rel.clone())
}

/// The paths the source's files are listed under, and where each lands.
fn source_paths(src: &Spot) -> Vec<String> {
    if src.rel.is_empty() {
        src.children.clone()
    } else {
        vec![src.rel.clone()]
    }
}

fn place(src: &Spot, base: &str, path: &str) -> String {
    if src.rel.is_empty() {
        format!("{base}/{path}")
    } else {
        format!("{base}{}", &path[src.rel.len().min(path.len())..])
    }
}

fn join(root: &str, rel: &str) -> String {
    let sep = if root.contains('\\') && !root.contains('/') {
        "\\"
    } else {
        "/"
    };
    let rel = if sep == "\\" {
        rel.replace('/', "\\")
    } else {
        rel.to_string()
    };
    format!("{}{sep}{rel}", root.trim_end_matches(['/', '\\']))
}

/// A copy worked out before anyone allowed it: both ends, where the source
/// lands, and what it holds.
struct Plan<'h> {
    hub: &'h PeerClientHub,
    slug: String,
    machine: String,
    pulling: bool,
    src_end: End,
    src: Spot,
    dst_end: End,
    dst: Spot,
    base: String,
    files: Vec<FileRec>,
    existing: usize,
    sensitive: Vec<String>,
}

/// Which computer the copy reaches, and whether it pulls from it.
fn target(src: &End, dst: &End) -> Result<(String, String, bool), String> {
    let (computer, pulling) = match (src, dst) {
        (End::There(c, _), End::Here(_)) => (c, true),
        (End::Here(_), End::There(c, _)) => (c, false),
        (End::Here(_), End::Here(_)) => {
            return Err("one side must be another computer, written NAME:PATH".into())
        }
        (End::There(..), End::There(..)) => {
            return Err(
                "copy between two other computers through this one: first here, then on".into(),
            )
        }
    };
    if !computer.connected {
        return Err(format!("{} isn't connected right now", computer.name));
    }
    if !computer.supported {
        return Err(format!(
            "{} needs a newer lpm for agents to copy files",
            computer.name
        ));
    }
    if computer.policy.allows(!pulling).is_err() {
        let what = if pulling {
            "copy files from"
        } else {
            "copy files to"
        };
        return Err(format!(
            "agents here can't {what} {} yet. In lpm, open Settings → Connections → {} and set \
             what this computer's agents may copy",
            computer.name, computer.name
        ));
    }
    Ok((computer.slug.clone(), computer.name.clone(), pulling))
}

impl<'h> Plan<'h> {
    fn new(hub: &'h PeerClientHub, ask: &Ask) -> Result<Plan<'h>, String> {
        let mut computers = crate::peerclient::computers(hub);
        let src_end = parse_end(&ask.src, &mut computers)?;
        let dst_end = parse_end(&ask.dst, &mut computers)?;
        let (slug, machine, pulling) = target(&src_end, &dst_end)?;
        let spot = |end: &End, write: bool| match end {
            End::Here(raw) => local_spot(raw, &ask.cwd),
            End::There(c, raw) => remote_spot(hub, &c.slug, raw, write),
        };
        let src = spot(&src_end, false)?;
        let dst = spot(&dst_end, true)?;
        if !src.exists {
            return Err(format!("{} isn't there", src_end.label(&src.path)));
        }
        let base = landing(&src, &dst, dst_end.raw())?;
        if base.is_empty() {
            return Err("there is nowhere to put the copy".into());
        }
        let mut plan = Plan {
            hub,
            slug,
            machine,
            pulling,
            src_end,
            src,
            dst_end,
            dst,
            base,
            files: Vec::new(),
            existing: 0,
            sensitive: Vec::new(),
        };
        plan.files = plan.side(true).files(&source_paths(&plan.src))?;
        if plan.files.is_empty() {
            return Err(format!("{} holds no files to copy", plan.from()));
        }
        let placed: HashSet<String> = plan.files.iter().map(|f| plan.place(&f.path)).collect();
        plan.existing = plan
            .side(false)
            .files(std::slice::from_ref(&plan.base))
            .unwrap_or_default()
            .iter()
            .filter(|f| placed.contains(&f.path))
            .count();
        if plan.existing > 0 && !ask.force {
            return Err(format!(
                "{} already there; --force replaces {}",
                agentapprove::count(plan.existing as u64),
                if plan.existing == 1 { "it" } else { "them" }
            ));
        }
        plan.sensitive = plan.sensitive_paths();
        Ok(plan)
    }

    /// One end of the copy as the engine reaches it.
    fn side(&self, source: bool) -> Side<'h> {
        let (end, spot) = if source {
            (&self.src_end, &self.src)
        } else {
            (&self.dst_end, &self.dst)
        };
        match end {
            End::Here(_) => Side::Here(PathBuf::from(&spot.root)),
            End::There(c, _) => Side::There(Remote {
                hub: self.hub,
                slug: c.slug.clone(),
                cwd: spot.root.clone(),
                agent: Some(AgentCopy { force: !source }),
            }),
        }
    }

    fn place(&self, path: &str) -> String {
        place(&self.src, &self.base, path)
    }

    fn from(&self) -> String {
        self.src_end.label(&self.src.path)
    }

    fn to(&self) -> String {
        self.dst_end.label(&join(&self.dst.root, &self.base))
    }

    /// The files on the other computer this copy touches that always need a yes.
    fn sensitive_paths(&self) -> Vec<String> {
        let remote = if self.pulling { &self.src } else { &self.dst };
        self.files
            .iter()
            .map(|f| {
                let rel = if self.pulling {
                    f.path.clone()
                } else {
                    self.place(&f.path)
                };
                join(&remote.root, &rel)
            })
            .filter(|abs| agentfiles::sensitive(abs, &remote.home))
            .collect()
    }
}

/// A person's yes, unless the tab was already allowed and nothing in the copy
/// always asks.
fn approve(
    app: &AppHandle,
    w: &mut impl Write,
    plan: &Plan,
    who: &Caller,
    project: &str,
) -> Result<(), String> {
    if who.granted(Kind::Copy, &plan.slug) && plan.sensitive.is_empty() {
        return Ok(());
    }
    let copy = What::Copy {
        pulling: plan.pulling,
        from: plan.from(),
        to: plan.to(),
        files: plan.files.len() as u64,
        bytes: plan.files.iter().map(|f| f.size).sum(),
        sensitive: plan
            .sensitive
            .iter()
            .take(SENSITIVE_SHOWN)
            .cloned()
            .collect(),
        replaces: plan.existing > 0,
    };
    let req = Request::new(who, project, &plan.machine, copy, plan.sensitive.is_empty());
    let _ = writeln!(w, "PROGRESS waiting");
    let decision = agentapprove::ask(app, req)?;
    if decision == Decision::Deny {
        return Err("the copy was denied in lpm".into());
    }
    who.keep(decision, Kind::Copy, &plan.slug);
    Ok(())
}

/// Send the files, noting the copy on both computers.
fn copy(plan: &Plan, w: &mut impl Write, who: &Caller, project: &str) -> Result<Value, String> {
    let gone = Cell::new(false);
    let stop = || {
        if gone.get() {
            Err("the copy was stopped".to_string())
        } else {
            Ok(())
        }
    };
    let (src, dst) = (plan.side(true), plan.side(false));
    let place = |path: &str| plan.place(path);
    let out = ignoredrun::copy_to(
        &src,
        &dst,
        &plan.files,
        &place,
        &stop,
        |sent, total, done| {
            if writeln!(w, "PROGRESS {sent} {total} {done}").is_err() {
                gone.set(true);
            }
        },
    );
    let (from, to) = (plan.from(), plan.to());
    let op = if plan.pulling { "read" } else { "write" };
    agentfiles::log(json!({
        "side": "asked", "machine": plan.machine, "op": op, "files": out.files,
        "bytes": out.bytes, "from": from, "to": to, "agent": who.agent, "project": project,
        "error": out.error,
    }));
    if plan.pulling && out.files > 0 {
        let note =
            json!({ "t": "agentDone", "op": "read", "files": out.files, "path": plan.src.path });
        let _ = plan.hub.send_waiting(&plan.slug, note.to_string());
    }
    if let Some(e) = out.error {
        return Err(if out.files > 0 {
            format!(
                "{e} ({} copied before it stopped)",
                agentapprove::count(out.files)
            )
        } else {
            e
        });
    }
    Ok(json!({
        "ok": true, "machine": plan.machine, "from": from, "to": to, "files": out.files,
        "bytes": out.bytes, "added": out.added, "replaced": out.replaced, "batch": out.batch,
    }))
}

/// `agent_cp --request-hex=<JSON>`: `PROGRESS waiting` while lpm asks, then
/// `PROGRESS <bytes> <total> <files>` as the copy goes, then one JSON line.
pub fn cmd_agent_cp(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> std::io::Result<()> {
    let reply = run(args, app, peer, w).unwrap_or_else(|e| json!({ "ok": false, "error": e }));
    writeln!(w, "{reply}")
}

/// `agent_files_log [--count=N]` → the newest copies agents made or served
/// here, oldest first.
pub fn cmd_agent_files_log(args: &[String]) -> String {
    let (_, options) = crate::socketsrv::parse_options(args);
    let count = options
        .get("count")
        .and_then(|n| n.parse().ok())
        .unwrap_or(20)
        .clamp(1, 500);
    Value::Array(agentfiles::recent(count)).to_string()
}

fn run(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> Result<Value, String> {
    let (_, options) = crate::socketsrv::parse_options(args);
    let ask: Ask = options
        .get("request")
        .and_then(|r| serde_json::from_str(r).ok())
        .ok_or("usage: agent_cp --request-hex=<JSON>")?;
    let state = app.state::<PeerClientHub>();
    let plan = Plan::new(state.inner(), &ask)?;
    let who = agentapprove::caller(app, peer, &ask.pane);
    approve(app, w, &plan, &who, &ask.project)?;
    copy(&plan, w, &who, &ask.project)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn computer(slug: &str, name: &str) -> Computer {
        Computer {
            slug: slug.into(),
            name: name.into(),
            connected: true,
            supported: true,
            runs: true,
            policy: Default::default(),
            home: String::new(),
        }
    }

    #[test]
    fn a_drive_letter_or_a_plain_path_stays_here() {
        let mut list = vec![computer("a1", "mini")];
        assert!(matches!(
            parse_end("C:\\Users\\me\\x", &mut list),
            Ok(End::Here(_))
        ));
        assert!(matches!(parse_end("/tmp/a:b", &mut list), Ok(End::Here(_))));
        assert!(matches!(parse_end("/tmp/x", &mut list), Ok(End::Here(_))));
        assert!(matches!(parse_end("mini:~/x", &mut list), Ok(End::There(_, p)) if p == "~/x"));
        let mut list = vec![computer("a1", "mini")];
        assert!(parse_end("studio:~/x", &mut list).is_err());
    }

    fn spot(rel: &str, path: &str, dir: bool, exists: bool) -> Spot {
        Spot {
            root: "/r".into(),
            rel: rel.into(),
            path: path.into(),
            dir,
            exists,
            ..Default::default()
        }
    }

    #[test]
    fn a_file_lands_in_a_folder_by_its_name_or_where_named() {
        let src = spot(
            "lpm-upload.jks",
            "/Users/a/keys/lpm-upload.jks",
            false,
            true,
        );
        let into_dir = spot("", "/Users/b/keys", true, true);
        assert_eq!(
            landing(&src, &into_dir, "/Users/b/keys").unwrap(),
            "lpm-upload.jks"
        );
        let renamed = spot("upload.jks", "/Users/b/keys/upload.jks", false, false);
        assert_eq!(
            landing(&src, &renamed, "/Users/b/keys/upload.jks").unwrap(),
            "upload.jks"
        );
        assert_eq!(place(&src, "upload.jks", "lpm-upload.jks"), "upload.jks");
        let missing_dir = spot("nope", "/Users/b/nope", false, false);
        assert!(landing(&src, &missing_dir, "/Users/b/nope/").is_err());
    }

    #[test]
    fn a_folder_keeps_its_name_inside_the_destination() {
        let src = spot("certs", "/Users/a/app/certs", true, true);
        let dst = spot("app", "/Users/b/app", true, true);
        let base = landing(&src, &dst, "/Users/b/app").unwrap();
        assert_eq!(base, "app/certs");
        assert_eq!(
            place(&src, &base, "certs/dev/key.pem"),
            "app/certs/dev/key.pem"
        );
        let file_in_way = spot("certs", "/Users/b/certs", false, true);
        assert!(landing(&src, &file_in_way, "/Users/b/certs").is_err());
    }

    #[test]
    fn a_whole_open_folder_copies_its_children() {
        let mut src = spot("", "/Users/a/Projects/app", true, true);
        src.children = vec!["src".into(), "README.md".into()];
        assert_eq!(source_paths(&src), vec!["src", "README.md"]);
        let dst = spot("", "/Users/b/Projects", true, true);
        let base = landing(&src, &dst, "/Users/b/Projects").unwrap();
        assert_eq!(base, "app");
        assert_eq!(place(&src, &base, "src/main.rs"), "app/src/main.rs");
    }

    #[test]
    fn a_local_file_is_found_under_its_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "x").unwrap();
        let s = local_spot(&dir.path().join("a.txt").to_string_lossy(), "").unwrap();
        assert_eq!(s.rel, "a.txt");
        assert!(s.exists && !s.dir);
        let missing = local_spot("b.txt", &dir.path().to_string_lossy()).unwrap();
        assert_eq!(missing.rel, "b.txt");
        assert!(!missing.exists);
        let folder = local_spot(&dir.path().to_string_lossy(), "/elsewhere").unwrap();
        assert!(folder.dir && folder.rel.is_empty());
        assert_eq!(folder.children, vec!["a.txt"]);
        assert!(local_spot("relative.txt", "").is_err());
    }

    #[test]
    fn remote_paths_join_the_way_that_computer_writes_them() {
        assert_eq!(join("/Users/b", "keys/x.jks"), "/Users/b/keys/x.jks");
        assert_eq!(
            join("C:\\Users\\b", "keys/x.jks"),
            "C:\\Users\\b\\keys\\x.jks"
        );
    }
}
