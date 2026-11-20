import SwiftUI

/// Refresh for a popup or an app: a spinner while a page on show is being made
/// again, off when asking again can't help.
struct ActionPageRefreshButton: View {
    let state: ActionPopupState
    let reload: () -> Void

    var body: some View {
        Button(action: reload) {
            if state.inFlight && state.content != nil {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "arrow.clockwise")
            }
        }
        .accessibilityLabel("Refresh")
        .disabled(!state.canReload)
    }
}
