import SwiftUI
import PhotosUI
import UIKit

/// The terminal input composer: a multiline compose field + Send, over a row of
/// special keys a soft keyboard can't produce (Esc, Tab, Ctrl-C, Enter, arrows).
///
/// Send routes through `model.submit` → the web view, which wraps the body as a
/// bracketed paste (matching the desktop) so multi-line prompts paste into an
/// agent like Claude Code instead of submitting early. Special keys send their
/// raw control sequence straight to the PTY.
struct TerminalComposer: View {
    @EnvironmentObject var model: AppModel
    let termId: String
    let project: String
    let label: String

    @State private var text = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var showHistory = false
    @State private var uploading = false
    @FocusState private var focused: Bool

    // Matches the terminal ground (true black) so the composer reads as part of the
    // terminal rather than a separate light bar.
    private let ground = SwiftUI.Color.black

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    // A "/" at the very start, with no space typed yet, is a slash-command being
    // composed; the token after "/" filters the menu.
    private var slashQuery: String? {
        guard text.hasPrefix("/"), !text.contains(" "), !text.contains("\n") else { return nil }
        return String(text.dropFirst())
    }
    private var slashMatches: [SlashCommand] {
        guard let q = slashQuery else { return [] }
        let all = model.slashCommands[termId] ?? []
        guard !q.isEmpty else { return all }
        return all.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    // The "@fragment" being typed at the end of the field (mid-line is fine, but
    // the "@" must follow whitespace or the start, and the fragment holds no
    // spaces). Mirrors the desktop MENTION_TRIGGER, anchored to the caret == end.
    private var mentionQuery: String? {
        guard let at = text.lastIndex(of: "@") else { return nil }
        if at > text.startIndex, !text[text.index(before: at)].isWhitespace { return nil }
        let frag = text[text.index(after: at)...]
        if frag.contains(where: { $0.isWhitespace || $0 == "@" }) { return nil }
        return String(frag)
    }
    private var mentionMatches: [MentionEntry] {
        guard let q = mentionQuery else { return [] }
        let all = model.mentions[project] ?? []
        let hits = q.isEmpty ? all : all.filter { $0.path.localizedCaseInsensitiveContains(q) }
        return Array(hits.prefix(50))
    }

    private func key(_ seq: String) { model.input(termId, seq) }

    private func send() {
        let t = text
        text = ""
        model.submit(termId, t)
        if !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            model.recordHistory(project: project, id: termId, label: label, text: t)
        }
    }

    private func pick(_ cmd: SlashCommand) {
        // Insert "/name " so the user can type any arguments; the trailing space
        // closes the menu.
        text = "/\(cmd.name) "
        focused = true
    }

    private func pickMention(_ entry: MentionEntry) {
        // Replace the trailing "@fragment" with "@path " (the agent resolves it).
        guard let at = text.lastIndex(of: "@") else { return }
        text = text[..<at] + "@\(entry.path) "
        focused = true
    }

    var body: some View {
        VStack(spacing: 0) {
            if !slashMatches.isEmpty {
                SlashMenu(commands: slashMatches, pick: pick)
                Divider().opacity(0.5)
            } else if !mentionMatches.isEmpty {
                MentionMenu(entries: mentionMatches, pick: pickMention)
                Divider().opacity(0.5)
            }
            SpecialKeyBar(key: key)
            Divider().opacity(0.5)
            HStack(alignment: .bottom, spacing: 8) {
                Menu {
                    Button { showPhotoPicker = true } label: {
                        Label("Photo Library", systemImage: "photo.on.rectangle")
                    }
                    if cameraAvailable {
                        Button { showCamera = true } label: { Label("Take Photo", systemImage: "camera") }
                    }
                    Button { model.loadHistory(project); showHistory = true } label: {
                        Label("History", systemImage: "clock.arrow.circlepath")
                    }
                } label: {
                    Group {
                        if uploading {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 28))
                                .symbolRenderingMode(.hierarchical)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(width: 32, height: 38)
                }
                .disabled(uploading)

                TextField("Message", text: $text, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($focused)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(SwiftUI.Color.white.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(trimmed.isEmpty ? SwiftUI.Color.secondary : SwiftUI.Color.accentColor)
                }
                .disabled(trimmed.isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(ground)
        .environment(\.colorScheme, .dark)
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images, photoLibrary: .shared())
        .animation(.easeOut(duration: 0.12), value: slashMatches.count)
        .animation(.easeOut(duration: 0.12), value: mentionMatches.count)
        .onAppear {
            model.loadSlash(termId, project: project)
            model.loadMentions(project)
        }
        .onChange(of: photoItem) { _, item in if let item { loadAndSend(item) } }
        .onChange(of: model.pendingImagePath[termId]) { _, path in
            guard let path, !path.isEmpty else { return }
            if !text.isEmpty && !text.hasSuffix(" ") { text += " " }
            text += path + " "
            model.pendingImagePath[termId] = nil
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in sendImage(image) }
                .ignoresSafeArea()
        }
        .sheet(isPresented: $showHistory) {
            HistoryView(rows: model.history[project] ?? []) { row in
                text = row.text
                showHistory = false
                focused = true
            }
        }
    }

    /// Downscale + JPEG-compress an image and send it to the Mac; the path comes
    /// back via `pendingImagePath` and is inserted into the field.
    private func sendImage(_ image: UIImage) {
        guard let jpeg = image.downscaled(maxDimension: 2048).jpegData(compressionQuality: 0.7) else { return }
        model.uploadImage(termId, jpeg.base64EncodedString(), mime: "image/jpeg")
    }

    private func loadAndSend(_ item: PhotosPickerItem) {
        uploading = true
        Task {
            let data = try? await item.loadTransferable(type: Data.self)
            await MainActor.run {
                if let data, let image = UIImage(data: data) { sendImage(image) }
                uploading = false
                photoItem = nil
            }
        }
    }
}

/// A camera capture sheet (UIImagePickerController — SwiftUI has no native camera
/// picker). Reuses the same upload path as the photo library.
private struct CameraPicker: UIViewControllerRepresentable {
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
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

private extension UIImage {
    /// Shrink so the longest side is at most `maxDimension`, keeping aspect ratio;
    /// returns self when already small enough. Keeps upload payloads small.
    func downscaled(maxDimension: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return self }
        let scale = maxDimension / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

/// Slash-command autocomplete list, shown above the input while the user is typing
/// a "/command". Tapping a row fills the command into the field.
private struct SlashMenu: View {
    let commands: [SlashCommand]
    let pick: (SlashCommand) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(commands) { cmd in
                    Button { pick(cmd) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("/\(cmd.name)")
                                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.primary)
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
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().opacity(0.4)
                }
            }
        }
        .frame(maxHeight: 220)
    }
}

/// Recall sheet: recent prompts sent in this project (newest first). Tapping one
/// loads it back into the composer to edit or re-send.
private struct HistoryView: View {
    let rows: [HistoryRow]
    let pick: (HistoryRow) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [HistoryRow] {
        guard !query.isEmpty else { return rows }
        return rows.filter { $0.text.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if rows.isEmpty {
                    ContentUnavailableView("No history", systemImage: "clock",
                                           description: Text("Prompts you send appear here."))
                } else {
                    List(filtered) { row in
                        Button { pick(row) } label: {
                            Text(row.text)
                                .font(.system(size: 15))
                                .foregroundStyle(.primary)
                                .lineLimit(3)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .listStyle(.plain)
                    .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// @-mention autocomplete: project files/dirs, with git-changed ones badged.
private struct MentionMenu: View {
    let entries: [MentionEntry]
    let pick: (MentionEntry) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(entries) { e in
                    Button { pick(e) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: e.dir ? "folder" : "doc.text")
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                                .frame(width: 18)
                            Text(e.path)
                                .font(.system(size: 14, design: .monospaced))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                                .truncationMode(.head)
                            Spacer(minLength: 8)
                            if e.changed {
                                Text("changed")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(.orange)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Divider().opacity(0.4)
                }
            }
        }
        .frame(maxHeight: 220)
    }
}

/// Horizontally scrolling row of control keys. Each sends its raw escape/control
/// sequence to the terminal immediately — independent of the compose field, so
/// Ctrl-C, Esc, and arrow navigation work without composing a message.
private struct SpecialKeyBar: View {
    let key: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                cap("esc") { key("\u{1b}") }
                cap("tab") { key("\t") }
                cap("⌃C") { key("\u{03}") }
                cap("⏎") { key("\r") }
                Divider().frame(height: 18)
                arrow("chevron.up") { key("\u{1b}[A") }
                arrow("chevron.down") { key("\u{1b}[B") }
                arrow("chevron.left") { key("\u{1b}[D") }
                arrow("chevron.right") { key("\u{1b}[C") }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    private func cap(_ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .frame(minWidth: 34)
                .padding(.vertical, 7)
                .padding(.horizontal, 9)
                .background(Color(.tertiarySystemFill))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }

    private func arrow(_ systemName: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 38, height: 32)
                .background(Color(.tertiarySystemFill))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}
