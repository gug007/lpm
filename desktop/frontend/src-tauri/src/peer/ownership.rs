// A paired Mac as a control surface on this host.
//
// One PTY has one geometry, so only the surface that owns a terminal drives its
// size. A paired Mac reports what its windows show through `ctl`; this module
// applies that, tells the Mac who holds each terminal it shows, and refuses its
// resizes while something else holds one, so a window here that still owns the
// terminal keeps rendering it at the size it set.

use super::{send_to_device, terminal_alive, PeerHub};
use crate::control::{ControlState, Owner};
use serde_json::json;
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Manager};

const KIND: &str = "peer";

/// The control surface a peer connection presents on the host, so host windows
/// show the "Take control" placeholder while the peer drives. A distinct owner
/// kind ("peer") that never collides with "window"/"mobile".
pub(super) fn owner(hub: &PeerHub, device_id: &str) -> Owner {
    Owner::new(KIND, device_id, hub.device_name(device_id))
}

fn is_device(owner: &Owner, device_id: &str) -> bool {
    owner.kind == KIND && owner.id == device_id
}

/// Apply a peer's `ctl` frame: the Mac reporting that one of its windows started
/// or stopped showing a terminal of ours, or took control of it. A change of
/// owner reaches the Mac with the broadcast; a present that defers changes none,
/// so the Mac is told who holds the terminal here.
pub(super) fn apply(
    hub: &PeerHub,
    app: &AppHandle,
    out: &SyncSender<String>,
    device_id: &str,
    id: &str,
    op: &str,
) {
    let state = app.state::<ControlState>();
    let who = owner(hub, device_id);
    let (owner, changed) = match op {
        "claim" if terminal_alive(app, id) => {
            crate::statusroute::used_from(device_id);
            let (owner, changed) = state.claim(id, who);
            (Some(owner), changed)
        }
        "present" if terminal_alive(app, id) => {
            let (owner, changed) = state.present(id, who);
            (Some(owner), changed)
        }
        "unpresent" => state.unpresent(id, &who),
        _ => return,
    };
    if changed {
        crate::control::broadcast(app, id, &owner);
    } else if op != "unpresent" {
        let _ = out.try_send(frame(id, device_id, &owner, &super::machine_name()));
    }
}

/// Tell every paired Mac showing terminal `id` who holds it now.
pub(crate) fn push_control(app: &AppHandle, id: &str, owner: &Option<Owner>) {
    if app.try_state::<PeerHub>().is_none() {
        return;
    }
    let host = super::machine_name();
    for p in app.state::<ControlState>().presenters_of(id) {
        if p.kind == KIND {
            send_to_device(app, &p.id, &frame(id, &p.id, owner, &host));
        }
    }
}

/// Whether paired Mac `device_id` may set terminal `id`'s size: it holds the
/// terminal, or nothing does.
pub(super) fn may_resize(app: &AppHandle, device_id: &str, id: &str) -> bool {
    app.state::<ControlState>()
        .owner_of(id)
        .is_none_or(|o| is_device(&o, device_id))
}

/// `{ t: "owner", id, elsewhere }` for paired Mac `device_id`: `elsewhere` names
/// the machine or phone holding the terminal, null when that Mac may drive it. A
/// window here is named by this machine, `host`.
fn frame(id: &str, device_id: &str, owner: &Option<Owner>, host: &str) -> String {
    let elsewhere = owner
        .as_ref()
        .filter(|o| !is_device(o, device_id))
        .map(|o| match o.kind.as_str() {
            "window" => host.to_string(),
            _ => o.label.clone(),
        });
    json!({ "t": "owner", "id": id, "elsewhere": elsewhere }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn elsewhere(owner: Option<Owner>) -> Value {
        let v: Value = serde_json::from_str(&frame("web-1", "mac-b", &owner, "Mac mini")).unwrap();
        assert_eq!(v["t"], "owner");
        assert_eq!(v["id"], "web-1");
        v["elsewhere"].clone()
    }

    #[test]
    fn a_mac_holding_the_terminal_may_drive_it() {
        assert_eq!(
            elsewhere(Some(Owner::new(KIND, "mac-b", "MacBook"))),
            Value::Null
        );
        assert_eq!(elsewhere(None), Value::Null);
    }

    #[test]
    fn a_window_here_is_named_by_this_machine() {
        let owner = Owner::new("window", "main", "Main window");
        assert_eq!(elsewhere(Some(owner)), "Mac mini");
    }

    #[test]
    fn a_phone_or_another_mac_is_named_by_its_own_name() {
        assert_eq!(
            elsewhere(Some(Owner::new("mobile", "p1", "iPhone"))),
            "iPhone"
        );
        assert_eq!(elsewhere(Some(Owner::new(KIND, "mac-c", "iMac"))), "iMac");
    }
}
