import SwiftUI

/// The git review screen for a project: how many files changed and how many are
/// viewed, then every changed file with its whole diff under a header that pins
/// while it scrolls, and a pinned "Commit N files" that opens the commit sheet.
/// When the GitHub CLI is available it also offers "Create Pull Request".
struct GitReviewView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    let project: Project
    /// A file to open the screen on, scrolled to and expanded.
    var focus: String? = nil
    @State private var focused = false

    // The draft as it stood when the Mac was asked for a message: a reply that
    // lands after the user typed is dropped, so their text wins.
    @State private var draftAtGenerate: String?
    @State private var autoDraftTried = false
    // Collapse the user chose per file; a file without a choice is collapsed once
    // it's viewed.
    @State private var collapsed: [String: Bool] = [:]
    @State private var pins = HeaderPins()
    @State private var showCommit = false
    @State private var showPrSheet = false
    @State private var asking: AskContext?
    // The file whose Discard waits on the confirmation.
    @State private var discarding: GitFile?
    @State private var openTerminal: TerminalInfo?
    @State private var isVisible = false
    @State private var scope = ReviewScope.uncommitted

    private var name: String { project.name }

    // The commit being written lives in the store, so leaving the screen keeps it.
    private var message: String {
        get { model.git.commitDrafts[name]?.message ?? "" }
        nonmutating set { model.git.commitDrafts[name, default: CommitDraft()].message = newValue }
    }
    // Files the user explicitly unchecked. Everything else stays selected, so new
    // changes are picked up automatically and deselections survive a refresh.
    private var deselected: Set<String> {
        get { model.git.commitDrafts[name]?.deselected ?? [] }
        nonmutating set { model.git.commitDrafts[name, default: CommitDraft()].deselected = newValue }
    }
    // The message the Mac last drafted.
    private var drafted: String? {
        get { model.git.commitDrafts[name]?.drafted }
        nonmutating set { model.git.commitDrafts[name, default: CommitDraft()].drafted = newValue }
    }
    private var snapshot: GitSnapshot? { model.git.snapshots[name] }
    private var loadError: String? { model.git.loadError[name] }
    private var loading: Bool { model.git.loading.contains(name) }
    private var changedFiles: [GitFile]? {
        guard let s = snapshot, s.isRepo, !s.files.isEmpty else { return nil }
        return s.files
    }

    private var selectedCount: Int {
        (snapshot?.files ?? []).filter { !deselected.contains($0.path) }.count
    }

    private var showsScope: Bool { model.gitExtras.canBranchScope && snapshot?.isRepo == true }

    var body: some View {
        Group {
            if scope == .branch {
                GitBranchReviewList(project: project, onCreatePr: { showPrSheet = true }, onAsk: { asking = $0 })
            } else {
                uncommittedList
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if showsScope {
                ReviewScopePicker(scope: $scope, branchFiles: model.gitExtras.branchScopes[name]?.files.count)
            }
        }
        .navigationTitle("Changes")
        .navigationBarTitleDisplayMode(.inline)
        .gitNotice(project: name, isActive: isVisible)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if scope == .branch {
                    ChangesTitle(project: GitExtrasStore.branchKey(name),
                                 files: model.gitExtras.branchScopes[name]?.files ?? [])
                } else {
                    ChangesTitle(project: name)
                }
            }
        }
        // The watch only reports changes from here on, so whatever changed
        // since the last snapshot is fetched now.
        .onAppear {
            isVisible = true
            model.git.watch(name)
            model.git.refreshWatched(name)
        }
        .onDisappear {
            isVisible = false
            model.git.unwatch(name)
        }
        // A file changed again since it was viewed opens back up.
        .onChange(of: model.git.changedSinceViewed[name]) { _, changed in
            for path in (changed ?? [:]).keys { collapsed[path] = nil }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.git.refreshWatched(name) }
        }
        .onChange(of: model.git.generatingMessage.contains(name)) { _, generating in
            if generating { draftAtGenerate = message }
        }
        .onChange(of: model.git.generatedMessage[name]) { _, m in
            guard let m else { return }
            model.git.consumeGeneratedMessage(name)
            autoDraftTried = false
            if message == draftAtGenerate {
                message = m
                drafted = m
            }
            draftAtGenerate = nil
        }
        .onChange(of: model.git.commitTick[name]) { _, _ in
            draftAtGenerate = nil
            autoDraftTried = false
        }
        // Gated on isVisible: a terminal pushed from this screen hosts the
        // project menu, whose git ops report into the same gitOpError slot —
        // without the gate both screens would try to present this alert. The
        // commit sheet reports its own failures while it's up.
        .alert(
            model.git.opError[name]?.title ?? "",
            isPresented: Binding(get: { isVisible && !showCommit && model.git.opError[name] != nil },
                                 set: { if !$0 { model.git.opError[name] = nil } })
        ) {
            Button("OK", role: .cancel) { model.git.opError[name] = nil }
        } message: {
            Text(model.git.opError[name]?.message ?? "")
        }
        .sheet(isPresented: $showCommit) {
            GitCommitSheet(project: name,
                           message: Binding(get: { message }, set: { message = $0 }),
                           deselected: Binding(get: { deselected }, set: { deselected = $0 }),
                           drafted: drafted, autoDraftTried: $autoDraftTried)
                .environment(model)
        }
        .sheet(isPresented: $showPrSheet) {
            GitPrSheet(project: project)
                .environment(model)
        }
        .confirmationDialog(
            "Discard changes to \(discarding?.name ?? "")?",
            isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }),
            titleVisibility: .visible,
            presenting: discarding
        ) { file in
            Button("Discard Changes", role: .destructive) {
                Haptics.warning()
                AppLock.shared.confirm("Discard the changes to \(file.name)") {
                    model.git.discardFile(name, path: file.path)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { file in
            Text("\(file.path) goes back to how it was at the last commit. lpm keeps a copy on the Mac for 7 days, so you can undo it.")
        }
        .sheet(item: $asking) { ctx in
            AgentAskSheet(project: project, path: ctx.path, diffText: ctx.diffText) { term, prompt in
                sendToAgent(term, prompt)
            }
            .environment(model)
        }
        .navigationDestination(item: $openTerminal) { TerminalScreen(term: $0, project: project).environment(model) }
    }

    private var uncommittedList: some View {
        ScrollViewReader { proxy in
            List {
                if let files = changedFiles {
                    Section {
                        ReviewSummary(total: files.count, viewed: viewedCount(files))
                            .listRowInsets(EdgeInsets())
                            .listRowSeparator(.hidden)
                    }
                    ForEach(files) { file in
                        GitFileSection(
                            project: name,
                            file: file,
                            selected: !deselected.contains(file.path),
                            collapsed: isCollapsed(file.path),
                            toggleSelected: { toggleSelected(file.path) },
                            toggleCollapsed: { toggleCollapsed(file.path) },
                            toggleViewed: {
                                toggleViewedInPlace(model.git, key: name, path: file.path,
                                                    wasOpen: !isCollapsed(file.path), collapsed: $collapsed,
                                                    pins: pins, proxy: proxy)
                            },
                            onAsk: { diffText in asking = AskContext(path: file.path, diffText: diffText) },
                            onDiscard: model.git.canDiscardFiles ? { discarding = file } : nil,
                            pins: pins
                        )
                    }
                    if snapshot?.ghCli == true {
                        prSection
                    }
                }
            }
            .listStyle(.plain)
            .listSectionSpacing(0)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await refresh() }
            .overlay { stateOverlay }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let files = changedFiles {
                    VStack(spacing: 0) {
                        if let draft = model.git.commitDrafts[name], !draft.isEmpty {
                            CommitDraftChip(draft: draft, files: files) { model.git.clearCommitDraft(name) }
                        }
                        CommitBar(selected: selectedCount, committing: model.git.committing.contains(name)) {
                            showCommit = true
                        }
                    }
                }
            }
            .animation(.default, value: snapshot?.files.count ?? -1)
            .toolbar {
                if let files = changedFiles {
                    ToolbarItem(placement: .topBarTrailing) {
                        ReviewJumpMenu(key: name, files: files, proxy: proxy)
                    }
                }
            }
            .task(id: changedFiles?.contains { $0.path == focus } == true) {
                guard let focus, !focused, changedFiles?.contains(where: { $0.path == focus }) == true else { return }
                focused = true
                collapsed[focus] = false
                try? await Task.sleep(for: .milliseconds(300))
                withAnimation { proxy.scrollTo("file-" + focus, anchor: .top) }
            }
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

    private func viewedCount(_ files: [GitFile]) -> Int {
        files.filter { model.git.isViewed(name, path: $0.path) }.count
    }

    private func isCollapsed(_ path: String) -> Bool {
        collapsed[path] ?? model.git.isViewed(name, path: path)
    }

    private var prSection: some View {
        Section {
            Button {
                showPrSheet = true
            } label: {
                Label("Create Pull Request", systemImage: "arrow.triangle.pull")
            }
            .padding(.vertical, 6)
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
        } else if let s = snapshot, s.files.isEmpty {
            ContentUnavailableView {
                Label("No changes", systemImage: "checkmark.circle")
            } description: {
                Text("The working tree is clean.")
            } actions: {
                if s.ghCli {
                    Button {
                        showPrSheet = true
                    } label: {
                        Label("Create Pull Request", systemImage: "arrow.triangle.pull")
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                }
            }
        } else if snapshot == nil {
            if let loadError, !loading {
                ContentUnavailableView {
                    Label("Can't reach your Mac", systemImage: "wifi.slash")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Retry") { model.git.load(name) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                GitReviewSkeleton()
            }
        }
    }

    // MARK: actions

    private func toggleSelected(_ path: String) {
        if deselected.contains(path) { deselected.remove(path) } else { deselected.insert(path) }
    }

    private func toggleCollapsed(_ path: String) {
        let now = !isCollapsed(path)
        withAnimation(.easeInOut(duration: 0.15)) { collapsed[path] = now }
    }

    private func refresh() async {
        model.git.load(name)
        try? await Task.sleep(nanoseconds: 600_000_000)
    }
}

/// One "Ask agent…" invocation: the file path and the diff text to attach.
struct AskContext: Identifiable {
    let id = UUID()
    let path: String
    let diffText: String
}

/// Where each file's header and first diff row sit on screen, so marking a file
/// viewed can tell a header pinned over its scrolled diff from one in place. A
/// plain class: scrolling updates it without re-rendering the review.
final class HeaderPins {
    private var headerBottom: [String: CGFloat] = [:]
    private var firstRowTop: [String: CGFloat] = [:]

    func header(_ path: String, bottom: CGFloat) { headerBottom[path] = bottom }
    func firstRow(_ path: String, top: CGFloat) { firstRowTop[path] = top }

    func isPinned(_ path: String) -> Bool {
        guard let bottom = headerBottom[path], let top = firstRowTop[path] else { return false }
        return top < bottom - 1
    }
}
