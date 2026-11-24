import SwiftUI

/// One thing the agent did, on a line that opens to what it was given and what
/// came back.
struct ConversationToolRow: View {
    @Environment(AppModel.self) private var model
    let source: AnswerSource
    let item: ConversationItem
    let tool: ConversationTool
    let live: Bool
    /// Inside an opened run of reads and searches, which is the box around it.
    var nested = false
    let onOpenPath: (String) -> Void

    var body: some View {
        ConversationStepBox(state: tool.state, running: tool.state == .running && live, spoken: spoken,
                            nested: nested) { expanded in
            words
                .lineLimit(expanded ? nil : 1)
                .truncationMode(.tail)
            if let added = tool.added, let removed = tool.removed {
                DiffStat(added: added, removed: removed)
                    .font(.footnote)
                    .monospacedDigit()
                    .layoutPriority(1)
            }
        } detail: {
            ConversationToolDetail(detail: model.conversations.detail(source, item),
                                   path: tool.path, onOpenPath: onOpenPath)
                // Once more when the call ends: it has more to show then.
                .task(id: tool.state) { await model.conversations.loadDetail(source, item) }
        }
    }

    private var words: Text {
        var text = Text(tool.verb).foregroundStyle(.secondary)
        if !tool.subject.isEmpty {
            text = text + Text(" ") + Text(tool.subject)
                .font(tool.code ? .system(.footnote, design: .monospaced) : .footnote)
        }
        if !tool.note.isEmpty {
            text = text + Text(" · \(tool.note)")
                .foregroundStyle(tool.state == .failed ? Color.red : Color.secondary)
        }
        return text.font(.footnote)
    }

    private var spoken: String {
        let changes = tool.added.flatMap { added in
            tool.removed.map { "\(added) added, \($0) removed" }
        }
        return [tool.subject.isEmpty ? tool.verb : "\(tool.verb) \(tool.subject)", tool.note.isEmpty ? nil : tool.note,
                changes]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

/// A run of reads and searches on one line, opening to each of them.
struct ConversationLookups: View {
    let source: AnswerSource
    let items: [ConversationItem]
    let live: Bool
    let onOpenPath: (String) -> Void

    private var failed: Bool { items.contains { $0.tool?.state == .failed } }
    private var running: Bool { live && items.last?.tool?.state == .running }
    private var label: String { lookupsLabel(items, live: live) }

    var body: some View {
        ConversationStepBox(state: failed ? .failed : .done, running: running, spoken: label) { _ in
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        } detail: {
            ForEach(items) { item in
                if let tool = item.tool {
                    ConversationToolRow(source: source, item: item, tool: tool, live: live, nested: true,
                                        onOpenPath: onOpenPath)
                }
            }
        }
    }
}

/// A line that opens to more below it, in a box unless it's inside another's.
private struct ConversationStepBox<Line: View, Detail: View>: View {
    let state: ConversationTool.State
    let running: Bool
    let spoken: String
    var nested = false
    @ViewBuilder let line: (_ expanded: Bool) -> Line
    @ViewBuilder let detail: () -> Detail
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { expanded.toggle() } label: {
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    ConversationDot(state: state, running: running)
                    line(expanded)
                    Spacer(minLength: 4)
                    ConversationChevron(expanded: expanded)
                }
                .frame(minHeight: 24)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spoken)
            .accessibilityValue(expanded ? "Expanded" : "Collapsed")
            if expanded { detail() }
        }
        .padding(.horizontal, nested ? 0 : 10)
        .padding(.vertical, nested ? 2 : 7)
        .background(Color.white.opacity(nested ? 0 : 0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

/// How a call went: the desktop's blue while it runs, then green or red.
private struct ConversationDot: View {
    let state: ConversationTool.State
    let running: Bool

    private var color: Color {
        if running { return .blue }
        switch state {
        case .failed: return .red
        case .done: return .green
        // Left without its result by an agent no longer at it.
        case .running: return .secondary
        }
    }

    var body: some View {
        Image(systemName: "circle.fill")
            .font(.system(size: 7))
            .foregroundStyle(color)
            .symbolEffect(.pulse, isActive: running)
            .accessibilityHidden(true)
    }
}

private struct ConversationChevron: View {
    let expanded: Bool

    var body: some View {
        Image(systemName: "chevron.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 90 : 0))
            .accessibilityHidden(true)
    }
}

/// What an opened call shows: what it was given, what came back, and its file.
private struct ConversationToolDetail: View {
    let detail: ConversationDetail?
    let path: String
    let onOpenPath: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch detail {
            case .loading, nil:
                ProgressView().controlSize(.small)
            case .failed(let error):
                Text(error).font(.footnote).foregroundStyle(.red)
            case .parts(let parts):
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    ConversationPartView(part: part)
                }
                if parts.isEmpty, path.isEmpty {
                    Text("Nothing more to show.").font(.footnote).foregroundStyle(.secondary)
                }
            }
            if !path.isEmpty {
                Button { onOpenPath(path) } label: {
                    Label("Open File", systemImage: "doc.text")
                }
                .font(.footnote.weight(.semibold))
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .tint(.white)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
