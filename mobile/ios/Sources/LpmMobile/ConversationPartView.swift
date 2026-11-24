import SwiftUI

/// What a tool call was given or returned, under its line. A long one stops at
/// `foldedLines` until it's opened, so it doesn't bury the conversation.
struct ConversationPartView: View {
    let part: ConversationPart
    @State private var expanded = false

    private static let foldedLines = 24

    private var lines: [String] { part.text.components(separatedBy: "\n") }
    private var folds: Bool { part.style != .markdown && lines.count > Self.foldedLines }
    private var shown: [String] { folds && !expanded ? Array(lines.prefix(Self.foldedLines)) : lines }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !part.label.isEmpty {
                Text(part.label)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            switch part.style {
            case .markdown:
                MarkdownText(part.text)
            case .code:
                Text(shown.joined(separator: "\n"))
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            case .diff:
                diff
            }
            if folds {
                Button(expanded ? "Show Less" : "Show All \(lines.count) Lines") { expanded.toggle() }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .buttonStyle(.plain)
            }
        }
    }

    private var diff: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, line in
                Text(line.isEmpty ? " " : line)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(line.hasPrefix("@@") ? Color.secondary : Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 1)
                    .background(tint(line))
            }
        }
        .padding(.vertical, 6)
        .background(Color.black.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .textSelection(.enabled)
    }

    private func tint(_ line: String) -> Color {
        if line.hasPrefix("+") { return .green.opacity(0.18) }
        if line.hasPrefix("-") { return .red.opacity(0.18) }
        return .clear
    }
}
