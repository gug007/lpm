import SwiftUI

/// Keep the Mac awake for any number of hours and minutes, or until a time of day.
struct KeepAwakeCustomTime: View {
    private enum Kind { case span, until }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var kind = Kind.span
    @State private var hours = 1
    @State private var minutes = 30
    @State private var until = Self.defaultUntil()

    private var total: Int { hours * 60 + minutes }

    var body: some View {
        Form {
            Section {
                Picker("Keep awake", selection: $kind) {
                    Text("For").tag(Kind.span)
                    Text("Until").tag(Kind.until)
                }
                .pickerStyle(.segmented)
            }
            switch kind {
            case .span: spanSection
            case .until: untilSection
            }
            Section {
                Button("Keep Awake") {
                    model.keepAwake.set(.timed, minutes: kind == .span ? total : untilMinutes(from: .now))
                    dismiss()
                }
                .disabled(kind == .span && total < 1)
            }
        }
        .navigationTitle("Custom Time")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var spanSection: some View {
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
    }

    private var untilSection: some View {
        Section {
            DatePicker("Time", selection: $until, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
        } footer: {
            TimelineView(.everyMinute) { context in Text(untilFooter(at: context.date)) }
        }
    }

    private func untilEnd(from now: Date) -> Date {
        let picked = Calendar.current.dateComponents([.hour, .minute], from: until)
        return MacKeepAwake.nextTime(hour: picked.hour ?? 0, minute: picked.minute ?? 0, after: now)
    }

    private func untilMinutes(from now: Date) -> Int {
        MacKeepAwake.minutes(until: untilEnd(from: now), from: now)
    }

    private func untilFooter(at now: Date) -> String {
        let end = untilEnd(from: now)
        let time = end.formatted(date: .omitted, time: .shortened)
        return Calendar.current.isDate(end, inSameDayAs: now)
            ? "Stays awake until \(time) today, then sleeps on its usual schedule."
            : "Stays awake until \(time) tomorrow, then sleeps on its usual schedule."
    }

    /// Two hours from now, on the hour.
    private static func defaultUntil(now: Date = .now) -> Date {
        let calendar = Calendar.current
        let hour = (calendar.component(.hour, from: now) + 2) % 24
        return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now) ?? now
    }
}
