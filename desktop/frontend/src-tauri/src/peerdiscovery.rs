// Nearby-Mac discovery for the Connect Macs pane.
//
// Owns a single mDNS browse for other Macs' peer host servers and re-emits the
// current list as the `peer-discovery` app event on every change. Start/stop are
// refcounted so several panes (Settings + search) can share one browse without
// tearing it down while another is still open. Self is filtered out by host id,
// and — in a release build — other dev instances are dropped (a dev + prod app on
// one Mac shouldn't offer to pair with each other).
use crate::mdns::{self, DiscoveredPeer};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

static REFS: Mutex<u32> = Mutex::new(0);

/// Begin (or join) browsing for nearby Macs. Idempotent: only the first caller
/// starts the browse. Non-blocking — the mDNS layer runs the receiver on its own
/// thread.
#[tauri::command]
pub fn peer_discovery_start(app: AppHandle, hub: State<'_, crate::peer::PeerHub>) {
    {
        let mut refs = REFS.lock().unwrap();
        *refs += 1;
        if *refs > 1 {
            return; // already browsing
        }
    }
    let self_id = hub.inner().host_id();
    mdns::start_browse(move |list| {
        let filtered: Vec<DiscoveredPeer> = list
            .into_iter()
            .filter(|p| p.id != self_id)
            .filter(|p| cfg!(debug_assertions) || !p.dev)
            .collect();
        let _ = app.emit("peer-discovery", &filtered);
    });
}

/// Release one hold on discovery; the browse stops once the last pane leaves.
#[tauri::command]
pub fn peer_discovery_stop() {
    let mut refs = REFS.lock().unwrap();
    if *refs > 0 {
        *refs -= 1;
    }
    if *refs == 0 {
        mdns::stop_browse();
    }
}
