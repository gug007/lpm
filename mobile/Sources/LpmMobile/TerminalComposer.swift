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
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var systemColorScheme
    @ObservedObject var store: ComposerStore
    private let onSend: ((String) -> Void)?
    private let terminalTools: Bool
    private let disabled: Bool
    private let placeholder: String
    /// The terminal theme background, so the composer ground matches the terminal
    /// it sits under (used only in terminal-tools mode).
    private let terminalBackground: SwiftUI.Color

    init(store: ComposerStore, onSend: ((String) -> Void)? = nil,
         terminalTools: Bool = true, disabled: Bool = false, placeholder: String = "Message",
         terminalBackground: SwiftUI.Color = .black) {
        _store = ObservedObject(wrappedValue: store)
        self.onSend = onSend
        self.terminalTools = terminalTools
        self.disabled = disabled
        self.placeholder = placeholder
        self.terminalBackground = terminalBackground
    }

    @State private var showPhotoPicker = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var showHistory = false
    @State private var showActions = false
    @State private var showRewriteHint = false
    @State private var dupSeed: DupSeed?
    @State private var sendWarning: String?
    @State private var pendingLog: PendingLog?
    // Memoized @-mention results: the expensive filter over the (unbounded) source
    // arrays runs once per mention-fragment change into these, instead of ~6× per
    // keystroke via the menu args / animation values.
    @State private var cachedMentionFiles: [MentionEntry] = []
    @State private var cachedBranches: [GitBranch] = []
    @State private var cachedServices: [ServiceInfo] = []
    // Pill wrap-detection and field sizing: measured pill width plus the probe's
    // text heights at both layout widths and the single-line reference.
    @State private var containerWidth: CGFloat = 0
    @State private var measuredTextHeight: CGFloat = 0
    @State private var expandedTextHeight: CGFloat = 0
    @State private var singleLineHeight: CGFloat = 0
    @FocusState private var focused: Bool

    private var termId: String { store.termId }
    private var project: String { store.project }
    private var label: String { store.label }

    private var ground: SwiftUI.Color {
        terminalTools ? terminalBackground : SwiftUI.Color(.systemGroupedBackground)
    }
    private var fieldGround: SwiftUI.Color {
        terminalTools ? SwiftUI.Color.white.opacity(0.08) : SwiftUI.Color(.secondarySystemGroupedBackground)
    }
    private var composerControlColor: SwiftUI.Color {
        terminalTools ? SwiftUI.Color.white : SwiftUI.Color.primary
    }

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    // MARK: slash autocomplete

    // A "/" at the very start, with no space typed yet, is a slash-command being
    // composed; the token after "/" filters the menu.
    private var slashQuery: String? {
        guard terminalTools else { return nil }
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
        guard terminalTools else { return nil }
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
    // Derived by partitioning the cached ≤50 result (cheap); source order preserved,
    // Changes before Files — same grouping/ordering as before.
    private var changedMentions: [MentionEntry] { cachedMentionFiles.filter { $0.changed } }
    private var fileMentions: [MentionEntry] { cachedMentionFiles.filter { !$0.changed } }
    private var hasMentionContent: Bool {
        !cachedMentionFiles.isEmpty || !cachedBranches.isEmpty || !cachedServices.isEmpty || (terminalTools && mentionActive)
    }

    /// Recompute the memoized mention results from the current fragment + sources.
    /// Runs on fragment change and when a source array loads — not per keystroke.
    private func recomputeMentions() {
        guard let q = mentionQuery else {
            cachedMentionFiles = []; cachedBranches = []; cachedServices = []
            return
        }
        let all = model.mentions[project] ?? []
        let hits = q.isEmpty ? all : all.filter { $0.path.localizedCaseInsensitiveContains(q) }
        cachedMentionFiles = Array(hits.prefix(50))
        // Branches only surface once a fragment is typed (desktop behavior).
        if q.isEmpty {
            cachedBranches = []
        } else {
            let allBranches = model.git.branches[project] ?? []
            cachedBranches = Array(allBranches.filter { $0.name.localizedCaseInsensitiveContains(q) }.prefix(20))
        }
        let running = (model.services[project] ?? []).filter { $0.running && $0.paneIndex != nil }
        cachedServices = q.isEmpty ? running : running.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    private var sendState: ComposerStore.SendState { store.sendState() }
    private var canSend: Bool {
        guard !disabled else { return false }
        switch sendState {
        case .ready, .droppedFailures: return !store.transforming
        case .pending, .empty: return false
        }
    }

    // Stable per-tab summaries for the (Equatable) strip. The active tab's preview
    // is blank so typing into it doesn't invalidate the strip every keystroke.
    private var tabStripItems: [TabStripItem] {
        store.tabs.enumerated().map { index, tab in
            TabStripItem(id: tab.id,
                         preview: index == store.activeIndex ? "" : tab.preview,
                         attachmentCount: tab.attachments.count)
        }
    }

    private func key(_ seq: String) { model.input(termId, seq) }

    var body: some View {
        composerStack
            .background(ground)
            .environment(\.colorScheme, terminalTools ? .dark : systemColorScheme)
            .animation(.easeOut(duration: 0.12), value: slashMatches.count)
            .animation(.easeOut(duration: 0.12), value: hasMentionContent)
            .animation(.easeOut(duration: 0.15), value: store.transforming)
            .onAppear {
                if terminalTools { model.loadSlash(termId, project: project) }
                model.loadMentions(project)
                model.loadComposerActions()
                model.loadServices(project)
                model.git.loadBranches(project)
            }
            .onChange(of: photoItems) { _, items in if !items.isEmpty { loadPhotos(items) } }
            .onChange(of: model.serviceLogsResult) { _, _ in flushPendingLog() }
            // Recompute memoized mentions on fragment change or a source load.
            .onChange(of: mentionQuery) { _, _ in recomputeMentions() }
            .onChange(of: mentionsCount) { _, _ in if mentionActive { recomputeMentions() } }
            .onChange(of: branchesCount) { _, _ in if mentionActive { recomputeMentions() } }
            .onChange(of: servicesCount) { _, _ in if mentionActive { recomputeMentions() } }
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
                    .environment(model)
            }
            .sheet(isPresented: $showActions) {
                ComposerActionsSheet(store: store).environment(model)
            }
            .sheet(isPresented: $store.showVariants, onDismiss: { store.variantsSheetDismissed() }) {
                ComposerVariantsSheet(store: store)
            }
            .sheet(item: $dupSeed) { seed in dupSheet(seed) }
            .modifier(ComposerAlerts(sendWarning: $sendWarning, transformError: $store.transformError))
    }

    @ViewBuilder private func dupSheet(_ seed: DupSeed) -> some View {
        if let proj = model.projects.first(where: { $0.name == project }) {
            DuplicateOptionsView(project: proj, defaults: model.duplicateDefaults,
                                 seedPrompt: seed.prompt, seedCount: max(1, seed.count - 1)) { options in
                model.duplicateProject(proj, options: options)
                // The current terminal is copy #1: run the same prompt here.
                sendRaw(seed.prompt)
            }
        }
    }

    @ViewBuilder private var composerStack: some View {
        VStack(spacing: 0) {
            if store.transforming {
                transformLockBar
                Divider().opacity(0.5)
            } else if !slashMatches.isEmpty {
                SlashMenu(commands: slashMatches, pick: pick)
                Divider().opacity(0.5)
            } else if mentionActive && hasMentionContent {
                ComposerMentionMenu(
                    project: project,
                    changed: changedMentions, files: fileMentions,
                    branches: cachedBranches, services: cachedServices,
                    pickPath: pickPath, pickBranch: pickBranch,
                    includeTerminalOutput: terminalTools,
                    pickTerminalOutput: pickTerminalOutput, pickServiceLog: pickServiceLog)
                Divider().opacity(0.5)
            }
            ComposerTabStrip(items: tabStripItems, activeIndex: store.activeIndex,
                             onSwitch: { store.switchTab($0) },
                             onClose: { store.closeTab($0) })
                .equatable()
            ComposerAttachments(attachments: store.attachments,
                                onRetry: { store.retryUpload($0) },
                                onRemove: { store.removeAttachment($0) })
                .equatable()
            if terminalTools {
                SpecialKeyBar(key: key, onPaste: pasteClipboard)
            }
            Divider().opacity(0.5)
            inputRow
        }
    }

    // Cheap Int change-proxies for the observed source dicts, so the mention
    // recompute hooks key off a simple property (not a subscript+coalesce expr).
    private var mentionsCount: Int { model.mentions[project]?.count ?? 0 }
    private var branchesCount: Int { model.git.branches[project]?.count ?? 0 }
    private var servicesCount: Int { model.services[project]?.count ?? 0 }

    // MARK: input row

    // ChatGPT-style single pill: while the prompt fits one line the controls sit
    // inline (plus · field · send); once it soft-wraps or contains a newline the
    // field spans the pill's full width with the controls dropped to a bottom row.
    private let composerCorner: CGFloat = 24

    private var inputRow: some View {
        unifiedField
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
    }

    // One layout for both states — the TextField and buttons are never swapped
    // between branches, so their structural identity is stable and focus (the
    // keyboard) survives the compact ↔ expanded flip. Only paddings animate:
    // compact reserves side gutters that the bottom-aligned button overlays sit in
    // (visually inline); expanded trades them for a reserved bottom row.
    private var unifiedField: some View {
        fieldStack
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, isExpanded ? 6 : 44)
            .padding(.top, isExpanded ? 4 : 0)
            .padding(.bottom, isExpanded ? 40 : 0)
            .overlay(alignment: .bottomLeading) {
                plusMenu
                    .padding(.leading, 6)
                    .padding(.bottom, isExpanded ? 2 : 1)
            }
            .overlay(alignment: .bottomTrailing) {
                sendButton
                    .padding(.trailing, 6)
                    .padding(.bottom, isExpanded ? 2 : 1)
            }
            .background(fieldGround)
            .clipShape(RoundedRectangle(cornerRadius: composerCorner, style: .continuous))
            .overlay {
                if store.transforming {
                    ShimmerBorder(cornerRadius: composerCorner)
                        .clipShape(RoundedRectangle(cornerRadius: composerCorner, style: .continuous))
                }
            }
            .background(widthReader)
            .background(measurementProbe)
            .animation(.easeOut(duration: 0.15), value: isExpanded)
    }

    // The wrap decision is made against a FIXED width — the compact field's text
    // width — so expanding (which widens the field) never re-narrows the input that
    // drove the decision, i.e. it can't oscillate at the boundary. A literal newline
    // is trivially multiline; otherwise the hidden probe reports the text height at
    // that fixed width and we compare it to a measured single-line height.
    private var isExpanded: Bool {
        if store.text.contains("\n") { return true }
        guard containerWidth > 0, singleLineHeight > 0 else { return false }
        return measuredTextHeight > singleLineHeight + 1
    }

    // Pill width minus the compact side gutters (44 each: edge inset + a 36pt
    // control + gap) and the field's own text insets — the width the field's text
    // actually gets in the compact layout.
    private var compactTextWidth: CGFloat {
        max(1, containerWidth - 88 - 16)
    }

    // Pill width minus the expanded horizontal padding (6 each side) and the
    // field's text insets — the text width in the expanded layout.
    private var expandedTextWidth: CGFloat {
        max(1, containerWidth - 12 - 16)
    }

    // The vertical-axis TextField (UITextView-backed) doesn't re-measure its
    // intrinsic height on a width-only change, so the flip would keep a stale
    // height until the next edit. The field height is therefore driven from the
    // probe: one line when compact, the expanded-width text height (probe-capped
    // at 5 lines) when expanded. 16 = vertical insets; +2 slack so a probe vs.
    // UITextView metric mismatch can't clip the last line.
    private var fieldHeight: CGFloat {
        let line = max(singleLineHeight, 20)
        let text = isExpanded ? max(expandedTextHeight, line) : line
        return ceil(text) + 16 + 2
    }

    // Probe stand-in for the field text: never empty, and a trailing newline gets
    // a trailing space so the caret's empty last line still counts toward height.
    private var probeString: String {
        if store.text.isEmpty { return " " }
        if store.text.hasSuffix("\n") { return store.text + " " }
        return store.text
    }

    private var widthReader: some View {
        GeometryReader { g in
            SwiftUI.Color.clear.preference(key: ComposerWidthKey.self, value: g.size.width)
        }
        .onPreferenceChange(ComposerWidthKey.self) { containerWidth = $0 }
    }

    // Off-screen text laid out at both layout widths (compact drives the wrap
    // decision, expanded drives the field height), plus a single-line reference.
    private var measurementProbe: some View {
        VStack {
            Text(probeString)
                .font(.body)
                .lineLimit(5)
                .frame(width: compactTextWidth, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { g in
                    SwiftUI.Color.clear.preference(key: ComposerTextHeightKey.self, value: g.size.height)
                })
            Text(probeString)
                .font(.body)
                .lineLimit(5)
                .frame(width: expandedTextWidth, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { g in
                    SwiftUI.Color.clear.preference(key: ComposerExpandedHeightKey.self, value: g.size.height)
                })
            Text("M")
                .font(.body)
                .background(GeometryReader { g in
                    SwiftUI.Color.clear.preference(key: ComposerLineHeightKey.self, value: g.size.height)
                })
        }
        .hidden()
        .onPreferenceChange(ComposerTextHeightKey.self) { measuredTextHeight = $0 }
        .onPreferenceChange(ComposerExpandedHeightKey.self) { expandedTextHeight = $0 }
        .onPreferenceChange(ComposerLineHeightKey.self) { singleLineHeight = $0 }
    }

    private var plusMenu: some View {
        Menu {
            Button {
                if canRewrite { showActions = true } else { showRewriteHint = true }
            } label: { Label("Rewrite with AI", systemImage: "sparkles") }
            Divider()
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
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(composerControlColor)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .disabled(store.transforming || disabled)
        .popover(isPresented: $showRewriteHint, arrowEdge: .bottom) {
            Text("Type a message first — then tap to rewrite it with AI.")
                .font(.footnote)
                .padding(12)
                .presentationCompactAdaptation(.popover)
                .preferredColorScheme(terminalTools ? .dark : systemColorScheme)
        }
    }

    private var fieldStack: some View {
        ZStack(alignment: .topLeading) {
            if let hint = slashArgumentHint {
                (Text(store.text).foregroundColor(.clear) + Text(hint).foregroundColor(.secondary.opacity(0.7)))
                    .font(.body)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 8)
                    .allowsHitTesting(false)
            }
            TextField(placeholder, text: store.textBinding, axis: .vertical)
                .font(.body)
                .lineLimit(1...5)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .disabled(store.transforming || disabled)
        }
        .frame(height: fieldHeight, alignment: .topLeading)
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

            if terminalTools {
                Menu {
                    ForEach(2...10, id: \.self) { n in
                        Button("\(n) copies") { dupSeed = DupSeed(count: n, prompt: store.text) }
                    }
                } label: { Label("Run in duplicates", systemImage: "plus.square.on.square") }
                    .disabled(store.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } label: {
            Image(systemName: "arrow.up")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(sendForeground)
                .frame(width: 32, height: 32)
                .background(sendGround)
                .clipShape(Circle())
                .frame(width: 36, height: 36)
        } primaryAction: {
            send()
        }
        .disabled(disabled || (!canSend && !isSendMenuUseful))
    }

    private var sendForeground: SwiftUI.Color {
        if terminalTools { return canSend ? SwiftUI.Color.black : SwiftUI.Color.white.opacity(0.35) }
        return canSend ? SwiftUI.Color.white : SwiftUI.Color.secondary.opacity(0.55)
    }

    private var sendGround: SwiftUI.Color {
        if terminalTools { return canSend ? SwiftUI.Color.white : SwiftUI.Color.white.opacity(0.12) }
        return canSend ? SwiftUI.Color.accentColor : SwiftUI.Color(.tertiarySystemFill)
    }

    // The menu (save draft / duplicates) is still worth offering even when there's
    // nothing to send yet — but only if there's text to act on.
    private var isSendMenuUseful: Bool {
        !disabled && !store.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !store.transforming
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
        Haptics.tap()
        if let onSend { onSend(body) }
        else { model.submit(termId, body) }
        if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            model.recordHistory(project: project, id: termId, label: label, text: body)
        }
        store.afterSend()
    }

    /// Send a piece of text straight into the terminal without touching the active
    /// tab (used by "Send now" from history and the duplicate flow's current copy).
    private func sendRaw(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if let onSend { onSend(text) }
        else { model.submit(termId, text) }
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
        // Reserve ordered placeholder chips on main so they keep selection order,
        // even though the loads/encodes below finish in arbitrary order.
        let ids = items.map { _ in store.reserveImagePlaceholder() }
        for (item, id) in zip(items, ids) {
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                await MainActor.run { store.fillImageUpload(id, data: data) }
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

/// The composer's two one-shot alerts, factored out of the body to keep its
/// modifier chain small enough for the Swift type-checker.
private struct ComposerAlerts: ViewModifier {
    @Binding var sendWarning: String?
    @Binding var transformError: String?

    func body(content: Content) -> some View {
        content
            .alert("Heads up", isPresented: Binding(
                get: { sendWarning != nil }, set: { if !$0 { sendWarning = nil } })) {
                Button("OK", role: .cancel) { sendWarning = nil }
            } message: { Text(sendWarning ?? "") }
            .alert("Rewrite failed", isPresented: Binding(
                get: { transformError != nil }, set: { if !$0 { transformError = nil } })) {
                Button("OK", role: .cancel) { transformError = nil }
            } message: { Text(transformError ?? "") }
    }
}

/// A service-logs mention awaiting its reply, so the composer can inject it inline
/// when it arrives.
private struct PendingLog: Equatable {
    let key: String
    let label: String
}

/// Layout measurements for the composer pill: its width, and the probe's text and
/// single-line heights — combined to decide the inline vs. stacked layout.
private struct ComposerWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
private struct ComposerTextHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
private struct ComposerExpandedHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
private struct ComposerLineHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// An animated gradient border sweeping around the input while a rewrite runs.
private struct ShimmerBorder: View {
    var cornerRadius: CGFloat = 20
    @State private var angle = 0.0

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
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
    @Environment(AppModel.self) private var model
    let project: String
    let changed: [MentionEntry]
    let files: [MentionEntry]
    let branches: [GitBranch]
    let services: [ServiceInfo]
    let pickPath: (String) -> Void
    let pickBranch: (String) -> Void
    let includeTerminalOutput: Bool
    let pickTerminalOutput: () -> Void
    let pickServiceLog: (ServiceInfo) -> Void
    // The file to preview (tapped via the eye button, distinct from the row's
    // primary insert-mention tap).
    @State private var previewTarget: FileViewerTarget?

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
                if includeTerminalOutput || !services.isEmpty {
                    header("Context")
                    if includeTerminalOutput {
                        contextRow(icon: "terminal", title: "This terminal's output",
                                   subtitle: "Insert recent output", action: pickTerminalOutput)
                    }
                    ForEach(services) { s in
                        contextRow(icon: "square.stack.3d.up", title: "\(s.name) logs",
                                   subtitle: "Insert recent logs", action: { pickServiceLog(s) })
                    }
                }
            }
        }
        .frame(maxHeight: 260)
        .sheet(item: $previewTarget) { target in
            FileViewerSheet(target: target).environment(model)
        }
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
        HStack(spacing: 0) {
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
                .padding(.leading, 16).padding(.vertical, 9).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // A separate preview tap (files only) that opens the viewer instead of
            // inserting the @-mention.
            if !e.dir {
                Button { previewTarget = FileViewerTarget(project: project, path: e.path) } label: {
                    Image(systemName: "eye")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .frame(width: 44).padding(.vertical, 9).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Spacer().frame(width: 16)
            }
        }
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
