import SwiftUI

/// One lpm command in a list: `/name` in lpm's accent over what it does.
struct CommandRow: View {
    let command: LpmCommand

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("/\(command.name)")
                    .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                    .foregroundStyle(accentCyan)
                if !command.argumentHint.isEmpty {
                    Text(command.argumentHint)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                if let runs = command.runsLabel() {
                    Spacer(minLength: 8)
                    Text(runs)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .layoutPriority(1)
                }
            }
            if !command.summary.isEmpty {
                Text(command.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }
}
