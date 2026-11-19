import SwiftUI

/// Changes' Branch scope: every file the branch's own commits changed since it
/// left its base, each with its whole diff and a Viewed mark of its own, read
/// only, ending in its pull request: the open one, or Create Pull Request.
struct GitBranchReviewList: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let project: Project
    let onCreatePr: () -> Void
    let onAsk: (AskContext) -> Void

    @State private var collapsed: [String: Bool] = [:]
    @State private var pins = HeaderPins()

    private var name: String { project.name }
    private var key: String { GitExtrasStore.branchKey(name) }
    private var scope: BranchScope? { model.gitExtras.branchScopes[name] }
    private var loaded: Bool { model.gitExtras.branchLoaded.contains(name) }
    private var files: [GitFile]? {
        guard let scope, !scope.files.isEmpty else { return nil }
        return scope.files
    }
    private var openPr: GitChecks.PullRequest? { model.gitChecks.checks(name)?.pr }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                if let scope, let files {
                    Section {
                        ReviewSummary(title: scope.heading, total: files.count, viewed: viewedCount(files))
                            .listRowInsets(EdgeInsets())
                            .listRowSeparator(.hidden)
                    }
                    ForEach(files) { file in
                        GitFileSection(
                            project: key,
                            file: file,
                            selected: true,
                            collapsed: isCollapsed(file.path),
                            toggleSelected: nil,
                            toggleCollapsed: { toggleCollapsed(file.path) },
                            toggleViewed: {
                                toggleViewedInPlace(model.git, key: key, path: file.path,
                                                    wasOpen: !isCollapsed(file.path), collapsed: $collapsed,
                                                    pins: pins, proxy: proxy)
                            },
                            onAsk: { onAsk(AskContext(path: file.path, diffText: $0)) },
                            onDiscard: nil,
                            pins: pins
                        )
                    }
                }
            }
            .listStyle(.plain)
            .listSectionSpacing(0)
            .refreshable {
                model.gitExtras.loadBranch(name)
                try? await Task.sleep(nanoseconds: 600_000_000)
            }
            .overlay { stateOverlay }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if files != nil, model.git.snapshots[name]?.ghCli == true { prBar }
            }
            .toolbar {
                if let files {
                    ToolbarItem(placement: .topBarTrailing) {
                        ReviewJumpMenu(key: key, files: files, proxy: proxy)
                    }
                }
            }
        }
        .onAppear { model.gitExtras.loadBranch(name) }
        .onChange(of: model.git.commitTick[name]) { _, _ in model.gitExtras.loadBranch(name) }
        .onChange(of: model.git.snapshots[name]?.branch) { _, _ in model.gitExtras.loadBranch(name) }
        .onChange(of: model.git.changedSinceViewed[key]) { _, changed in
            for path in (changed ?? [:]).keys { collapsed[path] = nil }
        }
    }

    private var prBar: some View {
        Button {
            if let pr = openPr, let url = URL(string: pr.url) { openURL(url) } else { onCreatePr() }
        } label: {
            Label(openPr.map { "Open Pull Request #\($0.number)" } ?? "Create Pull Request",
                  systemImage: "arrow.triangle.pull")
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .bottomBar()
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if let scope, scope.files.isEmpty {
            ContentUnavailableView {
                Label(scope.range == .since ? "No commits since \(scope.base)" : "Everything is pushed",
                      systemImage: "checkmark.circle")
            } description: {
                Text(scope.range == .since ? "This branch has no changes of its own yet."
                                           : "No commits are waiting to be pushed.")
            }
        } else if loaded && scope == nil {
            ContentUnavailableView {
                Label("Nothing to compare", systemImage: "arrow.triangle.branch")
            } description: {
                Text("This branch has no upstream and no base branch to compare it with.")
            }
        } else if !loaded {
            if let error = model.gitExtras.branchErrors[name], !model.gitExtras.branchLoading.contains(name) {
                ContentUnavailableView {
                    Label("Can't read the branch", systemImage: "wifi.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") { model.gitExtras.loadBranch(name) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                GitReviewSkeleton()
            }
        }
    }

    private func viewedCount(_ files: [GitFile]) -> Int {
        files.filter { model.git.isViewed(key, path: $0.path) }.count
    }

    private func isCollapsed(_ path: String) -> Bool {
        collapsed[path] ?? model.git.isViewed(key, path: path)
    }

    private func toggleCollapsed(_ path: String) {
        let now = !isCollapsed(path)
        withAnimation(.easeInOut(duration: 0.15)) { collapsed[path] = now }
    }
}
