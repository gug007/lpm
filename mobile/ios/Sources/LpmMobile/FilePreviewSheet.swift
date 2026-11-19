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
    /// Puts an `@path:line` mention in the prompt of the tab the file was opened
    /// from; nil where there's no prompt to put it in.
    var onMention: ((String) -> Void)? = nil
    @State private var fetch: FileFetch
    @State private var codeView = CodeViewHandle()
    @State private var showDiff = false
    @State private var editing: URL?

    init(target: FilePreviewTarget, onMention: ((String) -> Void)? = nil) {
        self.target = target
        self.onMention = onMention
        _fetch = State(initialValue: FileFetch(project: target.project, candidates: target.paths))
    }

    private var filename: String { (fetch.path as NSString).lastPathComponent }

    /// The file as git lists it, when it has changes.
    private var changedFile: GitFile? {
        guard let projectPath else { return nil }
        return model.git.snapshots[target.project]?.files.first { $0.path == projectPath }
    }

    /// The path the project knows the file by, as the Mac names it; nil outside
    /// the project. From a Mac that doesn't say, only a relative path counts.
    private var projectPath: String? {
        if let named = fetch.projectPath { return named.isEmpty ? nil : named }
        return relativeProjectPath(fetch.path)
    }

    /// The name to mention or copy: the project's, else the path on the Mac.
    private var shownPath: String { projectPath ?? fetch.path }

    private var subtitle: String {
        let folder = (shownPath as NSString).deletingLastPathComponent
        return [folder, target.line > 0 ? "line \(target.line)" : ""]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var isReady: Bool {
        if case .ready = fetch.phase { return true }
        return false
    }

    /// A whole, small text file in the project, on a Mac that saves edits.
    private var editableURL: URL? {
        guard model.gitExtras.canWriteFiles, projectPath != nil,
              case .ready(let url, let kind, false) = fetch.phase, kind.isText,
              (fetch.total ?? 0) <= FileEditScreen.maxBytes else { return nil }
        return url
    }

    var body: some View {
        NavigationStack {
            Group {
                switch fetch.phase {
                case .loading:
                    loadingState
                case .failed(let message):
                    errorState(message)
                case .ready(let url, let kind, let truncated):
                    FilePreviewContent(url: url, project: target.project, path: fetch.path,
                                       kind: kind, truncated: truncated, line: target.line,
                                       codeView: codeView, onMention: onMention)
                }
            }
            .navigationTitle(filename)
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if isReady {
                    FilePreviewActions(
                        onMention: onMention.map { mention in { mentionFile(mention) } },
                        onDiff: changedFile == nil ? nil : { showDiff = true },
                        onFind: codeView.attached ? { codeView.find() } : nil,
                        onEdit: editableURL.map { url in { editing = url } },
                        onCopyPath: { UIPasteboard.general.string = shownPath })
                }
            }
            .navigationDestination(item: $editing) { url in
                if let projectPath {
                    FileEditScreen(project: target.project, path: projectPath, url: url) {
                        fetch.retry()
                        model.git.changed(target.project)
                    }
                    .environment(model)
                }
            }
            .navigationDestination(isPresented: $showDiff) {
                if let project = model.projects.first(where: { $0.name == target.project }) {
                    GitReviewView(project: project, focus: changedFile?.path)
                        .environment(model)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(filename).font(.headline).lineLimit(1)
                        if !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .truncationMode(.head)
                        }
                    }
                }
                if case .ready(let url, _, false) = fetch.phase {
                    ToolbarItem(placement: .primaryAction) {
                        ShareLink(item: url)
                    }
                }
            }
        }
        .onAppear {
            if fetch.model == nil { fetch.start(model: model) }
            if model.git.snapshots[target.project] == nil { model.git.load(target.project) }
        }
        .onDisappear { fetch.close() }
    }

    private func mentionFile(_ mention: (String) -> Void) {
        let line = target.line > 0 ? ":\(target.line)" : ""
        mention("@\(shownPath)\(line)")
        Haptics.tap()
        dismiss()
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

/// A tapped path read as the project's: a relative one, without its `./`. Nil for
/// an absolute, `~/…` or `../…` path, which may name a file anywhere.
func relativeProjectPath(_ path: String) -> String? {
    guard !path.isEmpty, !path.hasPrefix("/"), !path.hasPrefix("~") else { return nil }
    let rel = path.hasPrefix("./") ? String(path.dropFirst(2)) : path
    return rel.hasPrefix("../") || rel == ".." ? nil : rel
}
