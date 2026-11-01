import SwiftUI

/// Keep Awake in the Mac menu: the state now, and the quick choices. A custom
/// time lives in the connection details.
struct KeepAwakeMenu: View {
    @Environment(AppModel.self) private var model

    private var store: KeepAwakeStore { model.keepAwake }

    var body: some View {
        if let state = store.state, state.supported {
            Menu {
                Section(state.line(left: store.left(at: .now), now: .now)) {
                    choice("While Agents Work", checked: state.mode == .agents) { store.set(.agents) }
                    ForEach(MacKeepAwake.presets, id: \.self) { minutes in
                        Button(MacKeepAwake.presetTitle(minutes)) { store.set(.timed, minutes: minutes) }
                    }
                    choice("Until Turned Off", checked: state.mode == .always) { store.set(.always) }
                }
                choice("Off", checked: state.mode == .off) { store.set(.off) }
            } label: {
                Label {
                    Text("Keep Awake")
                    if let badge = state.badge(left: store.left(at: .now)) { Text(badge) }
                } icon: {
                    Image(systemName: state.isOn ? "cup.and.saucer.fill" : "cup.and.saucer")
                }
            }
        }
    }

    private func choice(_ title: String, checked: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            if checked {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }
}
