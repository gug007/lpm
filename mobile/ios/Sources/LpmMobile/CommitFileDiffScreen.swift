import SwiftUI

/// One file's patch in a commit, drawn the way Review Changes draws a diff.
struct CommitFileDiffScreen: View {
    @Environment(AppModel.self) private var model
    let project: String
    let commit: HistoryCommit
    let file: CommitFile

    @AppStorage("gitReview.wrap") private var wrap = true

    private var patch: GitHistoryStore.Patch { model.gitHistory.patch(project, commit.hash, file.path) }

    var body: some View {
        let patch = patch
        List {
            content(patch)
            if patch.result?.truncated == true {
                InlineNote(icon: "scissors", text: "This diff is too long to show in full.")
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .environment(\.defaultMinListRowHeight, 0)
        .navigationTitle(file.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                TogglePill(label: "Wrap", tint: .accentColor, on: wrap) { wrap.toggle() }
            }
        }
        .task(id: model.connection == .ready) {
            guard model.connection == .ready, file.added != nil,
                  patch.result == nil, patch.error == nil else { return }
            model.gitHistory.loadPatch(project, hash: commit.hash, file: file)
        }
    }

    @ViewBuilder
    private func content(_ patch: GitHistoryStore.Patch) -> some View {
        if file.isBinary {
            row { InlineNote(icon: "doc.badge.gearshape", text: "Binary file") }
        } else if let parsed = patch.parsed {
            if parsed.blocks.isEmpty {
                row { InlineNote(icon: "doc.plaintext", text: "No changes to show") }
            }
            ForEach(parsed.blocks) { block in
                if block.kind == .hunk {
                    HunkSeparator(label: block.hunkLabel, context: block.hunkContext, indent: block.indentHint)
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color(.secondarySystemFill))
                } else {
                    Group {
                        if wrap { WrappedDiffCodeBlock(block: block) } else { DiffCodeBlock(block: block) }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                }
            }
        } else if let error = patch.error {
            row {
                InlineDiffError(message: error) { model.gitHistory.loadPatch(project, hash: commit.hash, file: file) }
            }
        } else {
            row { InlineDiffLoading() }
        }
    }

    private func row<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        content()
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
    }
}
