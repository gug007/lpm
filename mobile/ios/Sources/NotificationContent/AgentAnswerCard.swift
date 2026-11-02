import SwiftUI
import UserNotifications

/// The project and what happened, the agent's answer, and the files the turn
/// changed. An older Mac sends no answer, so the closing line it does send
/// stands in for it.
struct AgentAnswerCard: View {
    let title: String
    let line: String
    let answer: String
    let files: [AgentAnswerContent.File]
    let moreFiles: Int

    init(_ content: UNNotificationContent) {
        let detail = AgentAnswerContent(userInfo: content.userInfo)
        let summarized = !content.subtitle.isEmpty
        title = content.title
        line = summarized ? content.subtitle : content.body
        answer = detail.answer.isEmpty && summarized ? content.body : detail.answer
        files = detail.files
        moreFiles = detail.moreFiles
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .lineLimit(2)
                if !line.isEmpty {
                    Text(line)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            if !answer.isEmpty {
                MarkdownText(answer)
            }
            if !files.isEmpty {
                changedFiles
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var changedFiles: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(files, id: \.path) { ChangedFileRow(file: $0) }
            if moreFiles > 0 {
                Text(moreFiles == 1 ? "1 more file" : "\(moreFiles) more files")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
