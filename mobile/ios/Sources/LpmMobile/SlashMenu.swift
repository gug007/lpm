import SwiftUI

/// Slash-command autocomplete list, shown above the input while the user is typing
/// a "/command". A lone "/" leads with the commands run most, whoever made them,
/// then lists every other one A–Z. Tapping a row picks it.
struct SlashMenu: View {
    let commands: [SlashCommand]
    let pick: (SlashCommand) -> Void
    // Opens the Commands screen; shown as the menu's last row when given.
    let onManage: (() -> Void)?
    var maxHeight: CGFloat = 220

    // The rows' own height: the list takes that much (up to `maxHeight`) from the
    // terminal above while it's open, rather than splitting the space with it and
    // leaving a row or two in view.
    @State private var contentHeight: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, cmd in
                        if let heading = heading(at: index) {
                            MenuSectionHeading(heading)
                        }
                        row(cmd)
                        Divider().opacity(0.4)
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            }
            .frame(height: min(contentHeight, maxHeight))
            if let onManage {
                Divider().opacity(0.5)
                Button(action: onManage) {
                    HStack(spacing: 8) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 12))
                        Text("Manage skills")
                            .font(.system(size: 13))
                        Spacer()
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 7)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func row(_ cmd: SlashCommand) -> some View {
        Button { pick(cmd) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("/\(cmd.name)")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(cmd.isLpm ? accentCyan : .primary)
                    .lineLimit(1)
                    .layoutPriority(2)
                Text(cmd.description)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                if let tag = cmd.tag {
                    Text(tag)
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .layoutPriority(1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The heading the row at `index` starts: Most used over the rows it marks, and
    /// All over the rest. Nothing while typing, or before anything has run.
    private func heading(at index: Int) -> String? {
        guard commands.first?.mostUsed == true else { return nil }
        if index == 0 { return "Most used" }
        guard commands[index - 1].mostUsed, !commands[index].mostUsed else { return nil }
        return "All \(commands.count - index)"
    }
}

extension SlashCommand {
    private var sortName: String { name.lowercased() }

    /// How well the row matches a typed fragment, best first; nil when it doesn't.
    fileprivate func matchRank(_ q: String) -> Int? {
        let n = sortName
        if n == q { return 0 }
        if n.hasPrefix(q) { return 1 }
        if n.split(whereSeparator: { "-:_".contains($0) }).contains(where: { $0.hasPrefix(q) }) { return 2 }
        if folder?.lowercased().hasPrefix(q) == true { return 3 }
        if n.contains(q) { return 4 }
        return description.lowercased().contains(q) ? 5 : nil
    }

    fileprivate static func byUse(_ a: SlashCommand, _ b: SlashCommand) -> Bool {
        if a.recentRuns != b.recentRuns { return a.recentRuns > b.recentRuns }
        if a.lastRunAt != b.lastRunAt { return a.lastRunAt > b.lastRunAt }
        return a.sortName < b.sortName
    }

    fileprivate static func byName(_ a: SlashCommand, _ b: SlashCommand) -> Bool {
        a.sortName < b.sortName
    }
}

extension Array where Element == SlashCommand {
    private static var mostUsedRows: Int { 5 }

    /// What a lone "/" lists, like the desktop's menu: the commands run most in the
    /// last 30 days, then every other one A–Z, so nothing depends on who made it.
    private var browseOrder: [SlashCommand] {
        let top = filter { $0.recentRuns > 0 }.sorted(by: SlashCommand.byUse).prefix(Self.mostUsedRows)
        let topIds = Set(top.map(\.id))
        let rest = filter { !topIds.contains($0.id) }.sorted(by: SlashCommand.byName)
        return top.map { row in
            var row = row
            row.mostUsed = true
            return row
        } + rest
    }

    /// The rows a typed fragment keeps, like the desktop's filter: best match first,
    /// and among equal matches the one run most. A lone "/" keeps every row.
    func matching(_ fragment: String) -> [SlashCommand] {
        let q = fragment.lowercased()
        guard !q.isEmpty else { return browseOrder }
        return compactMap { c in c.matchRank(q).map { (c, $0) } }
            .sorted { a, b in
                if a.1 != b.1 { return a.1 < b.1 }
                if a.0.recentRuns != b.0.recentRuns { return a.0.recentRuns > b.0.recentRuns }
                return SlashCommand.byName(a.0, b.0)
            }
            .map(\.0)
    }
}

/// What the `/` menu calls an agent CLI's own commands.
func agentCommandsLabel(_ cli: String) -> String {
    switch cli {
    case "claude": return "Claude Code"
    case "codex": return "Codex"
    case "gemini": return "Gemini"
    case "opencode": return "OpenCode"
    default: return "Agent commands"
    }
}
