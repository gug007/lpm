import UniformTypeIdentifiers
import WebKit

/// Serves the images a Markdown file names by path (`lpm-file://image?src=…`,
/// rewritten by markdown.js) by fetching them from the Mac, the way the desktop
/// preview reads them from disk beside the file.
@MainActor
final class MarkdownImageLoader: NSObject, WKURLSchemeHandler {
    static let scheme = "lpm-file"

    weak var model: AppModel?
    var project = ""
    var path = ""
    private var fetches: [ObjectIdentifier: FileFetch] = [:]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url,
              let src = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "src" })?.value,
              case .file(let paths) = MarkdownLink.resolve(src, from: path),
              let model else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let key = ObjectIdentifier(task)
        let fetch = FileFetch(project: project, candidates: paths)
        fetches[key] = fetch
        fetch.onDone = { [weak self] phase in
            guard let fetch = self?.fetches.removeValue(forKey: key) else { return }
            Self.respond(task, url: url, phase: phase)
            fetch.close()
        }
        fetch.start(model: model)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        fetches.removeValue(forKey: ObjectIdentifier(task))?.close()
    }

    func cancelAll() {
        fetches.values.forEach { $0.close() }
        fetches.removeAll()
    }

    private static func respond(_ task: WKURLSchemeTask, url: URL, phase: FileFetch.Phase) {
        guard case .ready(let file, _, _) = phase, let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        task.didReceive(URLResponse(url: url, mimeType: mime,
                                    expectedContentLength: data.count, textEncodingName: nil))
        task.didReceive(data)
        task.didFinish()
    }
}
