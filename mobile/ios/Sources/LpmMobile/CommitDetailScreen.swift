import SwiftUI
import UIKit

/// One commit: its message, who wrote it and with which agent, and the files
/// it changed. A file opens its patch in the commit.
struct CommitDetailScreen: View {
    @Environment(AppModel.self) private var model
    let project: String
    let commit: HistoryCommit

    private var entry: GitHistoryStore.Files { model.gitHistory.commitFiles(project, commit.hash) }

    var body: some View {
        let entry = entry
        List {
            Section {
                header
            }
            Section {
                if let files = entry.files {
                    if files.isEmpty {
                        Text("This commit changes no files.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(files) { file in
                        NavigationLink {
                            CommitFileDiffScreen(project: project, commit: commit, file: file)
                        } label: {
                            HistoryFileRow(file: file)
                        }
                    }
                } else if let error = entry.error {
                    InlineDiffError(message: error) { model.gitHistory.loadFiles(project, hash: commit.hash) }
                        .listRowInsets(EdgeInsets())
                } else {
                    HStack(spacing: 10) {
                        ProgressView().controlSize(.small)
                        Text("Loading files…").font(.footnote).foregroundStyle(.secondary)
                    }
                }
            } header: {
                filesHeader(entry.files)
            }
        }
        .navigationTitle(commit.short)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(action: copyHash) {
                        Label("Copy Hash", systemImage: "doc.on.doc")
                    }
                    Button { UIPasteboard.general.string = commit.fullMessage } label: {
                        Label("Copy Message", systemImage: "text.quote")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More")
            }
        }
        .task(id: model.connection == .ready) {
            guard model.connection == .ready, entry.files == nil else { return }
            model.gitHistory.loadFiles(project, hash: commit.hash)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(commit.subject)
                .font(.headline)
                .textSelection(.enabled)
            HStack(spacing: 4) {
                Button(action: copyHash) {
                    HStack(spacing: 3) {
                        Text(commit.short).monospaced()
                        Image(systemName: "doc.on.doc").font(.caption2)
                    }
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Copy the full hash")
                Text("·")
                Text(commit.author)
                Text("·")
                Text(commit.date.formatted(date: .abbreviated, time: .shortened))
                if commit.isMerge {
                    Text("·")
                    Text("Merge")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            if !commit.coAuthors.isEmpty {
                HStack(spacing: 5) {
                    if let agent = commit.agent, let mark = AgentMark(agent) {
                        mark.frame(width: 12, height: 12)
                    }
                    Text("with \(commit.coAuthorNames.joined(separator: ", "))")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            let message = commit.message
            if !message.isEmpty {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func filesHeader(_ files: [CommitFile]?) -> some View {
        if let files {
            let totals = files.lineTotals
            HStack(spacing: 8) {
                Text(files.count == 1 ? "1 file" : "\(files.count) files")
                DiffStat(added: totals.added, removed: totals.removed)
            }
        } else {
            Text("Files")
        }
    }

    private func copyHash() {
        UIPasteboard.general.string = commit.hash
        Haptics.success()
    }
}

/// A file the commit changed: its status, name over folder, and line counts.
struct HistoryFileRow: View {
    let file: CommitFile

    var body: some View {
        HStack(spacing: 10) {
            GitStatusBadge(status: file.status)
            VStack(alignment: .leading, spacing: 1) {
                Text(file.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let oldPath = file.oldPath {
                    Text("from \(oldPath)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.head)
                } else if !file.directory.isEmpty {
                    Text(file.directory)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.head)
                }
            }
            Spacer(minLength: 6)
            if file.isBinary {
                Text("binary")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                DiffStat(added: file.added ?? 0, removed: file.removed ?? 0)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
