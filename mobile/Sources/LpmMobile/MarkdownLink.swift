import Foundation

/// Where a link or image in a Markdown file points, read the way the desktop's
/// Files preview reads it: out of the app, within the page, or at another file —
/// relative to the Markdown file's own folder, or to the project root when it
/// starts with "/".
enum MarkdownLink: Equatable {
    case external(URL)
    case anchor
    /// Readings of the path, most likely first, for `FileFetch` to try in order.
    case file([String])

    static func resolve(_ href: String, from filePath: String) -> MarkdownLink {
        if href.hasPrefix("//") {
            return URL(string: "https:" + href).map { .external($0) } ?? .anchor
        }
        if hasScheme(href) {
            return URL(string: href).map { .external($0) } ?? .anchor
        }
        let raw = href.prefix { $0 != "#" && $0 != "?" }
        let target = String(raw).removingPercentEncoding ?? String(raw)
        guard !target.isEmpty else { return .anchor }
        // GitHub reads a leading "/" as the repository root; on a Mac it can just
        // as well be a real absolute path, so that reading comes second.
        if target.hasPrefix("/") {
            return .file([normalize(String(target.dropFirst())), normalize(target)])
        }
        let folder = (filePath as NSString).deletingLastPathComponent
        return .file([normalize(folder.isEmpty ? target : folder + "/" + target)])
    }

    private static func hasScheme(_ href: String) -> Bool {
        guard let colon = href.firstIndex(of: ":"), let first = href.first,
              first.isASCII, first.isLetter else { return false }
        return href[..<colon].allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "+.-".contains($0)) }
    }

    private static func normalize(_ path: String) -> String {
        let absolute = path.hasPrefix("/")
        var out: [Substring] = []
        for segment in path.split(separator: "/") {
            switch segment {
            case ".":
                continue
            case "..":
                if let last = out.last, last != "..", last != "~" {
                    out.removeLast()
                } else if !absolute {
                    out.append(segment)
                }
            default:
                out.append(segment)
            }
        }
        return (absolute ? "/" : "") + out.joined(separator: "/")
    }
}
