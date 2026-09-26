import SwiftUI

/// A file to preview: a path tapped in a terminal (absolute, `~/…`, or relative
/// to the project) or a project file from the @-mention list. A tapped path can
/// have several readings (see pathtap.js); `paths` lists them most likely first
/// and the preview opens the first that exists. `line` is the `:line` suffix the
/// path carried, 0 when none.
struct FilePreviewTarget: Identifiable, Hashable {
    let project: String
    let paths: [String]
    let line: Int
    var id: String { project + "\n" + paths.joined(separator: "\n") + ":\(line)" }

    init(project: String, paths: [String], line: Int = 0) {
        self.project = project
        self.paths = paths
        self.line = line
    }

    init(project: String, path: String) { self.init(project: project, paths: [path]) }
}

/// Opens any file on the Mac, like the desktop's file viewer: text and code with
/// highlighting, Markdown rendered, video and audio in the system player, and
/// images, PDFs and documents through Quick Look. The file is copied over first,
/// with progress, then previewed from this iPhone.
struct FilePreviewSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let target: FilePreviewTarget
    @State private var fetch: FileFetch

    init(target: FilePreviewTarget) {
        self.target = target
        _fetch = State(initialValue: FileFetch(project: target.project, candidates: target.paths))
    }

    private var filename: String { (fetch.path as NSString).lastPathComponent }

    var body: some View {
        NavigationStack {
            Group {
                switch fetch.phase {
                case .loading:
                    loadingState
                case .failed(let message):
                    errorState(message)
                case .ready(let url, let kind, let truncated):
                    FilePreviewContent(url: url, kind: kind, truncated: truncated, line: target.line)
                }
            }
            .navigationTitle(filename)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                if case .ready(let url, _, false) = fetch.phase {
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: url)
                    }
                }
            }
        }
        .onAppear { if fetch.model == nil { fetch.start(model: model) } }
        .onDisappear { fetch.close() }
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.secondary)
            Text(filename)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(fetch.path)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .truncationMode(.middle)
                .multilineTextAlignment(.center)
            progress
                .padding(.top, 8)
        }
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder private var progress: some View {
        if let total = fetch.total, total > FileFetch.chunkSize {
            VStack(spacing: 6) {
                ProgressView(value: Double(fetch.received), total: Double(total))
                    .frame(maxWidth: 240)
                Text("\(Self.bytes(fetch.received)) of \(Self.bytes(total))")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        } else {
            ProgressView()
        }
    }

    private func errorState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't open the file", systemImage: "doc.questionmark")
        } description: {
            Text(message)
            Text(fetch.path)
                .font(.caption.monospaced())
                .lineLimit(3)
                .truncationMode(.middle)
        } actions: {
            Button("Retry") { fetch.retry() }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
    }

    private static func bytes(_ n: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: n, countStyle: .file)
    }
}
