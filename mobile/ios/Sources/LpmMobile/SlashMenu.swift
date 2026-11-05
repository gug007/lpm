import SwiftUI

/// Slash-command autocomplete list, shown above the input while the user is typing
/// a "/command". The user's lpm commands lead, under a heading per folder and
/// list; the agent's own follow under its name. Tapping a row picks it.
struct SlashMenu: View {
    let commands: [SlashCommand]
    let agentLabel: String
    let pick: (SlashCommand) -> Void
    // Opens the Commands screen; shown as the menu's last row when given.
    let onManage: (() -> Void)?
    var maxHeight: CGFloat = 220

    // The rows' own height: the list takes that much (up to `maxHeight`) from the
    // terminal above while it's open, rather than splitting the space with it and
    // leaving a row or two in view.
    @State private var contentHeight: CGFloat = 0

    private var grouped: Bool { commands.contains { $0.isLpm } }

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
                if !cmd.argumentHint.isEmpty {
                    Text(cmd.argumentHint)
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 8)
                if !cmd.description.isEmpty {
                    Text(cmd.description)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .frame(maxWidth: 180, alignment: .trailing)
                }
                if let source = cmd.sourceLabel {
                    Text(source.uppercased())
                        .font(.system(size: 9, weight: .medium))
                        .kerning(0.6)
                        .foregroundStyle(.tertiary)
                        .fixedSize()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The heading the row at `index` starts, if it starts a group.
    private func heading(at index: Int) -> String? {
        guard grouped else { return nil }
        let group = groupOf(commands[index])
        return index == 0 || groupOf(commands[index - 1]) != group ? group : nil
    }

    private func groupOf(_ cmd: SlashCommand) -> String {
        guard cmd.isLpm else { return agentLabel }
        return "\(cmd.folder ?? "No folder") · \((cmd.scope ?? .global).menuLabel)"
    }
}

extension Array where Element == SlashCommand {
    /// The rows a typed fragment keeps, like the desktop's filter: a name (or an
    /// lpm command's folder) starting with it first, then a name or description
    /// holding it. Rows stay together under their heading, and the heading holding
    /// the best match leads; lpm commands come first here, so they win a tie.
    func matching(_ fragment: String) -> [SlashCommand] {
        let q = fragment.lowercased()
        guard !q.isEmpty else { return self }
        var starts: [SlashCommand] = []
        var contains: [SlashCommand] = []
        for c in self {
            let name = c.name.lowercased()
            if name.hasPrefix(q) || c.folder?.lowercased().hasPrefix(q) == true {
                starts.append(c)
            } else if name.contains(q) || c.description.lowercased().contains(q) {
                contains.append(c)
            }
        }
        var keys: [String] = []
        var groups: [String: [SlashCommand]] = [:]
        for c in starts + contains {
            let key = c.isLpm ? "\(c.scope?.rawValue ?? ""):\(c.folder ?? "")" : ""
            if groups[key] == nil { keys.append(key) }
            groups[key, default: []].append(c)
        }
        return keys.flatMap { groups[$0] ?? [] }
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
