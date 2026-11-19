// This machine's sidebar folders, read and edited by a paired Mac.
//
// The host's groups.json and sidebarOrder are the one layout every viewer of its
// projects shares — its own window, a phone, a paired Mac — so a Mac edits it
// here one op at a time, applied to what is on disk now. It never writes back a
// whole layout it read earlier, which would undo whatever changed in between.
// Which folders are folded is part of that layout: one folded on any Mac is
// folded on all of them.
use crate::config;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// Advertised in `ready`: this host answers READ_CMD and EDIT_CMD.
pub(crate) const HOST_FOLDERS_FEATURE: &str = "hostFolders";
/// Advertised in `ready`: EDIT_CMD also takes `fold`. A Mac whose host lacks it
/// folds that host's folders for itself alone.
pub(crate) const HOST_FOLDER_FOLDS_FEATURE: &str = "hostFolderFolds";
pub(crate) const READ_CMD: &str = "host_folders";
pub(crate) const EDIT_CMD: &str = "host_folders_edit";

const GROUP_PREFIX: &str = "group:";
const PEER_PREFIX: &str = "peer:";

#[derive(Deserialize, Debug, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Op {
    /// A new folder, slotted before `before` (or last), holding `members`.
    Create {
        #[serde(skip_deserializing, default = "fresh_id")]
        id: String,
        name: String,
        #[serde(default)]
        members: Vec<String>,
        before: Option<String>,
    },
    Rename { id: String, name: String },
    Fold { id: String, collapsed: bool },
    /// Drop the folder; its projects take its slot.
    Ungroup { id: String },
    /// Put a project into `folder` before its member `before`, or at the top
    /// level before the token `before` — a project or a "group:<id>". Either way
    /// a missing `before` means last.
    Move {
        item: String,
        folder: Option<String>,
        before: Option<String>,
    },
    /// The copies of one project in their new order. They have no slot in the
    /// layout; they sort under their parent by where projectOrder lists them.
    Copies { order: Vec<String> },
}

fn fresh_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// The layout as the host's own sidebar holds it, without the slots of the
/// machines paired with this one: those sections are this host's alone.
pub(crate) fn layout() -> Value {
    let (order, groups) = crate::remote::sidebar_json();
    let order: Vec<Value> = order
        .as_array()
        .map(|tokens| {
            tokens
                .iter()
                .filter(|t| !t.as_str().is_some_and(|s| s.starts_with(PEER_PREFIX)))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    json!({ "order": order, "groups": groups })
}

/// Apply one op, persist it the way the host's own sidebar would, and answer
/// with the layout it left behind.
pub(crate) fn edit(app: &AppHandle, args: &Value) -> Result<Value, String> {
    let op: Op = serde_json::from_value(args.clone()).map_err(|e| format!("bad folder edit: {e}"))?;
    if let Op::Copies { order } = &op {
        let current = project_order();
        config::merge_settings(json!({ "projectOrder": reorder_copies(&current, order) }))?;
    } else {
        let (mut order, mut wrap) = crate::remote::load_sidebar_layout()?;
        let groups = wrap
            .get_mut("groups")
            .and_then(Value::as_array_mut)
            .ok_or("groups.json malformed")?;
        apply(&mut order, groups, op, &config::project_exists)?;
        crate::remote::persist_sidebar_layout(order, wrap)?;
    }
    // The host's own windows hold the layout in memory and re-read it on this;
    // without it their next save would put the old one back.
    let _ = app.emit("projects-changed", ());
    let _ = app.emit("sidebar-changed", ());
    Ok(layout())
}

fn project_order() -> Vec<String> {
    config::load_settings()
        .get("projectOrder")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn apply(
    order: &mut Vec<Value>,
    groups: &mut Vec<Value>,
    op: Op,
    known: &dyn Fn(&str) -> bool,
) -> Result<(), String> {
    match op {
        Op::Create {
            id,
            name,
            members,
            before,
        } => {
            let name = name.trim();
            let name = if name.is_empty() { "New Folder" } else { name };
            groups.push(json!({ "id": id, "name": name, "members": [] }));
            insert_before(order, &format!("{GROUP_PREFIX}{id}"), before.as_deref());
            for member in members.iter().filter(|m| known(m)) {
                detach(order, groups, member);
                if let Some(list) = groups.last_mut().and_then(members_mut) {
                    list.push(Value::String(member.clone()));
                }
            }
        }
        Op::Rename { id, name } => {
            let name = name.trim();
            if name.is_empty() {
                return Err("Folder name required.".into());
            }
            let at = group_index(groups, &id)?;
            if let Some(g) = groups[at].as_object_mut() {
                g.insert("name".into(), json!(name));
            }
        }
        Op::Fold { id, collapsed } => {
            let at = group_index(groups, &id)?;
            if let Some(g) = groups[at].as_object_mut() {
                if collapsed {
                    g.insert("collapsed".into(), json!(true));
                } else {
                    g.remove("collapsed");
                }
            }
        }
        Op::Ungroup { id } => {
            let at = group_index(groups, &id)?;
            let members = groups[at]
                .get("members")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            groups.remove(at);
            let token = format!("{GROUP_PREFIX}{id}");
            match order.iter().position(|t| t.as_str() == Some(&token)) {
                Some(pos) => {
                    order.splice(pos..=pos, members);
                }
                None => order.extend(members),
            }
        }
        Op::Move {
            item,
            folder,
            before,
        } => {
            if let Some(id) = item.strip_prefix(GROUP_PREFIX) {
                group_index(groups, id)?;
                if folder.is_some() {
                    return Err("A folder can't go inside another folder.".into());
                }
            } else if !known(&item) {
                return Err(format!("No project named {item}."));
            }
            match folder {
                Some(id) => {
                    let at = group_index(groups, &id)?;
                    detach(order, groups, &item);
                    if let Some(list) = members_mut(&mut groups[at]) {
                        insert_before(list, &item, before.as_deref());
                    }
                }
                None => {
                    detach(order, groups, &item);
                    insert_before(order, &item, before.as_deref());
                }
            }
        }
        Op::Copies { .. } => unreachable!("copies reorder projectOrder, not the layout"),
    }
    Ok(())
}

fn group_index(groups: &[Value], id: &str) -> Result<usize, String> {
    groups
        .iter()
        .position(|g| g.get("id").and_then(Value::as_str) == Some(id))
        .ok_or_else(|| "That folder no longer exists.".to_string())
}

fn members_mut(group: &mut Value) -> Option<&mut Vec<Value>> {
    group.get_mut("members").and_then(Value::as_array_mut)
}

/// Take `item` out of wherever it sits: a top-level slot or any folder.
fn detach(order: &mut Vec<Value>, groups: &mut [Value], item: &str) {
    order.retain(|t| t.as_str() != Some(item));
    for g in groups.iter_mut() {
        if let Some(list) = members_mut(g) {
            list.retain(|m| m.as_str() != Some(item));
        }
    }
}

fn insert_before(list: &mut Vec<Value>, item: &str, before: Option<&str>) {
    let at = before
        .and_then(|b| list.iter().position(|v| v.as_str() == Some(b)))
        .unwrap_or(list.len());
    list.insert(at, Value::String(item.to_string()));
}

/// projectOrder with `copies` in their new order. Only their order relative to
/// each other matters — the list regroups copies under their parent — so they
/// go back together where the first of them was.
fn reorder_copies(current: &[String], copies: &[String]) -> Vec<String> {
    let at = current
        .iter()
        .position(|n| copies.contains(n))
        .unwrap_or(current.len());
    let mut out: Vec<String> = current.iter().filter(|n| !copies.contains(n)).cloned().collect();
    let at = current[..at].iter().filter(|n| !copies.contains(n)).count();
    out.splice(at..at, copies.iter().cloned());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout_of(order: &[&str], groups: Value) -> (Vec<Value>, Vec<Value>) {
        let order = order.iter().map(|t| json!(t)).collect();
        (order, groups.as_array().cloned().unwrap())
    }

    fn known(name: &str) -> bool {
        !name.starts_with("gone")
    }

    fn run(order: &[&str], groups: Value, op: Value) -> (Vec<Value>, Vec<Value>) {
        let (mut order, mut groups) = layout_of(order, groups);
        let mut op: Op = serde_json::from_value(op).unwrap();
        if let Op::Create { id, .. } = &mut op {
            *id = "new".into();
        }
        apply(&mut order, &mut groups, op, &known).unwrap();
        (order, groups)
    }

    #[test]
    fn create_slots_the_folder_and_takes_its_members() {
        let (order, groups) = run(
            &["web", "api", "cli"],
            json!([]),
            json!({ "op": "create", "name": " Work ", "members": ["api", "gone"], "before": "api" }),
        );
        assert_eq!(order, vec![json!("web"), json!("group:new"), json!("cli")]);
        assert_eq!(groups, vec![json!({ "id": "new", "name": "Work", "members": ["api"] })]);
    }

    #[test]
    fn create_without_an_anchor_goes_last() {
        let (order, groups) = run(&["web"], json!([]), json!({ "op": "create", "name": "" }));
        assert_eq!(order, vec![json!("web"), json!("group:new")]);
        assert_eq!(groups[0]["name"], "New Folder");
    }

    #[test]
    fn rename_keeps_the_other_fields() {
        let (_, groups) = run(
            &["group:a"],
            json!([{ "id": "a", "name": "Old", "collapsed": true, "members": [] }]),
            json!({ "op": "rename", "id": "a", "name": "New" }),
        );
        assert_eq!(groups[0], json!({ "id": "a", "name": "New", "collapsed": true, "members": [] }));
    }

    #[test]
    fn fold_sets_and_clears_collapsed() {
        let open = json!({ "id": "a", "name": "A", "members": ["api"] });
        let folded = json!({ "id": "a", "name": "A", "collapsed": true, "members": ["api"] });
        let fold = |group: &Value, collapsed: bool| {
            let op = json!({ "op": "fold", "id": "a", "collapsed": collapsed });
            run(&["group:a"], json!([group]), op).1.remove(0)
        };
        assert_eq!(fold(&open, true), folded);
        assert_eq!(fold(&folded, false), open);
    }

    #[test]
    fn ungroup_spills_members_into_the_folder_slot() {
        let (order, groups) = run(
            &["web", "group:a", "cli"],
            json!([{ "id": "a", "name": "A", "members": ["api", "db"] }]),
            json!({ "op": "ungroup", "id": "a" }),
        );
        assert_eq!(order, vec![json!("web"), json!("api"), json!("db"), json!("cli")]);
        assert!(groups.is_empty());
    }

    #[test]
    fn move_into_a_folder_before_a_member() {
        let (order, groups) = run(
            &["web", "group:a"],
            json!([{ "id": "a", "name": "A", "members": ["api", "db"] }]),
            json!({ "op": "move", "item": "web", "folder": "a", "before": "db" }),
        );
        assert_eq!(order, vec![json!("group:a")]);
        assert_eq!(groups[0]["members"], json!(["api", "web", "db"]));
    }

    #[test]
    fn move_out_to_the_top_level_and_reorder_a_folder() {
        let groups = json!([{ "id": "a", "name": "A", "members": ["api"] }]);
        let (order, groups) = run(
            &["web", "group:a", "cli"],
            groups,
            json!({ "op": "move", "item": "api", "folder": null, "before": "web" }),
        );
        assert_eq!(order, vec![json!("api"), json!("web"), json!("group:a"), json!("cli")]);
        assert_eq!(groups[0]["members"], json!([]));

        let (order, _) = run(
            &["web", "group:a", "cli"],
            json!([{ "id": "a", "name": "A", "members": [] }]),
            json!({ "op": "move", "item": "group:a", "before": null }),
        );
        assert_eq!(order, vec![json!("web"), json!("cli"), json!("group:a")]);
    }

    #[test]
    fn a_missing_anchor_means_last() {
        let (order, _) = run(
            &["web", "cli"],
            json!([]),
            json!({ "op": "move", "item": "web", "before": "deleted-meanwhile" }),
        );
        assert_eq!(order, vec![json!("cli"), json!("web")]);
    }

    #[test]
    fn refuses_what_would_corrupt_the_layout() {
        let refuse = |order: &[&str], groups: Value, op: Value| {
            let (mut order, mut groups) = layout_of(order, groups);
            let op: Op = serde_json::from_value(op).unwrap();
            assert!(apply(&mut order, &mut groups, op, &known).is_err());
        };
        let one = json!([{ "id": "a", "name": "A", "members": [] }]);
        refuse(&["web"], json!([]), json!({ "op": "move", "item": "gone-1" }));
        refuse(&["web"], json!([]), json!({ "op": "move", "item": "web", "folder": "nope" }));
        refuse(&["group:a"], one.clone(), json!({ "op": "move", "item": "group:a", "folder": "a" }));
        refuse(&["group:a"], one.clone(), json!({ "op": "rename", "id": "a", "name": "  " }));
        refuse(&[], json!([]), json!({ "op": "ungroup", "id": "a" }));
        refuse(&[], json!([]), json!({ "op": "fold", "id": "a", "collapsed": true }));
    }

    #[test]
    fn copies_keep_their_place_in_the_project_order() {
        let order: Vec<String> = ["web", "api", "api-1", "api-2", "cli"].map(String::from).into();
        let copies: Vec<String> = ["api-2", "api-1"].map(String::from).into();
        assert_eq!(reorder_copies(&order, &copies), ["web", "api", "api-2", "api-1", "cli"]);
        // A copy the order never listed still lands next to its siblings.
        let copies: Vec<String> = ["api-3", "api-1", "api-2"].map(String::from).into();
        assert_eq!(
            reorder_copies(&order, &copies),
            ["web", "api", "api-3", "api-1", "api-2", "cli"]
        );
        let copies: Vec<String> = ["x-1"].map(String::from).into();
        assert_eq!(reorder_copies(&order, &copies).last().map(String::as_str), Some("x-1"));
    }

    #[test]
    fn the_wire_shape_parses() {
        let op: Op = serde_json::from_value(json!({ "op": "copies", "order": ["a-1"] })).unwrap();
        assert_eq!(op, Op::Copies { order: vec!["a-1".into()] });
        assert!(serde_json::from_value::<Op>(json!({ "op": "explode" })).is_err());
    }
}
