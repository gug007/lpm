import SwiftUI

/// Keep the Mac awake for any number of hours and minutes.
struct KeepAwakeCustomTime: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var hours = 1
    @State private var minutes = 30

    private var total: Int { hours * 60 + minutes }

    var body: some View {
        Form {
            Section {
                HStack(spacing: 0) {
                    Picker("Hours", selection: $hours) {
                        ForEach(0..<100, id: \.self) { Text("\($0) h").tag($0) }
                    }
                    Picker("Minutes", selection: $minutes) {
                        ForEach(0..<60, id: \.self) { Text("\($0) min").tag($0) }
                    }
                }
                .pickerStyle(.wheel)
                .labelsHidden()
            } footer: {
                Text("Stays awake for \(MacKeepAwake.span(total)), then sleeps on its usual schedule.")
            }
            Section {
                Button("Keep Awake") {
                    model.keepAwake.set(.timed, minutes: total)
                    dismiss()
                }
                .disabled(total < 1)
            }
        }
        .navigationTitle("Custom Time")
        .navigationBarTitleDisplayMode(.inline)
    }
}
