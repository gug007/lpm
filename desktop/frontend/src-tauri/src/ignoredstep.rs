// One round of keeping a list in step with another computer: compare both
// sides, decide per file, copy both ways, and record what the two now agree on.
// The background engine runs it quietly; Sync in the dialog runs it with the
// user's word on files that differ now.
//
// With several computers, this Mac sits in the middle: it settles with each in
// turn, and when a later one brought files here, the earlier ones get a second
// round so every computer ends up holding them.
use crate::ignoredkeep::{self, SyncList};
use crate::ignoredrun::{copy, on_both, Side};
use crate::ignoredscan::FileRec;
use std::collections::{BTreeSet, HashMap};

/// Which version one round keeps where the two computers differ.
#[derive(Clone, Copy, PartialEq, Debug)]
pub(crate) enum Prefer {
    Newest,
    Here,
    There,
}

/// Which version Sync keeps where the computers differ: the newest, this
/// Mac's, or one other computer's.
#[derive(Clone, PartialEq, Debug)]
pub(crate) enum Choice {
    Newest,
    Here,
    Peer(String),
}

impl Choice {
    pub(crate) fn parse(s: &str, slugs: &[&str]) -> Result<Self, String> {
        match s {
            "newest" => Ok(Choice::Newest),
            "here" => Ok(Choice::Here),
            _ if slugs.contains(&s) => Ok(Choice::Peer(s.to_string())),
            _ => Err(format!("unknown choice {s}")),
        }
    }
}

/// The order the computers are settled in, each with the word its round goes
/// by. A picked computer goes first, so this Mac holds its version for the
/// rounds after it, which keep this Mac's.
fn order(slugs: &[&str], choice: Option<&Choice>) -> Vec<(usize, Option<Prefer>)> {
    let first = match choice {
        Some(Choice::Peer(s)) => slugs.iter().position(|x| x == s),
        _ => None,
    };
    let each = match choice {
        None => None,
        Some(Choice::Newest) => Some(Prefer::Newest),
        Some(_) => Some(Prefer::Here),
    };
    let rest = (0..slugs.len()).filter(|i| Some(*i) != first);
    first
        .map(|i| (i, Some(Prefer::There)))
        .into_iter()
        .chain(rest.map(|i| (i, each)))
        .collect()
}

/// One computer a project's list is kept in step with.
pub(crate) struct Peer<'a> {
    pub slug: String,
    pub there: Side<'a>,
}

#[derive(Default)]
pub(crate) struct Plan {
    pub push: Vec<FileRec>,
    pub pull: Vec<FileRec>,
    pub conflicts: Vec<String>,
    pub agreed: Vec<(String, String)>,
}

/// What to do with each file, from what this Mac holds, what the other holds,
/// and what they last agreed on. Without `prefer`, a file changed on both is
/// left for the user; with it, `Newest` settles such a file by modification
/// time and `Here` or `There` picks that side for every file that differs.
pub(crate) fn plan(
    here: &[FileRec],
    there: &[FileRec],
    last: &HashMap<String, String>,
    prefer: Option<Prefer>,
) -> Plan {
    let h: HashMap<&str, &FileRec> = here.iter().map(|f| (f.path.as_str(), f)).collect();
    let t: HashMap<&str, &FileRec> = there.iter().map(|f| (f.path.as_str(), f)).collect();
    let paths: BTreeSet<&str> = h.keys().chain(t.keys()).copied().collect();
    let mut out = Plan::default();
    for p in paths {
        let agreed = last.get(p).map(String::as_str);
        match (h.get(p), t.get(p)) {
            (Some(a), Some(b)) if a.digest == b.digest => {
                out.agreed.push((p.to_string(), a.digest.clone()))
            }
            (Some(a), Some(b)) => {
                let keep_here = match prefer {
                    Some(Prefer::Here) => Some(true),
                    Some(Prefer::There) => Some(false),
                    _ if agreed == Some(a.digest.as_str()) => Some(false),
                    _ if agreed == Some(b.digest.as_str()) => Some(true),
                    Some(Prefer::Newest) => Some(a.mtime >= b.mtime),
                    None => None,
                };
                match keep_here {
                    Some(true) => out.push.push((*a).clone()),
                    Some(false) => out.pull.push((*b).clone()),
                    None => out.conflicts.push(p.to_string()),
                }
            }
            (Some(a), None) if agreed != Some(a.digest.as_str()) => out.push.push((*a).clone()),
            (None, Some(b)) if agreed != Some(b.digest.as_str()) => out.pull.push((*b).clone()),
            _ => {}
        }
    }
    out
}

#[derive(Default)]
pub(crate) struct Step {
    pub sent: u64,
    pub received: u64,
    pub bytes: u64,
    /// What landed, as `(batch, on the other computer)`, for Undo.
    pub batches: Vec<(String, bool)>,
    pub conflicts: Vec<String>,
    /// Why copying stopped part way; what landed before it stays.
    pub error: Option<String>,
}

/// Bring `list` in step between `here` and `there` once, and record the result
/// for `project` and computer `slug`. `progress` gets `(bytes, total, files)` of
/// each direction's copy in turn.
#[allow(clippy::too_many_arguments)]
pub(crate) fn bring_in_step(
    project: &str,
    slug: &str,
    here: &Side,
    there: &Side,
    list: &SyncList,
    prefer: Option<Prefer>,
    stop: &dyn Fn() -> Result<(), String>,
    progress: &mut dyn FnMut(u64, u64, u64),
) -> Result<Step, String> {
    let (h, t) = on_both(here, there, |side| side.manifest(&list.paths));
    let (h, t) = (h?, t?);
    let mut plan = plan(&h, &t, &list.last, prefer);
    let mut agreed = std::mem::take(&mut plan.agreed);
    let mut step = Step {
        conflicts: plan.conflicts.clone(),
        ..Default::default()
    };
    for (files, src, dst, to_peer) in [
        (&plan.push, here, there, true),
        (&plan.pull, there, here, false),
    ] {
        if files.is_empty() {
            continue;
        }
        let out = copy(src, dst, files, stop, &mut *progress);
        if out.added + out.replaced > 0 {
            step.batches.push((out.batch, to_peer));
        }
        step.bytes += out.bytes;
        if to_peer {
            step.sent += out.files;
        } else {
            step.received += out.files;
        }
        if out.error.is_some() {
            step.error = out.error;
            return Ok(step);
        }
        agreed.extend(files.iter().map(|f| (f.path.clone(), f.digest.clone())));
    }
    let present: BTreeSet<&str> = h.iter().chain(t.iter()).map(|f| f.path.as_str()).collect();
    ignoredkeep::update(project, slug, |l| {
        let before = l.last.len();
        l.last.retain(|p, _| present.contains(p.as_str()));
        let mut changed = l.last.len() != before;
        for (path, digest) in agreed {
            changed |= l.last.get(&path) != Some(&digest);
            l.last.insert(path, digest);
        }
        changed |= l.conflicts != plan.conflicts || l.error.is_some();
        l.conflicts = plan.conflicts.clone();
        l.error = None;
        changed
    });
    Ok(step)
}

impl Step {
    fn add(&mut self, later: Step) {
        self.sent += later.sent;
        self.received += later.received;
        self.bytes += later.bytes;
        self.batches.extend(later.batches);
        self.conflicts = later.conflicts;
        self.error = later.error.or(self.error.take());
    }
}

fn round(
    project: &str,
    here: &Side,
    peer: &Peer,
    prefer: Option<Prefer>,
    stop: &dyn Fn() -> Result<(), String>,
    progress: &mut dyn FnMut(&str, u64, u64, u64),
) -> Result<Step, String> {
    let list = ignoredkeep::get(project, &peer.slug).ok_or("the list was removed")?;
    let mut each = |sent, total, files| progress(&peer.slug, sent, total, files);
    bring_in_step(
        project,
        &peer.slug,
        here,
        &peer.there,
        &list,
        prefer,
        stop,
        &mut each,
    )
}

/// Bring `project`'s list in step with every one of `peers`, this Mac in the
/// middle, and answer each computer's rounds added up. `progress` gets the
/// computer being copied with, then `(bytes, total, files)`.
pub(crate) fn bring_all_in_step(
    project: &str,
    here: &Side,
    peers: &[Peer],
    choice: Option<&Choice>,
    stop: &dyn Fn() -> Result<(), String>,
    progress: &mut dyn FnMut(&str, u64, u64, u64),
) -> Vec<(String, Result<Step, String>)> {
    let slugs: Vec<&str> = peers.iter().map(|p| p.slug.as_str()).collect();
    let order = order(&slugs, choice);
    let mut out: Vec<(String, Result<Step, String>)> = Vec::new();
    let mut brought_here = None;
    for (n, (i, prefer)) in order.iter().enumerate() {
        if stop().is_err() {
            return out;
        }
        let res = round(project, here, &peers[*i], *prefer, stop, progress);
        if matches!(&res, Ok(s) if s.received > 0) {
            brought_here = Some(n);
        }
        out.push((peers[*i].slug.clone(), res));
    }
    let again = choice.map(|_| Prefer::Here);
    for n in 0..brought_here.unwrap_or(0) {
        if stop().is_err() {
            break;
        }
        let Ok(first) = &mut out[n].1 else { continue };
        if first.error.is_some() {
            continue;
        }
        match round(project, here, &peers[order[n].0], again, stop, progress) {
            Ok(step) => first.add(step),
            Err(e) => first.error = Some(e),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(path: &str, digest: &str, mtime: u64) -> FileRec {
        FileRec {
            path: path.into(),
            size: 1,
            mtime,
            digest: digest.into(),
            exec: false,
            link: None,
        }
    }

    fn last(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(p, d)| (p.to_string(), d.to_string()))
            .collect()
    }

    fn names(files: &[FileRec]) -> Vec<&str> {
        files.iter().map(|f| f.path.as_str()).collect()
    }

    #[test]
    fn the_side_that_moved_since_they_agreed_wins() {
        let here = [rec(".env", "new", 0), rec("a", "x", 0), rec("b", "old", 0)];
        let there = [
            rec(".env", "old", 0),
            rec("a", "x", 0),
            rec("b", "theirs", 0),
        ];
        let p = plan(&here, &there, &last(&[(".env", "old"), ("b", "old")]), None);
        assert_eq!(names(&p.push), [".env"]);
        assert_eq!(names(&p.pull), ["b"]);
        assert_eq!(p.agreed, [("a".to_string(), "x".to_string())]);
        assert!(p.conflicts.is_empty());
    }

    #[test]
    fn a_file_changed_on_both_is_left_for_the_user() {
        let p = plan(
            &[rec(".env", "mine", 0)],
            &[rec(".env", "theirs", 0)],
            &last(&[(".env", "old")]),
            None,
        );
        assert_eq!(p.conflicts, [".env"]);
        assert!(p.push.is_empty() && p.pull.is_empty());
        let first = plan(
            &[rec(".env", "mine", 0)],
            &[rec(".env", "theirs", 0)],
            &HashMap::new(),
            None,
        );
        assert_eq!(
            first.conflicts,
            [".env"],
            "never agreed: no side can be trusted to win"
        );
    }

    #[test]
    fn new_files_cross_and_deleted_ones_stay_deleted() {
        let p = plan(
            &[
                rec("uploads/new.jpg", "n", 0),
                rec("uploads/gone-there.jpg", "g", 0),
            ],
            &[rec("uploads/theirs.jpg", "t", 0)],
            &last(&[("uploads/gone-there.jpg", "g")]),
            None,
        );
        assert_eq!(names(&p.push), ["uploads/new.jpg"]);
        assert_eq!(names(&p.pull), ["uploads/theirs.jpg"]);
    }

    #[test]
    fn the_users_word_settles_what_differs_now() {
        let here = [rec(".env", "mine", 200), rec("old.txt", "a", 100)];
        let there = [rec(".env", "theirs", 100), rec("old.txt", "b", 300)];
        let newest = plan(&here, &there, &HashMap::new(), Some(Prefer::Newest));
        assert_eq!(
            (names(&newest.push), names(&newest.pull)),
            (vec![".env"], vec!["old.txt"])
        );
        let theirs = plan(
            &here,
            &there,
            &last(&[(".env", "theirs")]),
            Some(Prefer::Here),
        );
        assert_eq!(
            names(&theirs.push),
            [".env", "old.txt"],
            "picking a side applies to every difference"
        );
        assert!(newest.conflicts.is_empty() && theirs.conflicts.is_empty());
    }

    #[test]
    fn a_picked_computer_is_settled_first_and_the_rest_take_this_macs() {
        let slugs = ["studio", "mini", "linux"];
        let picked = Choice::Peer("mini".into());
        assert_eq!(
            order(&slugs, Some(&picked)),
            [
                (1, Some(Prefer::There)),
                (0, Some(Prefer::Here)),
                (2, Some(Prefer::Here))
            ]
        );
        assert_eq!(
            order(&slugs, Some(&Choice::Newest)),
            [
                (0, Some(Prefer::Newest)),
                (1, Some(Prefer::Newest)),
                (2, Some(Prefer::Newest))
            ]
        );
        assert_eq!(order(&slugs, None), [(0, None), (1, None), (2, None)]);
        assert_eq!(
            Choice::parse("mini", &slugs),
            Ok(Choice::Peer("mini".into()))
        );
        assert!(
            Choice::parse("elsewhere", &slugs).is_err(),
            "only a computer being synced can be picked"
        );
    }
}
