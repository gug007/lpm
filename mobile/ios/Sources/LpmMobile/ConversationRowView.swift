import SwiftUI

/// One row of an agent's conversation.
struct ConversationRowView: View {
    let source: AnswerSource
    let row: ConversationRow
    /// The agent is at work or waiting: a call without its result is going on now.
    let live: Bool
    let onOpenPath: (String) -> Void

    var body: some View {
        switch row {
        case .lookups(let items):
            ConversationLookups(source: source, items: items, live: live, onOpenPath: onOpenPath)
        case .item(let item):
            switch item.kind {
            case .prompt(let text, let images): ConversationPrompt(text: text, images: images)
            case .text(let text): ConversationAnswer(text: text).equatable()
            case .tool(let tool):
                ConversationToolRow(source: source, item: item, tool: tool, live: live, onOpenPath: onOpenPath)
            case .notice(let text): ConversationNotice(text: text)
            }
        }
    }
}

/// What the agent said. Equatable, so the Markdown isn't parsed again each time
/// another entry changes.
private struct ConversationAnswer: View, Equatable {
    let text: String

    var body: some View { MarkdownText(text) }
}

/// What the person asked. A long one stops at a screenful until it's opened.
private struct ConversationPrompt: View {
    let text: String
    let images: Int
    @State private var expanded = false

    private static let foldedLines = 12
    /// Lines of text, by its line breaks and by how many a narrow screen wraps it to.
    private var isLong: Bool {
        text.count > 480 || text.split(separator: "\n", omittingEmptySubsequences: false).count > Self.foldedLines
    }

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .leading, spacing: 6) {
                if !text.isEmpty {
                    Text(text)
                        .font(.callout)
                        .lineLimit(expanded || !isLong ? nil : Self.foldedLines)
                        .textSelection(.enabled)
                }
                if images > 0 {
                    Label(images == 1 ? "1 image" : "\(images) images", systemImage: "photo")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if isLong {
                    Button(expanded ? "Show Less" : "Show More") { expanded.toggle() }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .accessibilityElement(children: .combine)
    }
}

/// A prompt sent from here that the transcript doesn't have yet.
struct ConversationPendingPrompt: View {
    let text: String
    /// The agent is at work, and takes it when it gets to it.
    let queued: Bool

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ConversationPrompt(text: text, images: 0).opacity(0.6)
            Text(queued ? "Queued" : "Sending…")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.trailing, 6)
        }
    }
}

private struct ConversationNotice: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
    }
}
