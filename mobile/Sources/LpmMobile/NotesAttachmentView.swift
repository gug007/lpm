import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// One attachment under a note: an inline thumbnail for images (tap for a
/// full-screen viewer), a glyph + name + size row for everything else, and a share
/// action once the bytes are here.
///
/// Bytes come from the store's hash-keyed cache, which fetches at most once per
/// file per session and refuses anything over the link's ceiling without asking —
/// that refusal is shown in place of a spinner that would never finish.
struct NotesAttachmentView: View {
    @Environment(AppModel.self) private var model

    let project: String
    let attachment: NoteAttachment

    @State private var viewing = false

    private var store: NoteAttachmentStore { model.notes.attachments }
    private var bytes: Data? { store.data(attachment.hash) }
    private var image: UIImage? { isImage ? bytes.flatMap { UIImage(data: $0) } : nil }
    private var isImage: Bool { attachment.mimeType.hasPrefix("image/") }
    private var tooLarge: Bool { attachment.size > NoteAttachmentStore.byteLimit }
    private var isLoading: Bool { store.loading.contains(attachment.hash) }
    private var failure: String? { store.error[attachment.hash] }
    private var file: NoteFileItem? {
        bytes.map { NoteFileItem(name: attachment.name, data: $0) }
    }

    var body: some View {
        content
            .task {
                // An image is shown inline, so it is worth pulling up front; an
                // over-cap file is "fetched" only so the store answers with why it
                // can't be.
                if isImage || tooLarge {
                    store.fetch(project: project, hash: attachment.hash, size: attachment.size)
                }
            }
            .sheet(isPresented: $viewing) {
                NoteAttachmentViewer(name: attachment.name, image: image, file: file)
            }
    }

    @ViewBuilder private var content: some View {
        if let failure {
            card {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.name)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(failure).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        } else if let image {
            Button { viewing = true } label: {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 240, maxHeight: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
        } else {
            card {
                Image(systemName: isImage ? "photo" : "doc.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.name)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(Self.sizeText(attachment.size))
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                trailing
            }
        }
    }

    @ViewBuilder private var trailing: some View {
        if isLoading {
            ProgressView().controlSize(.small)
        } else if let file {
            ShareLink(item: file, preview: SharePreview(attachment.name)) {
                Image(systemName: "square.and.arrow.up").font(.system(size: 15))
            }
            .buttonStyle(.plain)
        } else {
            Button {
                store.fetch(project: project, hash: attachment.hash, size: attachment.size)
            } label: {
                Image(systemName: "arrow.down.circle").font(.system(size: 17))
            }
            .buttonStyle(.plain)
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        HStack(spacing: 10) { content() }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: 260, alignment: .leading)
            .background(Color(.tertiarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private static let sizeFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter()
        f.countStyle = .file
        return f
    }()

    private static func sizeText(_ bytes: Int) -> String {
        sizeFormatter.string(fromByteCount: Int64(bytes))
    }
}

/// The full-screen image viewer, presented as a sheet, so it declares its own
/// NavigationStack and takes a dismiss.
private struct NoteAttachmentViewer: View {
    @Environment(\.dismiss) private var dismiss

    let name: String
    let image: UIImage?
    let file: NoteFileItem?

    var body: some View {
        NavigationStack {
            ZStack {
                SwiftUI.Color.black.ignoresSafeArea()
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .padding()
                } else {
                    ContentUnavailableView("Can't preview this file", systemImage: "doc",
                                           description: Text("Share it to open it in another app."))
                }
            }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let file {
                    ToolbarItem(placement: .topBarLeading) {
                        ShareLink(item: file, preview: SharePreview(name)) {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// An attachment handed to the share sheet straight from memory — the plaintext
/// never touches the phone's disk on its way there.
struct NoteFileItem: Transferable {
    let name: String
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .data) { $0.data }
            .suggestedFileName { $0.name }
    }
}
