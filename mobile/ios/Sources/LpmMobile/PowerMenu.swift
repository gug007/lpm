import SwiftUI

/// Lock or Sleep in the Mac menu: lock its screen, put it to sleep now, or let
/// it sleep once its agents and automations finish. Sleep Now asks first, since
/// the Mac stops answering until something wakes it.
struct PowerMenu: View {
    @Environment(AppModel.self) private var model
    @Binding var confirmSleep: Bool

    private var store: PowerStore { model.power }

    var body: some View {
        if let state = store.state, state.offered {
            Menu {
                if state.canLock {
                    Button { store.lock() } label: {
                        Label("Lock Screen", systemImage: "lock")
                    }
                }
                if state.canSleep {
                    Button { confirmSleep = true } label: {
                        Label("Sleep Now", systemImage: "moon")
                    }
                    Button { store.sleepWhenIdle(!state.armed) } label: {
                        Text("Sleep When Agents Finish")
                        Text(state.armed ? "On · tap to cancel" : state.workingLine)
                        Image(systemName: state.armed ? "checkmark" : "moon.zzz")
                    }
                    .disabled(!state.armed && !state.working)
                }
            } label: {
                Label {
                    Text("Lock or Sleep")
                    if state.armed { Text("Sleeps when agents finish") }
                } icon: {
                    Image(systemName: state.armed ? "moon.zzz.fill" : "moon.zzz")
                }
            }
        }
    }
}

extension View {
    /// Asks before Sleep Now puts the Mac to sleep.
    func confirmsMacSleep(_ isPresented: Binding<Bool>, macName: String, model: AppModel) -> some View {
        confirmationDialog("Put \(macName) to sleep?", isPresented: isPresented, titleVisibility: .visible) {
            Button("Sleep Now") { model.power.sleepNow() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("lpm Link reconnects once it wakes.")
        }
    }
}
