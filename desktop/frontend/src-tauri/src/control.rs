// Single-owner display control for a shared terminal.
//
// A terminal's PTY is a single Rust-owned resource that can be shown on several
// surfaces at once — the main window, a detached window, and any paired phone.
// Rendering the same live terminal in two differently-sized surfaces makes one
// of them mis-wrap (very visible in TUI apps that redraw at absolute cursor
// positions), and lets both fight over the single shared PTY geometry.
//
// So exactly one surface *owns* a terminal at a time: it renders live and drives
// the PTY size; every other surface shows a "take control" placeholder instead.
// Ownership lives here (not in either window's frontend) because the PTY is the
// shared resource and both desktop (`ResizeTerminal`) and mobile (`resize`)
// already funnel geometry through Rust — so this is the one point that can
// mutually exclude every surface.
//
// A **surface** is `{kind, id, label}`: a desktop window (`window`/`main` or
// `window`/`detached:<project>`) or a phone (`mobile`/<device_id>). Identity is
// `(kind, id)`; `label` is only for the placeholder copy. Per terminal we track
// the set of surfaces currently *presenting* it (active tab + laid out, or a
// phone with its terminal screen open) and which presenter is the *owner*. The
// first presenter wins ownership; a later presenter must explicitly `claim` to
// take over (the manual "Take control" button). When the owner stops presenting
// (tab switch, window/phone close) ownership transfers to a remaining presenter
// so control is never stranded on a surface that no longer shows the terminal.
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

pub const EVENT_CHANGED: &str = "terminal-control-changed";

#[derive(Clone, Debug, Serialize)]
pub struct Owner {
    pub kind: String,
    pub id: String,
    pub label: String,
}

impl Owner {
    pub fn new(kind: impl Into<String>, id: impl Into<String>, label: impl Into<String>) -> Self {
        Owner {
            kind: kind.into(),
            id: id.into(),
            label: label.into(),
        }
    }
    /// Two surfaces are the same regardless of label.
    fn same(&self, other: &Owner) -> bool {
        self.kind == other.kind && self.id == other.id
    }
}

/// The control-surface id a detached window registers for a project. This is a
/// cross-layer contract: it MUST equal the frontend `REALM.id` in
/// `src/mirror.ts` (also `detached:<project>`). The detached-window close handler
/// releases control by this id, so any drift would strand ownership on a closed
/// window — keep the two in lockstep.
pub fn detached_window_id(project: &str) -> String {
    format!("detached:{project}")
}

#[derive(Default)]
pub struct ControlState {
    // terminal id -> presenters, ordered with the OWNER at the front. So the
    // owner is derivable (`.first()`), and the ordering encodes the handoff: a
    // leaving owner hands off to the next presenter, and `claim` moves a surface
    // to the front. One map, one lock — nothing to keep in sync.
    presenters: Mutex<HashMap<String, Vec<Owner>>>,
}

fn owners_eq(a: &Option<Owner>, b: &Option<Owner>) -> bool {
    match (a, b) {
        (Some(x), Some(y)) => x.same(y),
        (None, None) => true,
        _ => false,
    }
}

impl ControlState {
    pub fn owner_of(&self, id: &str) -> Option<Owner> {
        self.presenters
            .lock()
            .unwrap()
            .get(id)
            .and_then(|l| l.first().cloned())
    }

    // Every mutator returns `(new owner, owner_changed)` so callers broadcast the
    // cross-surface change only when it's real — a deferring present / no-op claim
    // / non-owner unpresent produces no broadcast.

    /// Mark a surface as presenting a terminal. First presenter wins (goes to the
    /// front); a later presenter joins at the back and the owner is unchanged.
    pub fn present(&self, id: &str, who: Owner) -> (Owner, bool) {
        let mut p = self.presenters.lock().unwrap();
        let list = p.entry(id.to_string()).or_default();
        let old = list.first().cloned();
        if !list.iter().any(|o| o.same(&who)) {
            list.push(who.clone());
        }
        let new = list.first().cloned().unwrap_or(who);
        let changed = !owners_eq(&old, &Some(new.clone()));
        (new, changed)
    }

    /// Explicit takeover ("Take control"): move the surface to the front.
    pub fn claim(&self, id: &str, who: Owner) -> (Owner, bool) {
        let mut p = self.presenters.lock().unwrap();
        let list = p.entry(id.to_string()).or_default();
        let changed = !list.first().is_some_and(|o| o.same(&who));
        list.retain(|o| !o.same(&who));
        list.insert(0, who.clone());
        (who, changed)
    }

    /// Stop presenting a terminal. If the leaving surface was the owner (front),
    /// the next presenter inherits; otherwise the owner is unchanged.
    pub fn unpresent(&self, id: &str, who: &Owner) -> (Option<Owner>, bool) {
        let mut p = self.presenters.lock().unwrap();
        let Some(list) = p.get_mut(id) else {
            return (None, false);
        };
        let old = list.first().cloned();
        list.retain(|o| !o.same(who));
        let new = list.first().cloned();
        if list.is_empty() {
            p.remove(id);
        }
        let changed = !owners_eq(&old, &new);
        (new, changed)
    }

    /// Remove a surface from every terminal (window/phone closed). Returns the
    /// ids whose owner changed, with the new owner, so the caller broadcasts just
    /// those.
    pub fn drop_surface(&self, who: &Owner) -> Vec<(String, Option<Owner>)> {
        let ids: Vec<String> = self.presenters.lock().unwrap().keys().cloned().collect();
        let mut changed = Vec::new();
        for id in ids {
            let (new, did_change) = self.unpresent(&id, who);
            if did_change {
                changed.push((id, new));
            }
        }
        changed
    }
}

// --- broadcasting -------------------------------------------------------------

/// A terminal owner as `{kind,id,label}` JSON, or null. The wire encoding lives
/// here since this module owns the `Owner` type; `remote.rs` reuses it.
pub fn owner_json(owner: &Option<Owner>) -> Value {
    match owner {
        Some(o) => serde_json::to_value(o).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

/// Publish a terminal's new owner to every surface: an `app.emit` reaches all
/// desktop webviews, and `remote::push_control` fans out to any paired phones
/// (a no-op when the mobile server is disabled / has no clients).
pub fn broadcast(app: &AppHandle, id: &str, owner: &Option<Owner>) {
    let payload = serde_json::json!({ "id": id, "owner": owner_json(owner) });
    let _ = app.emit(EVENT_CHANGED, payload);
    crate::remote::push_control(app, id, owner);
}

// --- commands (desktop windows) ----------------------------------------------

#[tauri::command]
pub fn terminal_present_control(
    app: AppHandle,
    state: State<'_, ControlState>,
    id: String,
    realm_kind: String,
    realm_id: String,
    label: String,
) -> Owner {
    let (owner, changed) = state.present(&id, Owner::new(realm_kind, realm_id, label));
    if changed {
        broadcast(&app, &id, &Some(owner.clone()));
    }
    owner
}

#[tauri::command]
pub fn terminal_unpresent_control(
    app: AppHandle,
    state: State<'_, ControlState>,
    id: String,
    realm_kind: String,
    realm_id: String,
) -> Option<Owner> {
    let who = Owner::new(realm_kind, realm_id, String::new());
    let (owner, changed) = state.unpresent(&id, &who);
    if changed {
        broadcast(&app, &id, &owner);
    }
    owner
}

#[tauri::command]
pub fn terminal_claim_control(
    app: AppHandle,
    state: State<'_, ControlState>,
    id: String,
    realm_kind: String,
    realm_id: String,
    label: String,
) -> Owner {
    let (owner, changed) = state.claim(&id, Owner::new(realm_kind, realm_id, label));
    if changed {
        broadcast(&app, &id, &Some(owner.clone()));
    }
    owner
}

#[tauri::command]
pub fn terminal_control_owner(state: State<'_, ControlState>, id: String) -> Option<Owner> {
    state.owner_of(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(id: &str) -> Owner {
        Owner::new("window", id, id)
    }

    fn owns(s: &ControlState, id: &str, who: &Owner) -> bool {
        s.owner_of(id).is_some_and(|o| o.same(who))
    }

    #[test]
    fn first_presenter_wins_and_second_defers() {
        let s = ControlState::default();
        let (owner, changed) = s.present("t1", w("main"));
        assert!(owner.same(&w("main")) && changed);
        // A second presenter does NOT steal ownership (and doesn't change it).
        let (owner, changed) = s.present("t1", w("detached"));
        assert!(owner.same(&w("main")) && !changed);
        assert!(owns(&s, "t1", &w("main")));
        assert!(!owns(&s, "t1", &w("detached")));
    }

    #[test]
    fn claim_takes_over() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.present("t1", w("detached"));
        let (owner, changed) = s.claim("t1", w("detached"));
        assert!(owner.same(&w("detached")) && changed);
        assert!(owns(&s, "t1", &w("detached")));
        // Re-claiming by the same owner is a no-op change.
        assert!(!s.claim("t1", w("detached")).1);
    }

    #[test]
    fn owner_leaving_transfers_to_remaining_presenter() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.present("t1", w("detached"));
        // main owns; main leaves -> detached inherits.
        let (next, changed) = s.unpresent("t1", &w("main"));
        assert!(next.unwrap().same(&w("detached")) && changed);
        assert!(owns(&s, "t1", &w("detached")));
    }

    #[test]
    fn last_presenter_leaving_clears_owner() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        let (owner, changed) = s.unpresent("t1", &w("main"));
        assert!(owner.is_none() && changed);
        assert!(s.owner_of("t1").is_none());
    }

    #[test]
    fn non_owner_leaving_keeps_owner() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.present("t1", w("detached"));
        // detached (non-owner) leaves -> main still owns, no change.
        let (owner, changed) = s.unpresent("t1", &w("detached"));
        assert!(owner.unwrap().same(&w("main")) && !changed);
        assert!(owns(&s, "t1", &w("main")));
    }

    #[test]
    fn drop_surface_reports_only_owner_changes() {
        let s = ControlState::default();
        s.present("a", w("main"));
        s.present("a", w("detached"));
        s.present("b", w("detached")); // detached owns b (sole presenter)
                                       // main owns a, detached owns b. Drop detached: a's owner unchanged,
                                       // b transfers to nobody.
        let mut changed = s.drop_surface(&w("detached"));
        changed.sort_by(|x, y| x.0.cmp(&y.0));
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].0, "b");
        assert!(changed[0].1.is_none());
        assert!(owns(&s, "a", &w("main")));
    }
}
