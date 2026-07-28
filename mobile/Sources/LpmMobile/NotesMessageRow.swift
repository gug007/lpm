import SwiftUI

/// One note in a chat transcript: its markdown body, attachments, timestamp and an
/// "edited" marker, with Edit / Copy / Delete behind a long press.
///
/// Every note is the user's own, so the bubble is trailing-aligned like a message
/// you sent. Equatable on a cheap value summary: the composer above re-renders on
/// every keystroke and must not drag the whole transcript with it.
struct NotesMessageRow: View, Equatable {
    let project: String
    let message: NoteMessage
    let timeText: String
    let busy: Bool
    let onEdit: () -> Void
    let onCopy: () -> Void
    let onDelete: () -> Void

    static func == (a: NotesMessageRow, b: NotesMessageRow) -> Bool {
        a.project == b.project
            && a.busy == b.busy
            && a.timeText == b.timeText
            && a.message.id == b.message.id
            && a.message.text == b.message.text
            && a.message.editedAt == b.message.editedAt
            && a.message.attachments?.map(\.hash) == b.message.attachments?.map(\.hash)
    }

    private var attachments: [NoteAttachment] { message.attachments ?? [] }

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .leading, spacing: 8) {
                if !message.text.isEmpty {
                    MarkdownText(message.text)
                        .font(.system(size: 15))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if !attachments.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(attachments) { attachment in
                            NotesAttachmentView(project: project, attachment: attachment)
                        }
                    }
                }
                footer
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(busy ? 0.5 : 1)
        }
        .contextMenu {
            Button(action: onEdit) { Label("Edit", systemImage: "pencil") }
            Button(action: onCopy) { Label("Copy", systemImage: "doc.on.doc") }
            Button(role: .destructive, action: onDelete) { Label("Delete", systemImage: "trash") }
        }
    }

    private var footer: some View {
        HStack(spacing: 5) {
            Spacer(minLength: 0)
            if busy { ProgressView().controlSize(.mini) }
            if message.editedAt != nil {
                Text("Edited")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            Text(timeText)
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
        }
    }
}
