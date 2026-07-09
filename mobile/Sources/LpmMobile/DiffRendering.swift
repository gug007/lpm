import SwiftUI
import UIKit

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
}

enum DiffBlockKind { case hunk, code }

/// One render unit: a hunk separator, or a run of code lines merged into a single
/// gutter attributed string (line numbers, deeper tint) and a single code
/// attributed string (leading +/- marker, syntax highlighting, row tint padded to
/// the block's longest line, word-level emphasis). Built off the main thread.
struct DiffBlock: Identifiable {
    let id: Int
    let kind: DiffBlockKind
    let hunkLabel: String
    let hunkContext: String
    let indentHint: Int
    let gutter: NSAttributedString
    let code: NSAttributedString
    let lineCount: Int
}

/// A diff parsed into per-hunk merged blocks (for horizontal-scroll rendering with
/// a pinned gutter) plus a flat line list for counts/stats. Common indentation is
/// trimmed per hunk, file headers dropped, and marker + syntax highlighting +
/// word-level emphasis baked in — all off the main thread, cached per diffKey.
struct ParsedDiff {
    let lines: [DiffLine]
    let blocks: [DiffBlock]
    let addedCount: Int
    let removedCount: Int

    init(_ diff: String, ext: String) {
        let base = Self.parse(diff)
        let emphasis = Self.computeEmphasis(base)
        var highlighter = DiffHighlighter(ext: ext)
        var fg: [NSAttributedString?] = Array(repeating: nil, count: base.count)
        for (idx, line) in base.enumerated() where line.kind != .hunk {
            fg[idx] = highlighter.highlight(line.text)
        }
        lines = base
        let maxNumber = base.map { max($0.oldNumber ?? 0, $0.newNumber ?? 0) }.max() ?? 0
        let digits = max(2, String(maxNumber).count)
        addedCount = base.filter { $0.kind == .added }.count
        removedCount = base.filter { $0.kind == .removed }.count
        blocks = Self.buildBlocks(base: base, fg: fg, emphasis: emphasis, digits: digits)
    }

    private static func marker(_ kind: DiffLineKind) -> String {
        switch kind {
        case .added: return "+"
        case .removed: return "-"
        default: return " "
        }
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
                                indentHint: indent.count, oldNumber: nil, newNumber: nil))
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
                                    indentHint: 0, oldNumber: oldN, newNumber: newN))
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

    // MARK: per-hunk merged blocks

    private static func buildBlocks(base: [DiffLine], fg: [NSAttributedString?],
                                    emphasis: [Int: [NSRange]], digits: Int) -> [DiffBlock] {
        var blocks: [DiffBlock] = []
        let empty = NSAttributedString()
        var id = 0
        var i = 0
        let n = base.count
        while i < n {
            let line = base[i]
            if line.kind == .hunk {
                blocks.append(DiffBlock(id: id, kind: .hunk, hunkLabel: line.hunkLabel,
                                        hunkContext: line.text, indentHint: line.indentHint,
                                        gutter: empty, code: empty, lineCount: 0))
                id += 1; i += 1
                continue
            }
            var j = i
            while j < n && base[j].kind != .hunk { j += 1 }
            let code = buildCodeBlock(range: i..<j, base: base, fg: fg, emphasis: emphasis)
            let gutter = buildGutterBlock(range: i..<j, base: base, digits: digits)
            blocks.append(DiffBlock(id: id, kind: .code, hunkLabel: "", hunkContext: "",
                                    indentHint: 0, gutter: gutter, code: code, lineCount: j - i))
            id += 1; i = j
        }
        return blocks
    }

    /// One attributed string for a run of code lines: leading +/- marker, the
    /// syntax-highlighted code, right-padded with spaces to the block's longest
    /// line so the row tint (and deeper emphasis tint over it) span a uniform
    /// width, joined by newlines. Monospaced, so the padded backgrounds align.
    private static func buildCodeBlock(range: Range<Int>, base: [DiffLine], fg: [NSAttributedString?],
                                       emphasis: [Int: [NSRange]]) -> NSAttributedString {
        let plain: [NSAttributedString.Key: Any] = [.font: DiffTypography.codeFont, .foregroundColor: UIColor.label]
        var pieces: [NSMutableAttributedString] = []
        var maxLen = 0
        for idx in range {
            let piece = NSMutableAttributedString(string: marker(base[idx].kind), attributes: plain)
            piece.append(fg[idx] ?? NSAttributedString(string: base[idx].text, attributes: plain))
            pieces.append(piece)
            maxLen = max(maxLen, piece.length)
        }
        let out = NSMutableAttributedString()
        for (k, idx) in range.enumerated() {
            let line = pieces[k]
            let padCount = maxLen - line.length
            if padCount > 0 {
                line.append(NSAttributedString(string: String(repeating: " ", count: padCount), attributes: plain))
            }
            if let tint = DiffPalette.rowUI(base[idx].kind) {
                line.addAttribute(.backgroundColor, value: tint, range: NSRange(location: 0, length: line.length))
            }
            let emColor = base[idx].kind == .added ? DiffPalette.addWord : DiffPalette.delWord
            for r in emphasis[idx] ?? [] {
                let shifted = NSRange(location: r.location + 1, length: r.length)
                if shifted.location + shifted.length <= line.length {
                    line.addAttribute(.backgroundColor, value: emColor, range: shifted)
                }
            }
            out.append(line)
            if idx != range.upperBound - 1 { out.append(NSAttributedString(string: "\n", attributes: plain)) }
        }
        return out
    }

    private static func buildGutterBlock(range: Range<Int>, base: [DiffLine], digits: Int) -> NSAttributedString {
        let out = NSMutableAttributedString()
        for idx in range {
            let line = base[idx]
            let number = line.kind == .removed ? line.oldNumber : line.newNumber
            let text = (number.map(String.init) ?? "").leftPadded(digits) + "  "
            let piece = NSMutableAttributedString(string: text, attributes: [
                .font: DiffTypography.codeFont, .foregroundColor: UIColor.secondaryLabel,
            ])
            piece.addAttribute(.backgroundColor, value: DiffPalette.gutterUI(line.kind),
                               range: NSRange(location: 0, length: piece.length))
            out.append(piece)
            if idx != range.upperBound - 1 { out.append(NSAttributedString(string: "\n")) }
        }
        return out
    }
}

/// One hunk's merged code beside its pinned gutter: the gutter (line numbers,
/// deeper tint) stays fixed at the left while the code column scrolls horizontally.
struct DiffCodeBlock: View {
    let block: DiffBlock

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(AttributedString(block.gutter))
                .fixedSize()
            ScrollView(.horizontal, showsIndicators: false) {
                Text(AttributedString(block.code))
                    .fixedSize()
                    .padding(.trailing, 12)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A slim full-bleed band marking a hunk boundary, with an optional "⇥ N" hint
/// when common indentation was trimmed from the hunk.
struct HunkSeparator: View {
    let label: String
    let context: String
    let indent: Int

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
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// GitHub-style opaque pastel diff colors, dynamic for light/dark. Row backgrounds
/// go behind the code, gutter is a deeper shade, and word (emphasis) tints layer
/// on top of the row background — all baked into the block attributed strings.
enum DiffPalette {
    static func rowUI(_ kind: DiffLineKind) -> UIColor? {
        switch kind {
        case .added: return addRow
        case .removed: return delRow
        default: return nil
        }
    }

    static func gutterUI(_ kind: DiffLineKind) -> UIColor {
        switch kind {
        case .added: return addGutter
        case .removed: return delGutter
        default: return contextGutter
        }
    }

    static let addWord = dynamic(light: 0xABF2BC, dark: 0x2A6435)
    static let delWord = dynamic(light: 0xFDB8C0, dark: 0x78353B)

    private static let addRow = dynamic(light: 0xE6FFEC, dark: 0x12261E)
    private static let delRow = dynamic(light: 0xFFEBE9, dark: 0x25171C)
    private static let addGutter = dynamic(light: 0xCCFFD8, dark: 0x03351A)
    private static let delGutter = dynamic(light: 0xFFD7D5, dark: 0x4A1418)
    private static let contextGutter = dynamic(light: 0xF6F8FA, dark: 0x161B22)

    private static func dynamic(light: Int, dark: Int) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) }
    }
}

private extension String {
    func leftPadded(_ width: Int) -> String {
        count >= width ? self : String(repeating: " ", count: width - count) + self
    }
}

private extension UIColor {
    convenience init(rgb: Int) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255,
                  alpha: 1)
    }
}
