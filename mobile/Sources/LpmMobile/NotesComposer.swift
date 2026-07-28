import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The note composer pinned under a chat transcript: a growing field, an attach
/// menu (Photos / Camera / Files), chips for what is queued, and Send.
///
/// Attachments ride inline with the note, so their bytes are prepared here —
/// images downscaled and JPEG-encoded off the main thread, files read off it — and
/// anything over the link's per-file ceiling is refused before it is sent.
struct NotesComposer: View {
    @Environment(AppModel.self) private var model

    let project: String
    let chatId: String

    @State private var text = ""
    @State private var pending: [PendingNoteAttachment] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var warning: String?

    private var notes: NotesStore { model.notes }
    private var chatKey: String { notes.key(project, chatId) }
    private var isSending: Bool { notes.sending.contains(chatKey) }
    private var isEncoding: Bool { pending.contains { $0.data == nil } }
    private var hasContent: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pending.isEmpty
    }
    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        VStack(spacing: 0) {
            Divider().opacity(0.5)
            if !pending.isEmpty { chips }
            HStack(alignment: .bottom, spacing: 8) {
                attachMenu
                field
                sendButton
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.bar)
        .onChange(of: photoItems) { _, items in if !items.isEmpty { loadPhotos(items) } }
        .onChange(of: isSending) { wasSending, sending in
            // Hold the text until the Mac accepts it, so a failed send doesn't
            // swallow what the user wrote.
            guard wasSending, !sending, notes.sendError[chatKey] == nil else { return }
            text = ""
            pending = []
        }
        .photosPicker(isPresented: $showPhotos, selection: $photoItems,
                      maxSelectionCount: 10, matching: .images, photoLibrary: .shared())
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { addFiles(urls) }
        }
        .sheet(isPresented: $showCamera) {
            NoteCameraPicker { image in encodeOffMain(reserve(name: "photo.jpg", mimeType: "image/jpeg"), image: image) }
                .ignoresSafeArea()
        }
        .alert("Too large", isPresented: Binding(
            get: { warning != nil }, set: { if !$0 { warning = nil } })) {
            Button("OK", role: .cancel) { warning = nil }
        } message: {
            Text(warning ?? "")
        }
    }

    // MARK: pieces

    private var attachMenu: some View {
        Menu {
            Button { showPhotos = true } label: {
                Label("Photo Library", systemImage: "photo.on.rectangle")
            }
            if cameraAvailable {
                Button { showCamera = true } label: { Label("Take Photo", systemImage: "camera") }
            }
            Button { showFiles = true } label: { Label("Choose Files", systemImage: "doc") }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
        }
    }

    private var field: some View {
        TextField("Write a note…", text: $text, axis: .vertical)
            .font(.body)
            .lineLimit(1...6)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var sendButton: some View {
        Button(action: send) {
            if isSending {
                ProgressView().controlSize(.small).frame(width: 34, height: 34)
            } else {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 27))
                    .foregroundStyle(hasContent ? SwiftUI.Color.accentColor : SwiftUI.Color.secondary.opacity(0.5))
                    .frame(width: 34, height: 34)
            }
        }
        .buttonStyle(.plain)
        .disabled(!hasContent || isSending || isEncoding)
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(pending) { item in
                    NotePendingChip(item: item) { drop(item.id) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    // MARK: actions

    private func send() {
        let drafts = pending.compactMap { item -> NoteAttachmentDraft? in
            guard let data = item.data else { return nil }
            return NoteAttachmentDraft(name: item.name, mimeType: item.mimeType, data: data)
        }
        guard hasContent else { return }
        Haptics.tap()
        notes.addNote(project, chatId: chatId, text: text, attachments: drafts)
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) {
        // Reserve the chips up front so a multi-photo pick keeps its selection
        // order, however the loads below finish.
        let ids = items.map { _ in reserve(name: "photo.jpg", mimeType: "image/jpeg") }
        for (item, id) in zip(items, ids) {
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                let image = data.flatMap { UIImage(data: $0) }
                await MainActor.run {
                    guard let image else { drop(id); return }
                    encodeOffMain(id, image: image)
                }
            }
        }
        photoItems = []
    }

    private func addFiles(_ urls: [URL]) {
        for url in urls {
            let name = url.lastPathComponent
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let id = reserve(name: name, mimeType: mime)
            DispatchQueue.global(qos: .userInitiated).async {
                let scoped = url.startAccessingSecurityScopedResource()
                let data = try? Data(contentsOf: url)
                if scoped { url.stopAccessingSecurityScopedResource() }
                DispatchQueue.main.async {
                    guard let data else { drop(id); return }
                    guard data.count <= NoteAttachmentStore.byteLimit else { refuse(id); return }
                    fill(id, data: data, thumbnail: nil)
                }
            }
        }
    }

    private func encodeOffMain(_ id: UUID, image: UIImage) {
        DispatchQueue.global(qos: .userInitiated).async {
            let encoded = encodeNoteImage(image)
            DispatchQueue.main.async {
                guard let encoded else { drop(id); return }
                guard encoded.data.count <= NoteAttachmentStore.byteLimit else { refuse(id); return }
                fill(id, data: encoded.data, thumbnail: encoded.thumbnail)
            }
        }
    }

    // MARK: chip bookkeeping

    private func reserve(name: String, mimeType: String) -> UUID {
        let item = PendingNoteAttachment(name: name, mimeType: mimeType)
        pending.append(item)
        return item.id
    }

    private func fill(_ id: UUID, data: Data, thumbnail: UIImage?) {
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[index].data = data
        pending[index].thumbnail = thumbnail
    }

    private func drop(_ id: UUID) {
        pending.removeAll { $0.id == id }
    }

    private func refuse(_ id: UUID) {
        drop(id)
        Haptics.error()
        warning = "That file is too large to send from your phone. Add it from your Mac instead."
    }
}

/// A file queued for the next note. Bytes stay in memory until the note is sent.
private struct PendingNoteAttachment: Identifiable {
    let id = UUID()
    let name: String
    let mimeType: String
    var data: Data?
    var thumbnail: UIImage?
}

private struct NotePendingChip: View {
    let item: PendingNoteAttachment
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            HStack(spacing: 8) {
                thumbnail
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if item.data == nil {
                        Text("Preparing…").font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .frame(width: 150, height: 54)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 17))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(SwiftUI.Color.white, SwiftUI.Color.black.opacity(0.55))
            }
            .buttonStyle(.plain)
            .offset(x: 5, y: -5)
        }
    }

    @ViewBuilder private var thumbnail: some View {
        if let image = item.thumbnail {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else if item.data == nil {
            ProgressView().controlSize(.small).frame(width: 36, height: 36)
        } else {
            Image(systemName: "doc.fill")
                .font(.system(size: 18))
                .foregroundStyle(.secondary)
                .frame(width: 36, height: 36)
        }
    }
}

/// A camera capture sheet (SwiftUI has no native camera picker), feeding the shot
/// straight into the queued attachments.
private struct NoteCameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: NoteCameraPicker
        init(_ parent: NoteCameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// Downscale + JPEG-encode + build a thumbnail — pure CPU work, run off the main
/// thread. Mirrors the terminal composer's upload encoding.
private func encodeNoteImage(_ image: UIImage) -> (data: Data, thumbnail: UIImage)? {
    guard let data = image.downscaledForUpload(maxDimension: 2048)
        .jpegData(compressionQuality: 0.7) else { return nil }
    return (data, image.downscaledForUpload(maxDimension: 240))
}
