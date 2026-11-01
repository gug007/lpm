import SwiftUI

/// Keep awake in the Mac's connection details: what holds it now and every way
/// to change it, as its own Keep awake menu offers.
struct KeepAwakeSection: View {
    @Environment(AppModel.self) private var model

    private var store: KeepAwakeStore { model.keepAwake }
    private var macName: String { model.activeRecord?.displayName ?? "your Mac" }

    var body: some View {
        if let state = store.state, state.supported {
            Section {
                if store.endsAt == nil {
                    status(state, at: .now)
                } else {
                    TimelineView(.periodic(from: .now, by: 1)) { context in status(state, at: context.date) }
                }
                choice(.off, "Off", state)
                choice(.agents, "While agents work", state)
                Menu {
                    ForEach(MacKeepAwake.presets, id: \.self) { minutes in
                        Button(MacKeepAwake.presetTitle(minutes)) { store.set(.timed, minutes: minutes) }
                    }
                } label: {
                    row("For a set time", checked: state.mode == .timed, trailing: "chevron.up.chevron.down")
                }
                NavigationLink {
                    KeepAwakeCustomTime()
                } label: {
                    Text("Custom time…").foregroundStyle(.primary)
                }
                choice(.always, "Until I turn it off", state)
                if let error = store.error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            } header: {
                Text("Keep awake")
            } footer: {
                Text(footer(state))
            }
        }
    }

    /// What holds the Mac now; it ticks only while a countdown runs.
    private func status(_ state: MacKeepAwake, at now: Date) -> some View {
        Label {
            Text(state.line(left: store.left(at: now), now: now)).monospacedDigit()
        } icon: {
            Image(systemName: state.isOn ? "cup.and.saucer.fill" : "cup.and.saucer")
                .foregroundStyle(state.mode == .off ? Color.secondary : Color.orange)
        }
    }

    private func choice(_ mode: MacKeepAwake.Mode, _ title: String, _ state: MacKeepAwake) -> some View {
        Button { store.set(mode) } label: {
            row(title, checked: state.mode == mode)
        }
        .accessibilityAddTraits(state.mode == mode ? .isSelected : [])
    }

    private func row(_ title: String, checked: Bool, trailing: String? = nil) -> some View {
        HStack {
            Text(title).foregroundStyle(.primary)
            Spacer()
            if checked {
                Image(systemName: "checkmark").foregroundStyle(Color.accentColor).fontWeight(.semibold)
            } else if let trailing {
                Image(systemName: trailing).font(.footnote).foregroundStyle(.tertiary)
            }
        }
        .contentShape(Rectangle())
    }

    private func footer(_ state: MacKeepAwake) -> String {
        let lid = "Closing a laptop's lid still puts it to sleep."
        if let note = state.powerNote(macName: macName) { return "\(note) \(lid)" }
        if state.mode == .agents {
            return "Counts every agent on \(macName) that is working or waiting for an answer. \(lid)"
        }
        return lid
    }
}
