import SwiftUI
import UIKit

/// One project file's fetched contents for the viewer: `content` is nil until it
/// loads (or on failure), `truncated` marks a file capped at the server's size
/// limit, and `loading` gates the spinner.
struct FileLoad {
    var content: String?
    var truncated: Bool = false
    var error: String?
    var loading: Bool
}

/// Identifies a file to preview, so a `.sheet(item:)` can drive the viewer. `id`
/// matches the key AppModel stores the fetched contents under.
struct FileViewerTarget: Identifiable {
    let project: String
    let path: String
    var id: String { project + "\n" + path }
}

/// A read-only viewer for a project file: monospaced, horizontally + vertically
/// scrollable, with a copy button. The Mac reads the file (confined to the project
/// root, capped, binary refused) and replies asynchronously; this shows loading /
/// content / error accordingly.
struct FileViewerSheet: View {
    @Environment(AppModel.self) private var model
    let target: FileViewerTarget
    @Environment(\.dismiss) private var dismiss

    private var load: FileLoad? { model.loadedFiles[target.id] }
    private var filename: String { (target.path as NSString).lastPathComponent }

    var body: some View {
        NavigationStack {
            Group {
                if let load, !load.loading {
                    if let content = load.content {
                        contentView(content, truncated: load.truncated)
                    } else {
                        errorState(load.error ?? "Couldn't read the file.")
                    }
                } else {
                    loadingState
                }
            }
            .navigationTitle(filename)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        UIPasteboard.general.string = load?.content ?? ""
                        Haptics.tap()
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .disabled(load?.content == nil)
                }
            }
        }
        .onAppear {
            if model.loadedFiles[target.id]?.content == nil {
                model.requestFile(project: target.project, path: target.path)
            }
        }
    }

    private func contentView(_ content: String, truncated: Bool) -> some View {
        ScrollView([.vertical, .horizontal]) {
            Text(content.isEmpty ? "(empty file)" : content)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(content.isEmpty ? .secondary : .primary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
        }
        .safeAreaInset(edge: .top) {
            if truncated {
                Text("Showing the first 1 MB — this file is larger.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.thinMaterial)
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Reading \(filename)…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't open the file", systemImage: "doc.questionmark")
        } description: {
            Text(message)
        } actions: {
            Button("Retry") { model.requestFile(project: target.project, path: target.path) }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
    }
}
