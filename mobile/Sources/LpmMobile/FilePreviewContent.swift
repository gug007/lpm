import QuickLook
import SwiftUI

/// The body of a loaded preview, picked by the file's kind.
struct FilePreviewContent: View {
    @Environment(AppModel.self) private var model
    let url: URL
    let project: String
    /// The file's path on the Mac, which links in a Markdown file resolve against.
    let path: String
    let kind: FilePreviewKind
    let truncated: Bool
    let line: Int
    // One choice for every Markdown file, remembered, like the desktop's.
    @AppStorage("filePreviewMarkdownSource") private var markdownSource = false
    @State private var text: String?
    @State private var linkedFile: FilePreviewTarget?

    var body: some View {
        switch kind {
        case .text:
            textView(markdown: false)
        case .markdown:
            textView(markdown: true)
                .safeAreaInset(edge: .top, spacing: 0) {
                    Picker("View", selection: $markdownSource) {
                        Text("Preview").tag(false)
                        Text("Source").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(.bar)
                }
                .sheet(item: $linkedFile) { FilePreviewSheet(target: $0).environment(model) }
        case .media:
            MediaPlayerView(url: url)
                .ignoresSafeArea(edges: .bottom)
        case .document:
            if QLPreviewController.canPreview(url as NSURL) {
                QuickLookView(url: url)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                ContentUnavailableView {
                    Label("No preview", systemImage: "doc")
                } description: {
                    Text("iPhone can't show this kind of file. Share it to open it in another app.")
                } actions: {
                    ShareLink(item: url) { Text("Share") }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                }
            }
        }
    }

    @ViewBuilder private func textView(markdown: Bool) -> some View {
        Group {
            if let text, text.isEmpty {
                ContentUnavailableView("Empty file", systemImage: "doc")
            } else if let text, markdown && !markdownSource {
                MarkdownWebView(text: text, project: project, path: path) { paths in
                    linkedFile = FilePreviewTarget(project: project, paths: paths)
                }
            } else if let text {
                ReadOnlyCodeView(text: text, ext: url.pathExtension, line: line)
            } else {
                ProgressView()
            }
        }
        .task(id: url) {
            let url = url
            text = await Task.detached {
                (try? Data(contentsOf: url)).map { String(decoding: $0, as: UTF8.self) } ?? ""
            }.value
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if truncated {
                Text("Showing the first 1 MB — this file is larger.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.bar)
            }
        }
    }
}
