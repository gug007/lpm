import SwiftUI

/// Go to File: the project's files whose path holds the query, from the same
/// index the composer's @-mention list reads. A query that is a path gets a row of
/// its own above them, for a file or folder the index doesn't hold.
struct GoToFileResults: View {
    @Environment(AppModel.self) private var model
    let project: Project
    let query: String
    let onOpen: (String) -> Void

    private var path: String? { model.projectFiles.canLocatePaths ? typedPath(query) : nil }
    private var located: LocatedPath? { path.flatMap { model.projectFiles.located(project.name, $0) } }
    /// The path's own row: nothing is there for it to show.
    private var showsPath: Bool { path != nil && located.map { $0.kind == .file || $0.kind == .dir } ?? true }

    var body: some View {
        Group {
            if let index = model.mentions[project.name] {
                let hits = goToFileMatches(index, query: query)
                if !hits.isEmpty || showsPath {
                    results(hits)
                } else if let path, located?.kind == .missing {
                    ContentUnavailableView {
                        Label("Nothing at “\(path)”", systemImage: "magnifyingglass")
                    } description: {
                        Text("Check the path or try a new search.")
                    }
                } else {
                    ContentUnavailableView.search(text: query)
                }
            } else {
                List {
                    if showsPath { pathRow }
                    ForEach([150.0, 110.0, 170.0], id: \.self) { FileRowSkeleton(width: $0).compactRow() }
                }
                .listStyle(.insetGrouped)
                .scrollDisabled(!showsPath)
                .allowsHitTesting(showsPath)
            }
        }
        .task(id: path) {
            guard let path else { return }
            try? await Task.sleep(nanoseconds: 250_000_000)
            if !Task.isCancelled { model.projectFiles.locate(project.name, path) }
        }
    }

    private func results(_ hits: [MentionEntry]) -> some View {
        List {
            if showsPath { pathRow }
            ForEach(hits) { entry in
                Button { onOpen(entry.path) } label: { GoToFileRow(path: entry.path) }
                    .compactRow()
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private var pathRow: some View {
        if let located {
            GoToPathRow(project: project, located: located, onOpen: onOpen).compactRow()
        } else {
            FileRowSkeleton(width: 130).compactRow()
        }
    }
}

/// Files whose name holds `query` first, then those whose folder path does;
/// changed files lead within each.
func goToFileMatches(_ entries: [MentionEntry], query: String, limit: Int = 100) -> [MentionEntry] {
    var byName: [MentionEntry] = []
    var byPath: [MentionEntry] = []
    for entry in entries where !entry.dir {
        if (entry.path as NSString).lastPathComponent.localizedCaseInsensitiveContains(query) {
            byName.append(entry)
        } else if entry.path.localizedCaseInsensitiveContains(query) {
            byPath.append(entry)
        }
    }
    func changedFirst(_ list: [MentionEntry]) -> [MentionEntry] {
        list.filter(\.changed) + list.filter { !$0.changed }
    }
    return Array((changedFirst(byName) + changedFirst(byPath)).prefix(limit))
}
