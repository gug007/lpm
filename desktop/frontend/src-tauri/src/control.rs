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
use tauri::{AppHandle, Emitter, Manager, State};

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

/// The surfaces showing one terminal here.
#[derive(Default)]
struct Shown {
    // Ordered with the OWNER at the front. So the owner is derivable
    // (`.first()`), and the ordering encodes the handoff: a leaving owner hands
    // off to the next presenter, and `claim` moves a surface to the front.
    presenters: Vec<Owner>,
    // For a terminal a paired machine hosts: the surface holding it there, or
    // on a phone or another Mac, while that isn't this Mac. It outranks every
    // presenter here until one of them claims.
    away: Option<Owner>,
}

impl Shown {
    fn owner(&self) -> Option<Owner> {
        let local = self.presenters.first()?;
        Some(self.away.as_ref().unwrap_or(local).clone())
    }
}

#[derive(Default)]
pub struct ControlState {
    // One map, one lock — nothing to keep in sync.
    terminals: Mutex<HashMap<String, Shown>>,
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
        self.terminals
            .lock()
            .unwrap()
            .get(id)
            .and_then(Shown::owner)
    }

    /// The surfaces showing a terminal, owner first.
    pub fn presenters_of(&self, id: &str) -> Vec<Owner> {
        self.terminals
            .lock()
            .unwrap()
            .get(id)
            .map(|t| t.presenters.clone())
            .unwrap_or_default()
    }

    // Every mutator returns `(new owner, owner_changed)` so callers broadcast the
    // cross-surface change only when it's real — a deferring present / no-op claim
    // / non-owner unpresent produces no broadcast.

    /// Mark a surface as presenting a terminal. First presenter wins (goes to the
    /// front); a later presenter joins at the back and the owner is unchanged.
    pub fn present(&self, id: &str, who: Owner) -> (Owner, bool) {
        let mut terminals = self.terminals.lock().unwrap();
        let shown = terminals.entry(id.to_string()).or_default();
        let old = shown.owner();
        if !shown.presenters.iter().any(|o| o.same(&who)) {
            shown.presenters.push(who.clone());
        }
        let new = shown.owner().unwrap_or(who);
        let changed = !owners_eq(&old, &Some(new.clone()));
        (new, changed)
    }

    /// Explicit takeover ("Take control"): move the surface to the front.
    pub fn claim(&self, id: &str, who: Owner) -> (Owner, bool) {
        let mut terminals = self.terminals.lock().unwrap();
        let shown = terminals.entry(id.to_string()).or_default();
        let changed = !shown.owner().is_some_and(|o| o.same(&who));
        shown.presenters.retain(|o| !o.same(&who));
        shown.presenters.insert(0, who.clone());
        shown.away = None;
        (who, changed)
    }

    /// Stop presenting a terminal. If the leaving surface was the owner (front),
    /// the next presenter inherits; otherwise the owner is unchanged.
    pub fn unpresent(&self, id: &str, who: &Owner) -> (Option<Owner>, bool) {
        let mut terminals = self.terminals.lock().unwrap();
        let Some(shown) = terminals.get_mut(id) else {
            return (None, false);
        };
        let old = shown.owner();
        shown.presenters.retain(|o| !o.same(who));
        let new = shown.owner();
        if shown.presenters.is_empty() {
            terminals.remove(id);
        }
        let changed = !owners_eq(&old, &new);
        (new, changed)
    }

    /// The paired machine hosting a terminal says which surface holds it: one
    /// that isn't this Mac (`Some`), or this Mac (`None`). A terminal no window
    /// here shows any more is left alone; presenting it again asks anew.
    pub fn hold_away(&self, id: &str, away: Option<Owner>) -> (Option<Owner>, bool) {
        let mut terminals = self.terminals.lock().unwrap();
        let Some(shown) = terminals.get_mut(id) else {
            return (None, false);
        };
        let old = shown.owner();
        shown.away = away;
        let new = shown.owner();
        let changed = !owners_eq(&old, &new);
        (new, changed)
    }

    /// Remove a surface from every terminal (window/phone closed). Returns the
    /// ids whose owner changed, with the new owner, so the caller broadcasts just
    /// those.
    pub fn drop_surface(&self, who: &Owner) -> Vec<(String, Option<Owner>)> {
        let ids: Vec<String> = self.terminals.lock().unwrap().keys().cloned().collect();
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
/// desktop webviews, `remote::push_control` fans out to any paired phones (a
/// no-op when the mobile server is disabled / has no clients), and
/// `peer::push_control` tells the paired Macs showing it.
pub fn broadcast(app: &AppHandle, id: &str, owner: &Option<Owner>) {
    let payload = serde_json::json!({ "id": id, "owner": owner_json(owner) });
    let _ = app.emit(EVENT_CHANGED, payload);
    crate::remote::push_control(app, id, owner);
    crate::peer::push_control(app, id, owner);
}

/// Apply what the paired machine hosting terminal `id` says about who holds it,
/// named `elsewhere` when that isn't this Mac.
pub fn note_away(app: &AppHandle, id: &str, elsewhere: Option<&str>) {
    let away = elsewhere.map(|name| Owner::new("away", name, name));
    let (owner, changed) = app.state::<ControlState>().hold_away(id, away);
    if changed {
        broadcast(app, id, &owner);
    }
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
    crate::peerclient::forward_control(&app, &id, "present");
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
    // The host sees this Mac as one surface, shown while any window here shows it.
    if owner.is_none() {
        crate::peerclient::forward_control(&app, &id, "unpresent");
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
    crate::peerclient::forward_control(&app, &id, "claim");
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

    fn away(name: &str) -> Owner {
        Owner::new("away", name, name)
    }

    #[test]
    fn a_holder_on_the_host_outranks_every_window_here() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.present("t1", w("detached"));
        let (owner, changed) = s.hold_away("t1", Some(away("Mac mini")));
        assert!(owner.unwrap().same(&away("Mac mini")) && changed);
        let (owner, changed) = s.present("t1", w("quick"));
        assert!(owner.same(&away("Mac mini")) && !changed);
    }

    #[test]
    fn claiming_here_takes_a_terminal_back_from_the_host() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.hold_away("t1", Some(away("Mac mini")));
        let (owner, changed) = s.claim("t1", w("main"));
        assert!(owner.same(&w("main")) && changed);
        assert!(owns(&s, "t1", &w("main")));
    }

    #[test]
    fn the_host_handing_control_back_restores_the_window_here() {
        let s = ControlState::default();
        s.present("t1", w("main"));
        s.hold_away("t1", Some(away("Mac mini")));
        let (owner, changed) = s.hold_away("t1", None);
        assert!(owner.unwrap().same(&w("main")) && changed);
    }

    #[test]
    fn a_holder_is_forgotten_once_nothing_here_shows_the_terminal() {
        let s = ControlState::default();
        assert!(matches!(
            s.hold_away("t1", Some(away("Mac mini"))),
            (None, false)
        ));
        s.present("t1", w("main"));
        s.hold_away("t1", Some(away("Mac mini")));
        let (owner, changed) = s.unpresent("t1", &w("main"));
        assert!(owner.is_none() && changed);
        let (owner, _) = s.present("t1", w("main"));
        assert!(owner.same(&w("main")));
    }
}
