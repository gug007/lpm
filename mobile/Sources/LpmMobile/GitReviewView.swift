import SwiftUI

/// The git review screen for a project: the branch and its upstream relation with
/// a Push button, the changed files (each selectable for commit and tappable for
/// its diff), a commit message field with an AI "generate" helper, and — when the
/// GitHub CLI is available — a "Create Pull Request" flow.
struct GitReviewView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    let project: Project

    @State private var message = ""
    // Files the user explicitly unchecked. Everything else stays selected, so new
    // changes are picked up automatically and deselections survive a refresh.
    @State private var deselected: Set<String> = []
    @State private var showPrSheet = false
    @State private var asking: AskContext?
    @State private var openTerminal: TerminalInfo?

    private var name: String { project.name }
    private var snapshot: GitSnapshot? { model.gitSnapshots[name] }
    private var loadError: String? { model.gitLoadError[name] }
    private var loading: Bool { model.gitLoading.contains(name) }
    private var pushing: Bool { model.gitPushing.contains(name) }
    private var committing: Bool { model.gitCommitting.contains(name) }
    private var generating: Bool { model.gitGeneratingMessage.contains(name) }

    private var selectedPaths: [String] {
        (snapshot?.files ?? []).map(\.path).filter { !deselected.contains($0) }
    }
    private var trimmedMessage: String {
        message.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var canCommit: Bool {
        !selectedPaths.isEmpty && !trimmedMessage.isEmpty && !committing && !pushing
    }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                if let s = snapshot, s.isRepo {
                    branchSection(s)
                    if s.files.isEmpty {
                        noChangesSection
                    } else {
                        ForEach(Array(s.files.enumerated()), id: \.element.id) { index, file in
                            GitFileSection(
                                project: name,
                                file: file,
                                selected: !deselected.contains(file.path),
                                toggle: { toggle(file.path) },
                                headerInfo: index == 0 ? (total: s.files.count, reviewed: reviewedCount(s)) : nil,
                                onAsk: { diffText in asking = AskContext(path: file.path, diffText: diffText) }
                            )
                            .id("file-" + file.path)
                        }
                        commitSection
                    }
                    if s.ghCli {
                        prSection
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Changes")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await refresh() }
            .overlay { stateOverlay }
            .animation(.default, value: snapshot?.files.count ?? -1)
            .toolbar {
                if let s = snapshot, s.isRepo, !s.files.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        jumpMenu(s, proxy: proxy)
                    }
                }
            }
            .onAppear {
                if snapshot == nil { model.loadGit(name) }
                model.watchGit(name)
            }
            .onDisappear { model.unwatchGit(name) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.refreshWatchedGit(name) }
            }
            .onChange(of: model.gitGeneratedMessage[name]) { _, m in
                if let m {
                    message = m
                    model.consumeGitGeneratedMessage(name)
                }
            }
            .onChange(of: model.gitCommitTick[name]) { _, _ in
                message = ""
                deselected = []
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(get: { model.gitOpError[name] != nil },
                                     set: { if !$0 { model.gitOpError[name] = nil } })
            ) {
                Button("OK", role: .cancel) { model.gitOpError[name] = nil }
            } message: {
                Text(model.gitOpError[name] ?? "")
            }
            .sheet(isPresented: $showPrSheet) {
                GitPrSheet(project: project)
                    .environmentObject(model)
            }
            .sheet(item: $asking) { ctx in
                AgentAskSheet(project: project, path: ctx.path, diffText: ctx.diffText) { term, prompt in
                    sendToAgent(term, prompt)
                }
                .environmentObject(model)
            }
            .navigationDestination(item: $openTerminal) { TerminalScreen(term: $0) }
        }
    }

    private func sendToAgent(_ term: TerminalInfo, _ prompt: String) {
        model.recordHistory(project: name, id: term.id, label: term.label, text: prompt)
        model.pendingAgentPrompt[term.id] = prompt
        asking = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            openTerminal = term
        }
    }

    private func reviewedCount(_ s: GitSnapshot) -> Int {
        s.files.filter { model.isViewed(name, path: $0.path) }.count
    }

    private func jumpMenu(_ s: GitSnapshot, proxy: ScrollViewProxy) -> some View {
        Menu {
            ForEach(s.files) { f in
                Button {
                    withAnimation { proxy.scrollTo("file-" + f.path, anchor: .top) }
                } label: {
                    Label((f.path as NSString).lastPathComponent, systemImage: jumpSymbol(f.status))
                }
            }
        } label: {
            Image(systemName: "list.bullet")
        }
    }

    private func jumpSymbol(_ status: String) -> String {
        switch status {
        case "added": return "plus.circle"
        case "deleted": return "minus.circle"
        case "renamed": return "arrow.right.circle"
        case "untracked": return "questionmark.circle"
        default: return "pencil.circle"
        }
    }

    // MARK: sections

    private func branchSection(_ s: GitSnapshot) -> some View {
        Section {
            HStack(spacing: 14) {
                Image(systemName: "arrow.trianglehead.branch")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 34, height: 34)
                    .background(Color(.tertiarySystemFill),
                                in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(s.detached ? "Detached HEAD" : s.branch)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    HStack(spacing: 8) {
                        if s.ahead > 0 { TrackingBadge(icon: "arrow.up", count: s.ahead) }
                        if s.behind > 0 { TrackingBadge(icon: "arrow.down", count: s.behind) }
                        if !s.hasUpstream {
                            Text("No upstream")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                        } else if s.ahead == 0 && s.behind == 0 {
                            Text("Up to date")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 8)
                if canPush(s) {
                    Button(action: { model.gitPush(name) }) {
                        if pushing {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Push").fontWeight(.semibold)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .disabled(pushing || committing)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private var noChangesSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("No changes")
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.vertical, 6)
        }
    }

    private var commitSection: some View {
        Section {
            TextField("Commit message", text: $message, axis: .vertical)
                .lineLimit(3...8)

            Button {
                model.gitGenMessage(name, files: selectedPaths)
            } label: {
                HStack(spacing: 8) {
                    if generating {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "sparkles")
                    }
                    Text(generating ? "Generating…" : "Generate message")
                }
            }
            .disabled(generating || selectedPaths.isEmpty)

            Button(action: commit) {
                HStack {
                    Spacer()
                    if committing {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Commit \(selectedPaths.count) file\(selectedPaths.count == 1 ? "" : "s")")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canCommit)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        } header: {
            Text("Commit")
        } footer: {
            Text("Only the selected files are committed.")
        }
    }

    private var prSection: some View {
        Section {
            Button {
                showPrSheet = true
            } label: {
                Label("Create Pull Request", systemImage: "arrow.triangle.pull")
            }
        }
    }

    // MARK: state overlay

    @ViewBuilder
    private var stateOverlay: some View {
        if let s = snapshot, !s.isRepo {
            ContentUnavailableView {
                Label("Not a git repository", systemImage: "folder.badge.questionmark")
            } description: {
                Text("This project isn't tracked by git, so there's nothing to review.")
            }
        } else if snapshot == nil {
            if let loadError, !loading {
                ContentUnavailableView {
                    Label("Can't reach your Mac", systemImage: "wifi.slash")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Retry") { model.loadGit(name) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                GitReviewSkeleton()
            }
        }
    }

    // MARK: actions

    private func canPush(_ s: GitSnapshot) -> Bool { s.ahead > 0 || !s.hasUpstream }

    private func toggle(_ path: String) {
        if deselected.contains(path) { deselected.remove(path) } else { deselected.insert(path) }
    }

    private func commit() {
        model.gitCommit(name, message: trimmedMessage, files: selectedPaths)
    }

    private func refresh() async {
        model.loadGit(name)
        try? await Task.sleep(nanoseconds: 600_000_000)
    }
}

/// An ahead/behind badge (↑N or ↓M) for the branch header.
private struct TrackingBadge: View {
    let icon: String
    let count: Int

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: icon).font(.system(size: 9, weight: .bold))
            Text("\(count)").monospacedDigit()
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
    }
}

/// One changed file as its own section: a header row with the commit-selection
/// checkmark, a colored status badge, the path, and a collapse chevron; below it
/// the file's diff rendered inline. The diff is fetched lazily on first appearance
/// (so opening the screen doesn't request every file at once) and capped — very
/// long diffs offer "Show full diff", which pushes the lazy full-screen view.
/// One "Ask agent…" invocation: the file path and the diff text to attach.
struct AskContext: Identifiable {
    let id = UUID()
    let path: String
    let diffText: String
}

private struct GitFileSection: View {
    @EnvironmentObject var model: AppModel
    let project: String
    let file: GitFile
    let selected: Bool
    let toggle: () -> Void
    let headerInfo: (total: Int, reviewed: Int)?
    let onAsk: (String) -> Void

    private let inlineCap = 200
    @State private var collapsed = false

    private var key: String { model.diffKey(project, file.path) }
    private var result: GitDiffResult? { model.gitDiffs[key] }
    private var loading: Bool { model.gitDiffLoading.contains(key) }
    private var error: String? { model.gitDiffError[key] }
    private var parsed: ParsedDiff? { model.parsedDiff(project, path: file.path) }
    private var viewed: Bool { model.isViewed(project, path: file.path) }
    private var promptDiff: String {
        guard let result, !result.binary else { return "" }
        return ParsedDiff.promptDiff(result.diff)
    }

    var body: some View {
        Section {
            header
                .contextMenu { askButton }
            if !collapsed {
                content
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .contextMenu { askButton }
            }
        } header: {
            if let headerInfo {
                sectionHeader(headerInfo)
            }
        }
        .onAppear {
            collapsed = viewed
            if result == nil && !loading { model.loadGitDiff(project, path: file.path) }
        }
    }

    private var askButton: some View {
        Button { onAsk(promptDiff) } label: {
            Label("Ask agent…", systemImage: "sparkles")
        }
    }

    private func sectionHeader(_ info: (total: Int, reviewed: Int)) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Changed files (\(info.total))")
            if info.reviewed > 0 {
                Text("\(info.reviewed) of \(info.total) reviewed")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .textCase(nil)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: toggle) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.easeInOut(duration: 0.15)) { collapsed.toggle() }
            } label: {
                HStack(spacing: 8) {
                    GitStatusBadge(status: file.status)
                    Text(file.path)
                        .font(.system(size: 15))
                        .lineLimit(1)
                        .truncationMode(.head)
                        .foregroundStyle(.primary)
                    Spacer(minLength: 6)
                    if let parsed {
                        DiffStat(added: parsed.addedCount, removed: parsed.removedCount)
                    }
                    Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                let nowViewed = !viewed
                model.toggleViewed(project, path: file.path)
                withAnimation(.easeInOut(duration: 0.15)) { collapsed = nowViewed }
            } label: {
                Image(systemName: viewed ? "checkmark.seal.fill" : "checkmark.seal")
                    .font(.system(size: 18))
                    .foregroundStyle(viewed ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let result {
            if result.binary {
                InlineNote(icon: "doc.badge.gearshape", text: "Binary file")
            } else if result.diff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                InlineNote(icon: "doc.plaintext", text: "No changes to show")
            } else if let parsed {
                InlineDiff(parsed: parsed, cap: inlineCap, project: project, file: file)
            } else {
                InlineDiffLoading()
            }
        } else if let error {
            InlineDiffError(message: error) { model.loadGitDiff(project, path: file.path) }
        } else {
            InlineDiffLoading()
        }
    }
}

/// The per-file "+N −M" change counts shown in the section header once the diff
/// has been parsed.
private struct DiffStat: View {
    let added: Int
    let removed: Int

    var body: some View {
        HStack(spacing: 6) {
            if added > 0 {
                Text("+\(added)").foregroundStyle(.green)
            }
            if removed > 0 {
                Text("−\(removed)").foregroundStyle(.red)
            }
        }
        .font(.system(size: 12, weight: .semibold, design: .monospaced))
        .monospacedDigit()
    }
}

/// The capped, horizontally scrolling inline diff for a file section. Vertical
/// scrolling stays with the enclosing List; only this column scrolls sideways.
private struct InlineDiff: View {
    let parsed: ParsedDiff
    let cap: Int
    let project: String
    let file: GitFile

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(parsed.lines.prefix(cap))) { line in
                        DiffLineRow(line: line, gutterWidth: parsed.gutterWidth,
                                    contentWidth: parsed.contentWidth)
                    }
                }
            }

            if parsed.lines.count > cap {
                Divider()
                NavigationLink {
                    GitDiffView(project: project, file: file)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.down.forward.and.arrow.up.backward")
                        Text("Show full diff · \(parsed.lines.count) lines")
                    }
                    .font(.footnote.weight(.medium))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
                }
            }
        }
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 10, bottomTrailingRadius: 10, style: .continuous))
    }
}

private struct InlineNote: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
            Text(text)
            Spacer(minLength: 0)
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

private struct InlineDiffLoading: View {
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text("Loading diff…")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

private struct InlineDiffError: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(.orange)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("Retry", action: retry)
                .font(.footnote.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

/// A one-letter status chip colored by change kind: added green, modified orange,
/// deleted red, renamed blue, untracked gray.
struct GitStatusBadge: View {
    let status: String

    private var letter: String {
        switch status {
        case "added": return "A"
        case "deleted": return "D"
        case "renamed": return "R"
        case "untracked": return "U"
        case "modified": return "M"
        default: return "•"
        }
    }
    private var color: Color {
        switch status {
        case "added": return .green
        case "deleted": return .red
        case "renamed": return .blue
        case "untracked": return .gray
        case "modified": return .orange
        default: return .gray
        }
    }

    var body: some View {
        Text(letter)
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundStyle(color)
            .frame(width: 22, height: 22)
            .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// Loading ghost for the review screen, matching the branch + file-row layout.
private struct GitReviewSkeleton: View {
    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(.tertiarySystemFill))
                        .frame(width: 34, height: 34)
                    SkeletonBar(width: 120)
                    Spacer()
                }
                .shimmer()
            }
            Section {
                ForEach([160.0, 120.0, 190.0, 140.0], id: \.self) { w in
                    HStack(spacing: 12) {
                        Circle().fill(Color(.tertiarySystemFill)).frame(width: 20, height: 20)
                        SkeletonBar(width: w)
                        Spacer()
                    }
                    .shimmer()
                }
            }
        }
        .scrollDisabled(true)
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}

/// The create-pull-request sheet: editable title + body with an AI "generate"
/// helper, and a Create action. Creating pushes first, so it can take a while; on
/// success the PR's URL is shown with an Open button. Presentable from both the
/// review screen and the project screen's Git menu.
struct GitPrSheet: View {
    @EnvironmentObject var model: AppModel
    let project: Project
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var body_ = ""
    @State private var createdURL: String?

    private var name: String { project.name }
    private var generating: Bool { model.gitGeneratingPr.contains(name) }
    private var creating: Bool { model.gitCreatingPr.contains(name) }
    private var canCreate: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !creating && !generating
    }

    var body: some View {
        NavigationStack {
            Group {
                if let url = createdURL {
                    createdView(url)
                } else {
                    form
                }
            }
            .navigationTitle("Pull Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(createdURL == nil ? "Cancel" : "Done") { dismiss() }
                }
                if createdURL == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(action: create) {
                            if creating {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Create").fontWeight(.semibold)
                            }
                        }
                        .disabled(!canCreate)
                    }
                }
            }
            .onChange(of: model.gitPrDraft[name]) { _, draft in
                if let draft {
                    title = draft.title
                    body_ = draft.body
                    model.consumeGitPrDraft(name)
                }
            }
            .onChange(of: model.gitCreatedPrURL[name]) { _, url in
                if let url {
                    createdURL = url
                    model.consumeGitCreatedPrURL(name)
                }
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(get: { model.gitPrError[name] != nil },
                                     set: { if !$0 { model.gitPrError[name] = nil } })
            ) {
                Button("OK", role: .cancel) { model.gitPrError[name] = nil }
            } message: {
                Text(model.gitPrError[name] ?? "")
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                TextField("Title", text: $title, axis: .vertical)
                    .lineLimit(1...3)
            } header: {
                Text("Title")
            }
            Section {
                TextField("Description", text: $body_, axis: .vertical)
                    .lineLimit(4...16)
            } header: {
                Text("Description")
            }
            Section {
                Button {
                    model.gitGenPr(name)
                } label: {
                    HStack(spacing: 8) {
                        if generating {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(generating ? "Generating…" : "Generate with AI")
                    }
                }
                .disabled(generating)
            } footer: {
                Text("Creating a pull request pushes your branch first, so it can take a moment.")
            }
        }
    }

    private func createdView(_ url: String) -> some View {
        ContentUnavailableView {
            Label("Pull request created", systemImage: "checkmark.seal.fill")
        } description: {
            Text(url)
                .font(.footnote)
                .textSelection(.enabled)
        } actions: {
            if let link = URL(string: url) {
                Link(destination: link) {
                    Label("Open in Safari", systemImage: "safari")
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
            }
        }
    }

    private func create() {
        model.gitCreatePr(name,
                          title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                          body: body_)
    }
}
