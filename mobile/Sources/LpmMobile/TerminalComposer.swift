import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// The terminal input composer: prompt tabs, an attachment chips row, a multiline
/// compose field, AI rewrite (sparkles) and Send (with a long-press menu), over a
/// row of special keys the soft keyboard can't produce.
///
/// Send routes through `model.submit` → the web view, which wraps the body as a
/// bracketed paste (matching the desktop) so multi-line prompts paste into an agent
/// like Claude Code instead of submitting early. All draft state lives in the
/// per-terminal `ComposerStore`, retained by AppModel, so it survives leaving and
/// re-entering the terminal.
struct TerminalComposer: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var store: ComposerStore

    @State private var showPhotoPicker = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var showHistory = false
    @State private var showActions = false
    @State private var dupSeed: DupSeed?
    @State private var sendWarning: String?
    @State private var pendingLog: PendingLog?
    @FocusState private var focused: Bool

    private var termId: String { store.termId }
    private var project: String { store.project }
    private var label: String { store.label }

    // Matches the terminal ground (true black) so the composer reads as part of the
    // terminal rather than a separate light bar.
    private let ground = SwiftUI.Color.black

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    // MARK: slash autocomplete

    // A "/" at the very start, with no space typed yet, is a slash-command being
    // composed; the token after "/" filters the menu.
    private var slashQuery: String? {
        let text = store.text
        guard text.hasPrefix("/"), !text.contains(" "), !text.contains("\n") else { return nil }
        return String(text.dropFirst())
    }
    private var slashMatches: [SlashCommand] {
        guard let q = slashQuery else { return [] }
        let all = model.slashCommands[termId] ?? []
        guard !q.isEmpty else { return all }
        return all.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }
    /// After a fully-typed "/command " (single trailing space), the ghost hint to
    /// draw dimmed after the caret.
    private var slashArgumentHint: String? {
        let text = store.text
        guard text.hasPrefix("/"), text.hasSuffix(" "), !text.contains("\n") else { return nil }
        let name = String(text.dropFirst().dropLast())
        guard !name.isEmpty, !name.contains(" "), text == "/\(name) " else { return nil }
        guard let cmd = (model.slashCommands[termId] ?? []).first(where: { $0.name == name }),
              !cmd.argumentHint.isEmpty else { return nil }
        return cmd.argumentHint
    }

    // MARK: @-mentions

    // The "@fragment" being typed at the end of the field. The "@" must follow
    // whitespace or the start; the fragment holds no spaces. Mirrors the desktop
    // MENTION_TRIGGER, anchored to the caret == end.
    private var mentionQuery: String? {
        let text = store.text
        guard let at = text.lastIndex(of: "@") else { return nil }
        if at > text.startIndex, !text[text.index(before: at)].isWhitespace { return nil }
        let frag = text[text.index(after: at)...]
        if frag.contains(where: { $0.isWhitespace || $0 == "@" }) { return nil }
        return String(frag)
    }
    private var mentionActive: Bool { mentionQuery != nil }
    private var changedMentions: [MentionEntry] {
        filteredMentions.filter { $0.changed }
    }
    private var fileMentions: [MentionEntry] {
        filteredMentions.filter { !$0.changed }
    }
    private var filteredMentions: [MentionEntry] {
        guard let q = mentionQuery else { return [] }
        let all = model.mentions[project] ?? []
        let hits = q.isEmpty ? all : all.filter { $0.path.localizedCaseInsensitiveContains(q) }
        return Array(hits.prefix(50))
    }
    // Branches only surface once a fragment is typed (desktop behavior).
    private var branchMentions: [GitBranch] {
        guard let q = mentionQuery, !q.isEmpty else { return [] }
        let all = model.gitBranches[project] ?? []
        return Array(all.filter { $0.name.localizedCaseInsensitiveContains(q) }.prefix(20))
    }
    private var serviceMentions: [ServiceInfo] {
        guard let q = mentionQuery else { return [] }
        let all = (model.services[project] ?? []).filter { $0.running && $0.paneIndex != nil }
        return q.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }
    private var hasMentionContent: Bool {
        !changedMentions.isEmpty || !fileMentions.isEmpty || !branchMentions.isEmpty
            || !serviceMentions.isEmpty || mentionActive
    }

    private var sendState: ComposerStore.SendState { store.sendState() }
    private var canSend: Bool {
        switch sendState {
        case .ready, .droppedFailures: return !store.transforming
        case .pending, .empty: return false
        }
    }

    private func key(_ seq: String) { model.input(termId, seq) }

    var body: some View {
        VStack(spacing: 0) {
            if store.transforming {
                transformLockBar
                Divider().opacity(0.5)
            } else if !slashMatches.isEmpty {
                SlashMenu(commands: slashMatches, pick: pick)
                Divider().opacity(0.5)
            } else if mentionActive && hasMentionContent {
                ComposerMentionMenu(
                    changed: changedMentions, files: fileMentions,
                    branches: branchMentions, services: serviceMentions,
                    pickPath: pickPath, pickBranch: pickBranch,
                    pickTerminalOutput: pickTerminalOutput, pickServiceLog: pickServiceLog)
                Divider().opacity(0.5)
            }
            ComposerTabStrip(store: store)
            ComposerAttachments(store: store)
            SpecialKeyBar(key: key, onPaste: pasteClipboard)
            Divider().opacity(0.5)
            inputRow
        }
        .background(ground)
        .environment(\.colorScheme, .dark)
        .animation(.easeOut(duration: 0.12), value: slashMatches.count)
        .animation(.easeOut(duration: 0.12), value: hasMentionContent)
        .animation(.easeOut(duration: 0.15), value: store.transforming)
        .onAppear {
            model.loadSlash(termId, project: project)
            model.loadMentions(project)
            model.loadComposerActions()
            model.loadServices(project)
            model.loadGitBranches(project)
        }
        .onChange(of: photoItems) { _, items in if !items.isEmpty { loadPhotos(items) } }
        .onChange(of: model.serviceLogsResult) { _, _ in flushPendingLog() }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems,
                      maxSelectionCount: 10, matching: .images, photoLibrary: .shared())
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { for u in urls { store.addFile(u) } }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in store.addImage(image) }.ignoresSafeArea()
        }
        .sheet(isPresented: $showHistory) {
            HistoryScreen(project: project,
                          onLoad: { text in store.text = text; focused = true },
                          onSendNow: { text in sendRaw(text) })
                .environmentObject(model)
        }
        .sheet(isPresented: $showActions) {
            ComposerActionsSheet(store: store).environmentObject(model)
        }
        .sheet(isPresented: $store.showVariants, onDismiss: { store.variantsSheetDismissed() }) {
            ComposerVariantsSheet(store: store)
        }
        .sheet(item: $dupSeed) { seed in
            if let proj = model.projects.first(where: { $0.name == project }) {
                DuplicateOptionsView(project: proj, defaults: model.duplicateDefaults,
                                     seedPrompt: seed.prompt, seedCount: max(1, seed.count - 1)) { options in
                    model.duplicateProject(proj, options: options)
                    // The current terminal is copy #1: run the same prompt here.
                    sendRaw(seed.prompt)
                }
            }
        }
        .alert("Heads up", isPresented: Binding(
            get: { sendWarning != nil }, set: { if !$0 { sendWarning = nil } })) {
            Button("OK", role: .cancel) { sendWarning = nil }
        } message: { Text(sendWarning ?? "") }
        .alert("Rewrite failed", isPresented: Binding(
            get: { store.transformError != nil }, set: { if !$0 { store.transformError = nil } })) {
            Button("OK", role: .cancel) { store.transformError = nil }
        } message: { Text(store.transformError ?? "") }
    }

    // MARK: input row

    private var inputRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            plusMenu
            Button { showActions = true } label: {
                Image(systemName: "sparkles")
                    .font(.system(size: 22))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(canRewrite ? SwiftUI.Color.accentColor : SwiftUI.Color.secondary)
                    .frame(width: 30, height: 38)
            }
            .disabled(!canRewrite)

            field

            sendButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var plusMenu: some View {
        Menu {
            Button { showPhotoPicker = true } label: {
                Label("Photo Library", systemImage: "photo.on.rectangle")
            }
            if cameraAvailable {
                Button { showCamera = true } label: { Label("Take Photo", systemImage: "camera") }
            }
            Button { showFiles = true } label: { Label("Choose Files", systemImage: "doc") }
            if UIPasteboard.general.hasImages {
                Button { if let img = UIPasteboard.general.image { store.addImage(img) } } label: {
                    Label("Paste Image", systemImage: "doc.on.clipboard")
                }
            }
            Divider()
            Button { store.newTab() } label: { Label("New prompt", systemImage: "plus.bubble") }
            Button { showHistory = true } label: { Label("History", systemImage: "clock.arrow.circlepath") }
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 28))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 38)
        }
        .disabled(store.transforming)
    }

    private var field: some View {
        ZStack(alignment: .topLeading) {
            if let hint = slashArgumentHint {
                (Text(store.text).foregroundColor(.clear) + Text(hint).foregroundColor(.secondary.opacity(0.7)))
                    .font(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .allowsHitTesting(false)
            }
            TextField("Message", text: store.textBinding, axis: .vertical)
                .font(.body)
                .lineLimit(1...5)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .disabled(store.transforming)
        }
        .background(SwiftUI.Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            if store.transforming {
                ShimmerBorder().clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
    }

    private var sendButton: some View {
        Menu {
            Button {
                let text = store.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty {
                    model.historySaveDraft(message: store.text, project: project, id: termId, label: label)
                    sendWarning = "Saved to your drafts."
                }
            } label: { Label("Save as draft", systemImage: "tray.and.arrow.down") }

            Menu {
                ForEach(2...10, id: \.self) { n in
                    Button("\(n) copies") { dupSeed = DupSeed(count: n, prompt: store.text) }
                }
            } label: { Label("Run in duplicates", systemImage: "plus.square.on.square") }
                .disabled(store.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } label: {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 32))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(canSend ? SwiftUI.Color.accentColor : SwiftUI.Color.secondary)
        } primaryAction: {
            send()
        }
        .disabled(!canSend && !isSendMenuUseful)
    }

    // The menu (save draft / duplicates) is still worth offering even when there's
    // nothing to send yet — but only if there's text to act on.
    private var isSendMenuUseful: Bool {
        !store.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !store.transforming
    }
    private var canRewrite: Bool {
        !store.transforming && !store.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var transformLockBar: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text("Rewriting your prompt…")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
            Spacer()
            Button("Cancel") { store.cancelTransform() }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SwiftUI.Color.accentColor)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: actions

    private func send() {
        switch sendState {
        case .empty:
            return
        case .pending:
            sendWarning = "Still uploading an attachment — try again in a moment."
        case .ready(let body):
            deliver(body)
        case .droppedFailures(let body):
            sendWarning = "Some attachments failed to upload and were left out."
            deliver(body)
        }
    }

    /// Deliver a composed body and reset the active tab (closing it if others exist).
    private func deliver(_ body: String) {
        model.submit(termId, body)
        if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            model.recordHistory(project: project, id: termId, label: label, text: body)
        }
        store.afterSend()
    }

    /// Send a piece of text straight into the terminal without touching the active
    /// tab (used by "Send now" from history and the duplicate flow's current copy).
    private func sendRaw(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        model.submit(termId, text)
        model.recordHistory(project: project, id: termId, label: label, text: text)
    }

    private func pick(_ cmd: SlashCommand) {
        store.text = "/\(cmd.name) "
        focused = true
    }
    private func pickPath(_ path: String) {
        replaceMention(with: "@\(path) ")
    }
    private func pickBranch(_ branch: String) {
        replaceMention(with: "@\(branch) ")
    }
    private func replaceMention(with replacement: String) {
        guard let at = store.text.lastIndex(of: "@") else { return }
        store.text = String(store.text[..<at]) + replacement
        focused = true
    }
    private func stripMentionFragment() {
        guard let at = store.text.lastIndex(of: "@") else { return }
        store.text = String(store.text[..<at])
    }
    private func pickTerminalOutput() {
        stripMentionFragment()
        model.captureTerminalOutput(termId, lines: 200) { text in
            injectBlock(label: "Terminal output", content: text)
        }
    }
    private func pickServiceLog(_ service: ServiceInfo) {
        guard let pane = service.paneIndex else { return }
        stripMentionFragment()
        let key = model.serviceLogsKey(project, pane)
        pendingLog = PendingLog(key: key, label: "\(service.name) logs")
        model.fetchServiceLogs(project, paneIndex: pane, lines: 200)
    }
    /// A service-logs reply may have landed for the pending mention; inject it.
    private func flushPendingLog() {
        guard let pending = pendingLog, let text = model.serviceLogsResult[pending.key] else { return }
        injectBlock(label: pending.label, content: text)
        model.consumeServiceLogs(pending.key)
        pendingLog = nil
    }
    private func injectBlock(label: String, content: String) {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let block = "\n\n\(label):\n```\n\(trimmed)\n```\n"
        store.appendText(block, spaced: false)
        focused = true
    }

    private func pasteClipboard() {
        if let s = UIPasteboard.general.string, !s.isEmpty {
            store.appendText(s)
            focused = true
        }
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) {
        for item in items {
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run { store.addImage(image) }
                }
            }
        }
        photoItems = []
    }
}

/// Seed for the "Run in N duplicates" flow: the prompt to run and the total copy
/// count (the current terminal is copy #1, so the sheet gets count − 1).
private struct DupSeed: Identifiable {
    let id = UUID()
    let count: Int
    let prompt: String
}

/// A service-logs mention awaiting its reply, so the composer can inject it inline
/// when it arrives.
private struct PendingLog: Equatable {
    let key: String
    let label: String
}

/// An animated gradient border sweeping around the input while a rewrite runs.
private struct ShimmerBorder: View {
    @State private var angle = 0.0

    var body: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(
                AngularGradient(
                    colors: [SwiftUI.Color.accentColor.opacity(0.1), SwiftUI.Color.accentColor,
                             SwiftUI.Color.accentColor.opacity(0.1)],
                    center: .center, angle: .degrees(angle)),
                lineWidth: 2)
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { angle = 360 }
            }
    }
}

/// A camera capture sheet (UIImagePickerController — SwiftUI has no native camera
/// picker). Feeds the captured image straight into the composer's attachments.
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

/// Grouped @-mention autocomplete, ordered like the desktop: working-tree changes,
/// then files/dirs, then git branches (once a fragment is typed), then context
/// sources — this terminal's output and per-service logs, which inject inline.
private struct ComposerMentionMenu: View {
    let changed: [MentionEntry]
    let files: [MentionEntry]
    let branches: [GitBranch]
    let services: [ServiceInfo]
    let pickPath: (String) -> Void
    let pickBranch: (String) -> Void
    let pickTerminalOutput: () -> Void
    let pickServiceLog: (ServiceInfo) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if !changed.isEmpty {
                    header("Changes")
                    ForEach(changed) { e in pathRow(e) }
                }
                if !files.isEmpty {
                    header("Files")
                    ForEach(files) { e in pathRow(e) }
                }
                if !branches.isEmpty {
                    header("Branches")
                    ForEach(branches) { b in branchRow(b) }
                }
                header("Context")
                contextRow(icon: "terminal", title: "This terminal's output",
                           subtitle: "Insert recent output", action: pickTerminalOutput)
                ForEach(services) { s in
                    contextRow(icon: "square.stack.3d.up", title: "\(s.name) logs",
                               subtitle: "Insert recent logs", action: { pickServiceLog(s) })
                }
            }
        }
        .frame(maxHeight: 260)
    }

    private func header(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.tertiary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    @ViewBuilder private func pathRow(_ e: MentionEntry) -> some View {
        Button { pickPath(e.path) } label: {
            HStack(spacing: 10) {
                Image(systemName: e.dir ? "folder" : "doc.text")
                    .font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
                Text(e.path)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(.primary).lineLimit(1).truncationMode(.head)
                Spacer(minLength: 8)
                if e.changed {
                    Text("changed").font(.system(size: 11, weight: .semibold)).foregroundStyle(.orange)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().opacity(0.4)
    }

    @ViewBuilder private func branchRow(_ b: GitBranch) -> some View {
        Button { pickBranch(b.name) } label: {
            HStack(spacing: 10) {
                Image(systemName: b.isRemote ? "arrow.triangle.branch" : "arrow.branch")
                    .font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
                Text(b.name)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundStyle(.primary).lineLimit(1).truncationMode(.head)
                Spacer(minLength: 8)
                if b.isRemote {
                    Text(b.remote).font(.system(size: 11)).foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 9).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().opacity(0.4)
    }

    @ViewBuilder private func contextRow(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13)).foregroundStyle(SwiftUI.Color.accentColor).frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14)).foregroundStyle(.primary).lineLimit(1)
                    Text(subtitle).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 16).padding(.vertical, 8).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Divider().opacity(0.4)
    }
}

/// Horizontally scrolling row of control keys plus a clipboard Paste key. Each key
/// sends its raw escape/control sequence to the terminal immediately — independent
/// of the compose field — so Ctrl-C, Esc, and arrow navigation work without
/// composing a message. Paste inserts the clipboard string into the field.
private struct SpecialKeyBar: View {
    let key: (String) -> Void
    let onPaste: () -> Void

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
                Divider().frame(height: 18)
                arrow("doc.on.clipboard", action: onPaste)
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

    private func arrow(_ systemName: String, action: @escaping () -> Void) -> some View {
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
