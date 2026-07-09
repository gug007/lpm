import SwiftUI
import UIKit

/// A single file's unified diff, full-screen. The body is a UIKit both-axis
/// collection view (`DiffListView`) so an arbitrarily long diff scrolls smoothly
/// with cell reuse; the parsing + syntax highlighting that feeds it (`ParsedDiff`)
/// runs off the main thread and is shared with the inline diffs on the review
/// screen (which reuse `DiffLineRow`).
struct GitDiffView: View {
    @EnvironmentObject var model: AppModel
    let project: String
    let file: GitFile

    private var key: String { model.diffKey(project, file.path) }
    private var result: GitDiffResult? { model.gitDiffs[key] }
    private var error: String? { model.gitDiffError[key] }

    var body: some View {
        Group {
            if let result {
                if result.binary {
                    DiffPlaceholder(icon: "doc.badge.gearshape", title: "Binary file",
                                    message: "This file's contents can't be shown as text.")
                } else if result.diff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    DiffPlaceholder(icon: "doc.plaintext", title: "No changes",
                                    message: "There's nothing to show for this file.")
                } else if let parsed = model.parsedDiff(project, path: file.path) {
                    DiffContent(parsed: parsed, truncated: result.truncated)
                } else {
                    DiffLoadingView()
                }
            } else if let error {
                DiffErrorView(message: error) { model.loadGitDiff(project, path: file.path) }
            } else {
                DiffLoadingView()
            }
        }
        .navigationTitle((file.path as NSString).lastPathComponent)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.loadGitDiff(project, path: file.path) }
    }
}

enum DiffLineKind {
    case added, removed, hunk, context
}

struct DiffLine: Identifiable {
    let id: Int
    // Rendered code with the diff prefix stripped and the hunk's common indent
    // trimmed; for a hunk line, the trailing context snippet.
    let text: String
    let kind: DiffLineKind
    // Hunk line only: the compact "@@ <new-start>" label and the number of shared
    // leading whitespace columns trimmed from this hunk's code (0 = none).
    let hunkLabel: String
    let indentHint: Int
    // Gutter line numbers: old-file number for removed + context, new-file number
    // for added + context.
    let oldNumber: Int?
    let newNumber: Int?
    // The pre-highlighted attributed code (with any word-level emphasis backgrounds
    // baked in), built off the main thread; nil for hunk lines and until it lands.
    let attributed: NSAttributedString?
}

/// A diff parsed into classified, gutter-numbered lines with common indentation
/// trimmed per hunk, plus measured column widths and +/- stats. File-header noise
/// is dropped, syntax highlighting and word-level change emphasis are baked into
/// each line's attributed text — all off the main thread, cached per diffKey.
struct ParsedDiff {
    let lines: [DiffLine]
    let contentWidth: CGFloat
    let gutterWidth: CGFloat
    let addedCount: Int
    let removedCount: Int

    var totalWidth: CGFloat { gutterWidth + contentWidth }

    static let addedEmphasis = UIColor.systemGreen.withAlphaComponent(0.35)
    static let removedEmphasis = UIColor.systemRed.withAlphaComponent(0.35)

    init(_ diff: String, ext: String) {
        let base = Self.parse(diff)
        let emphasis = Self.computeEmphasis(base)
        var highlighter = DiffHighlighter(ext: ext)
        lines = base.enumerated().map { idx, line in
            guard line.kind != .hunk else { return line }
            let attr = NSMutableAttributedString(attributedString: highlighter.highlight(line.text))
            if let ranges = emphasis[idx] {
                let color = line.kind == .added ? Self.addedEmphasis : Self.removedEmphasis
                for r in ranges where r.location + r.length <= attr.length {
                    attr.addAttribute(.backgroundColor, value: color, range: r)
                }
            }
            return DiffLine(id: line.id, text: line.text, kind: line.kind, hunkLabel: line.hunkLabel,
                            indentHint: line.indentHint, oldNumber: line.oldNumber,
                            newNumber: line.newNumber, attributed: attr)
        }
        let longest = base.filter { $0.kind != .hunk }.map(\.text.count).max() ?? 0
        contentWidth = CGFloat(longest) * DiffTypography.charWidth + 20
        let maxNumber = base.map { max($0.oldNumber ?? 0, $0.newNumber ?? 0) }.max() ?? 0
        let digits = max(2, String(maxNumber).count)
        gutterWidth = CGFloat(digits) * DiffTypography.charWidth + 26
        addedCount = base.filter { $0.kind == .added }.count
        removedCount = base.filter { $0.kind == .removed }.count
    }

    /// Parses hunk by hunk so each hunk's common leading indentation is trimmed and
    /// old/new line numbers are assigned by walking from the header's start lines.
    static func parse(_ diff: String) -> [DiffLine] {
        let raw = diff.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var out: [DiffLine] = []
        var i = 0
        let n = raw.count
        while i < n {
            let line = raw[i]
            if isFileHeader(line) || line.hasPrefix("\\") { i += 1; continue }
            guard line.hasPrefix("@@") else { i += 1; continue }

            let header = parseHunkHeader(line)
            var codes: [(DiffLineKind, String)] = []
            var j = i + 1
            while j < n {
                let l = raw[j]
                if l.hasPrefix("@@") { break }
                if isFileHeader(l) || l.hasPrefix("\\") { j += 1; continue }
                codes.append(classify(l))
                j += 1
            }

            let indent = commonIndent(codes.compactMap { isBlank($0.1) ? nil : $0.1 })
            out.append(DiffLine(id: out.count, text: header.context, kind: .hunk,
                                hunkLabel: header.newStart > 0 ? "@@ \(header.newStart)" : "@@",
                                indentHint: indent.count, oldNumber: nil, newNumber: nil, attributed: nil))
            var oldNo = header.oldStart
            var newNo = header.newStart
            for (kind, content) in codes {
                let trimmed = stripIndent(content, indent: indent)
                var oldN: Int?
                var newN: Int?
                switch kind {
                case .added: newN = newNo; newNo += 1
                case .removed: oldN = oldNo; oldNo += 1
                case .context: oldN = oldNo; newN = newNo; oldNo += 1; newNo += 1
                case .hunk: break
                }
                out.append(DiffLine(id: out.count, text: trimmed, kind: kind, hunkLabel: "",
                                    indentHint: 0, oldNumber: oldN, newNumber: newN, attributed: nil))
            }
            i = j
        }
        return out
    }

    // MARK: line classification + indentation

    private static func classify(_ line: String) -> (DiffLineKind, String) {
        guard let first = line.first else { return (.context, "") }
        switch first {
        case "+": return (.added, String(line.dropFirst()))
        case "-": return (.removed, String(line.dropFirst()))
        default: return (.context, line.hasPrefix(" ") ? String(line.dropFirst()) : line)
        }
    }

    private static func isBlank(_ s: String) -> Bool { s.allSatisfy { $0 == " " || $0 == "\t" } }

    private static func leadingWhitespace(_ s: String) -> String {
        String(s.prefix { $0 == " " || $0 == "\t" })
    }

    private static func commonIndent(_ lines: [String]) -> String {
        guard var prefix = lines.first.map(leadingWhitespace) else { return "" }
        for line in lines.dropFirst() {
            let ac = Array(prefix), bc = Array(leadingWhitespace(line))
            var k = 0
            while k < ac.count && k < bc.count && ac[k] == bc[k] { k += 1 }
            prefix = String(ac[0..<k])
            if prefix.isEmpty { break }
        }
        return prefix
    }

    private static func stripIndent(_ content: String, indent: String) -> String {
        guard !indent.isEmpty else { return content }
        if content.hasPrefix(indent) { return String(content.dropFirst(indent.count)) }
        return isBlank(content) ? "" : content
    }

    private static func isFileHeader(_ line: String) -> Bool {
        line.hasPrefix("diff --git") || line.hasPrefix("index ")
            || line.hasPrefix("--- ") || line.hasPrefix("+++ ")
            || line.hasPrefix("new file") || line.hasPrefix("deleted file")
            || line.hasPrefix("rename ") || line.hasPrefix("copy ")
            || line.hasPrefix("similarity ") || line.hasPrefix("dissimilarity ")
            || line.hasPrefix("old mode") || line.hasPrefix("new mode")
    }

    /// The diff reduced to hunk headers and their +/- lines (file-header metadata
    /// dropped), for pasting into an agent prompt as a ```diff block.
    static func promptDiff(_ diff: String) -> String {
        diff.split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { !isFileHeader($0) && !$0.hasPrefix("\\") }
            .joined(separator: "\n")
    }

    private static func parseHunkHeader(_ line: String) -> (oldStart: Int, newStart: Int, context: String) {
        guard let open = line.range(of: "@@"),
              let close = line.range(of: "@@", range: open.upperBound..<line.endIndex) else {
            return (0, 0, "")
        }
        let middle = line[open.upperBound..<close.lowerBound]
        let context = String(line[close.upperBound...]).trimmingCharacters(in: .whitespaces)
        func number(after sign: Character) -> Int {
            guard let r = middle.range(of: String(sign)) else { return 0 }
            return Int(middle[r.upperBound...].prefix { $0.isNumber }) ?? 0
        }
        return (number(after: "-"), number(after: "+"), context)
    }

    // MARK: word-level emphasis

    /// Pairs each run of consecutive removed lines with the equal-length run of
    /// added lines that follows, and marks the differing middle span of each pair
    /// (character diff snapped out to word boundaries) for a deeper tint.
    private static func computeEmphasis(_ lines: [DiffLine]) -> [Int: [NSRange]] {
        var result: [Int: [NSRange]] = [:]
        var i = 0
        let n = lines.count
        while i < n {
            guard lines[i].kind == .removed else { i += 1; continue }
            var r = i
            while r < n && lines[r].kind == .removed { r += 1 }
            var a = r
            while a < n && lines[a].kind == .added { a += 1 }
            let removed = r - i
            let added = a - r
            if removed == added {
                for k in 0..<removed {
                    let (oldRange, newRange) = wordDiff(lines[i + k].text, lines[r + k].text)
                    if let oldRange { result[i + k, default: []].append(oldRange) }
                    if let newRange { result[r + k, default: []].append(newRange) }
                }
            }
            i = max(a, i + 1)
        }
        return result
    }

    private static func wordDiff(_ old: String, _ new: String) -> (NSRange?, NSRange?) {
        let o = Array(old), w = Array(new)
        if o.isEmpty || w.isEmpty { return (nil, nil) }
        var p = 0
        while p < o.count && p < w.count && o[p] == w[p] { p += 1 }
        var s = 0
        while s < o.count - p && s < w.count - p && o[o.count - 1 - s] == w[w.count - 1 - s] { s += 1 }
        if p == o.count && p == w.count { return (nil, nil) }
        while p > 0 && isWordChar(o[p - 1]) { p -= 1 }
        while s > 0 && isWordChar(o[o.count - s]) { s -= 1 }
        let oMid = (o.count - s) - p
        let wMid = (w.count - s) - p
        if oMid <= 0 && wMid <= 0 { return (nil, nil) }
        let oWhole = o.count > 0 && Double(oMid) >= 0.9 * Double(o.count)
        let wWhole = w.count > 0 && Double(wMid) >= 0.9 * Double(w.count)
        if oWhole && wWhole { return (nil, nil) }
        let oldRange = oMid > 0 ? nsRange(o, p, o.count - s) : nil
        let newRange = wMid > 0 ? nsRange(w, p, w.count - s) : nil
        return (oldRange, newRange)
    }

    private static func isWordChar(_ c: Character) -> Bool { c.isLetter || c.isNumber || c == "_" }

    private static func nsRange(_ chars: [Character], _ from: Int, _ to: Int) -> NSRange {
        let location = String(chars[0..<from]).utf16.count
        let length = String(chars[from..<to]).utf16.count
        return NSRange(location: location, length: length)
    }
}

/// One inline diff line: a hunk renders as a slim full-width band; every other line
/// renders a fixed-width gutter (line number + tinted +/- marker) followed by its
/// non-wrapping, syntax-highlighted code. Used by the capped inline diffs; the
/// full-screen view renders the same model through UIKit for large diffs.
struct DiffLineRow: View {
    let line: DiffLine
    let gutterWidth: CGFloat
    let contentWidth: CGFloat

    var body: some View {
        if line.kind == .hunk {
            HunkSeparator(label: line.hunkLabel, context: line.text, indent: line.indentHint,
                          width: gutterWidth + contentWidth)
        } else {
            HStack(spacing: 0) {
                DiffGutter(line: line, width: gutterWidth)
                lineText
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .frame(minWidth: contentWidth, alignment: .leading)
                    .background(Self.background(line.kind))
            }
        }
    }

    @ViewBuilder
    private var lineText: some View {
        if let attr = line.attributed {
            Text(AttributedString(attr))
        } else {
            Text(line.text.isEmpty ? " " : line.text)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(.primary)
        }
    }

    static func background(_ kind: DiffLineKind) -> Color {
        switch kind {
        case .added: return Color.green.opacity(0.16)
        case .removed: return Color.red.opacity(0.16)
        default: return .clear
        }
    }
}

/// The line-number gutter for one inline code row: number (old for removed, new
/// otherwise) plus the tinted +/- marker. Scrolls with the row inline; the
/// full-screen UIKit view pins its equivalent.
private struct DiffGutter: View {
    let line: DiffLine
    let width: CGFloat

    private var number: Int? { line.kind == .removed ? line.oldNumber : line.newNumber }
    private var marker: String {
        switch line.kind {
        case .added: return "+"
        case .removed: return "-"
        default: return " "
        }
    }
    private var markerColor: Color {
        switch line.kind {
        case .added: return .green
        case .removed: return .red
        default: return .clear
        }
    }

    var body: some View {
        HStack(spacing: 3) {
            Text(number.map(String.init) ?? "")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.tertiary)
                .frame(maxWidth: .infinity, alignment: .trailing)
            Text(marker)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(markerColor)
                .frame(width: 8, alignment: .leading)
        }
        .padding(.leading, 4)
        .padding(.trailing, 2)
        .frame(width: width)
        .background(Color(.secondarySystemBackground))
    }
}

/// A slim band marking a hunk boundary, with an optional "⇥ N" hint when common
/// indentation was trimmed from the hunk. Reads as a visual break, not code.
private struct HunkSeparator: View {
    let label: String
    let context: String
    let indent: Int
    let width: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
            if !context.isEmpty {
                Text(context)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 8)
            if indent > 0 {
                Text("⇥ \(indent)")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .frame(width: width, alignment: .leading)
        .background(Color(.secondarySystemFill))
    }
}

private struct DiffContent: View {
    let parsed: ParsedDiff
    let truncated: Bool

    var body: some View {
        VStack(spacing: 0) {
            if truncated {
                TruncatedNotice()
            }
            DiffListView(parsed: parsed)
        }
        .background(Color(.systemBackground))
    }
}

private struct TruncatedNotice: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "scissors")
            Text("This diff is large and was truncated.")
            Spacer()
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemBackground))
    }
}

private struct DiffPlaceholder: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(message)
        }
    }
}

private struct DiffLoadingView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading diff…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct DiffErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn't load the diff", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
        }
    }
}
