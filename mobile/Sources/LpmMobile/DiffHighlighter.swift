import UIKit

/// Shared metrics for diff rendering, so the SwiftUI inline rows, the UIKit
/// full-screen list, and the width measurement all agree on the monospaced font.
enum DiffTypography {
    static let codeFont = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    static let gutterFont = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
    static let hunkLabelFont = UIFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
    static let hunkContextFont = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
    static let charWidth: CGFloat = ("0" as NSString).size(withAttributes: [.font: codeFont]).width
    static let codeRowHeight: CGFloat = ceil(codeFont.lineHeight) + 2
    static let hunkRowHeight: CGFloat = ceil(hunkContextFont.lineHeight) + 10
}

/// A best-effort, dependency-free per-line syntax highlighter keyed by file
/// extension. It classifies line/block comments, string literals, numbers, and
/// language keywords, and paints those on the token foreground — the green/red
/// row tints stay as background. Block-comment state is carried across lines
/// within one file's parse (best-effort when the opener isn't in a visible hunk).
/// Unknown extensions fall back to plain, uncolored text.
struct DiffHighlighter {
    enum Token { case plain, keyword, string, comment, number }

    private let spec: LanguageSpec
    private var inBlockComment = false

    init(ext: String) { spec = LanguageSpec.forExtension(ext) }

    mutating func highlight(_ line: String) -> NSAttributedString {
        if spec.isPlain || (line.isEmpty && !inBlockComment) {
            return NSAttributedString(string: line.isEmpty ? " " : line,
                                      attributes: attrs(.plain))
        }
        let chars = Array(line)
        let n = chars.count
        var runs: [(String, Token)] = []
        var plain = ""
        func flushPlain() {
            if !plain.isEmpty { runs.append((plain, .plain)); plain = "" }
        }

        var i = 0
        while i < n {
            if inBlockComment {
                var comment = ""
                while i < n {
                    if let close = spec.blockClose, Self.match(chars, i, close) {
                        comment += String(chars[i..<i + close.count])
                        i += close.count
                        inBlockComment = false
                        break
                    }
                    comment.append(chars[i]); i += 1
                }
                flushPlain(); runs.append((comment, .comment)); continue
            }

            let c = chars[i]

            if spec.lineComments.contains(where: { Self.match(chars, i, $0) }) {
                flushPlain(); runs.append((String(chars[i...]), .comment)); i = n; break
            }
            if let open = spec.blockOpen, Self.match(chars, i, open) {
                flushPlain(); runs.append((String(chars[i..<i + open.count]), .comment))
                i += open.count; inBlockComment = true; continue
            }
            if spec.strings.contains(c) {
                var str = String(c); i += 1
                while i < n {
                    let d = chars[i]
                    if d == "\\" && i + 1 < n { str.append(d); str.append(chars[i + 1]); i += 2; continue }
                    str.append(d); i += 1
                    if d == c { break }
                }
                flushPlain(); runs.append((str, .string)); continue
            }
            if c.isNumber && (i == 0 || !Self.isIdent(chars[i - 1])) {
                var num = ""
                while i < n && Self.isNumberChar(chars[i]) { num.append(chars[i]); i += 1 }
                flushPlain(); runs.append((num, .number)); continue
            }
            if Self.isIdentStart(c) {
                var word = ""
                while i < n && Self.isIdent(chars[i]) { word.append(chars[i]); i += 1 }
                flushPlain(); runs.append((word, spec.keywords.contains(word) ? .keyword : .plain)); continue
            }
            plain.append(c); i += 1
        }
        flushPlain()

        let out = NSMutableAttributedString()
        for (str, token) in runs {
            out.append(NSAttributedString(string: str, attributes: attrs(token)))
        }
        return out
    }

    private func attrs(_ token: Token) -> [NSAttributedString.Key: Any] {
        [.font: DiffTypography.codeFont, .foregroundColor: Self.color(token)]
    }

    // MARK: character classes

    private static func isIdentStart(_ c: Character) -> Bool { c.isLetter || c == "_" || c == "$" }
    private static func isIdent(_ c: Character) -> Bool { c.isLetter || c.isNumber || c == "_" || c == "$" }
    private static func isNumberChar(_ c: Character) -> Bool {
        c.isHexDigit || c == "." || c == "_" || "xXoObB".contains(c)
    }

    private static func match(_ chars: [Character], _ i: Int, _ token: String) -> Bool {
        let t = Array(token)
        guard i + t.count <= chars.count else { return false }
        for k in t.indices where chars[i + k] != t[k] { return false }
        return true
    }

    // MARK: colors (GitHub-ish, tuned muted; dynamic so dark/light adapt)

    private static func color(_ token: Token) -> UIColor {
        switch token {
        case .keyword: return keyword
        case .string: return string
        case .number: return number
        case .comment: return UIColor.secondaryLabel
        case .plain: return UIColor.label
        }
    }
    private static let keyword = dynamic(light: 0x9B2393, dark: 0xFF7AB2)
    private static let string = dynamic(light: 0xC41A16, dark: 0xFF8170)
    private static let number = dynamic(light: 0x1C00CF, dark: 0x79C0FF)

    private static func dynamic(light: Int, dark: Int) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) }
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

/// A language's lexical rules. `isPlain` short-circuits to uncolored text.
struct LanguageSpec {
    let keywords: Set<String>
    let lineComments: [String]
    let blockOpen: String?
    let blockClose: String?
    let strings: Set<Character>
    let isPlain: Bool

    init(keywords: Set<String> = [], lineComments: [String] = [],
         block: (String, String)? = nil, strings: Set<Character> = [], isPlain: Bool = false) {
        self.keywords = keywords
        self.lineComments = lineComments
        self.blockOpen = block?.0
        self.blockClose = block?.1
        self.strings = strings
        self.isPlain = isPlain
    }

    static func forExtension(_ ext: String) -> LanguageSpec {
        switch ext.lowercased() {
        case "swift": return swift
        case "rs": return rust
        case "js", "jsx", "mjs", "cjs", "ts", "tsx": return javascript
        case "json": return json
        case "yaml", "yml": return yaml
        case "css": return css
        case "scss", "sass", "less": return scss
        case "html", "htm", "xml", "vue", "svelte": return html
        case "py": return python
        case "go": return go
        case "rb": return ruby
        case "sh", "bash", "zsh", "fish": return shell
        default: return plain
        }
    }

    static let plain = LanguageSpec(isPlain: true)

    static let swift = LanguageSpec(
        keywords: ["let", "var", "func", "class", "struct", "enum", "protocol", "extension", "if",
                   "else", "guard", "switch", "case", "default", "for", "while", "repeat", "do",
                   "try", "catch", "throw", "throws", "rethrows", "return", "break", "continue",
                   "in", "is", "as", "nil", "true", "false", "self", "Self", "super", "init",
                   "deinit", "subscript", "typealias", "associatedtype", "import", "public",
                   "private", "internal", "fileprivate", "open", "static", "final", "lazy", "weak",
                   "unowned", "mutating", "nonmutating", "override", "convenience", "required",
                   "some", "any", "where", "defer", "async", "await", "actor", "inout"],
        lineComments: ["//"], block: ("/*", "*/"), strings: ["\""])

    static let rust = LanguageSpec(
        keywords: ["let", "mut", "fn", "struct", "enum", "trait", "impl", "mod", "pub", "use",
                   "crate", "self", "super", "if", "else", "match", "loop", "while", "for", "in",
                   "break", "continue", "return", "as", "const", "static", "ref", "move", "dyn",
                   "where", "type", "unsafe", "async", "await", "true", "false", "Some", "None",
                   "Ok", "Err", "Box", "Vec", "String", "str", "bool", "char", "usize", "isize",
                   "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64"],
        lineComments: ["//"], block: ("/*", "*/"), strings: ["\""])

    static let javascript = LanguageSpec(
        keywords: ["var", "let", "const", "function", "return", "if", "else", "for", "while", "do",
                   "switch", "case", "default", "break", "continue", "new", "delete", "typeof",
                   "instanceof", "in", "of", "class", "extends", "super", "this", "null",
                   "undefined", "true", "false", "void", "yield", "async", "await", "try", "catch",
                   "finally", "throw", "import", "export", "from", "as", "interface", "type", "enum",
                   "implements", "private", "public", "protected", "readonly", "static", "namespace",
                   "declare", "keyof", "infer"],
        lineComments: ["//"], block: ("/*", "*/"), strings: ["\"", "'", "`"])

    static let json = LanguageSpec(keywords: ["true", "false", "null"], strings: ["\""])

    static let yaml = LanguageSpec(
        keywords: ["true", "false", "null", "yes", "no", "on", "off"],
        lineComments: ["#"], strings: ["\"", "'"])

    static let css = LanguageSpec(block: ("/*", "*/"), strings: ["\"", "'"])

    static let scss = LanguageSpec(lineComments: ["//"], block: ("/*", "*/"), strings: ["\"", "'"])

    static let html = LanguageSpec(block: ("<!--", "-->"), strings: ["\"", "'"])

    static let python = LanguageSpec(
        keywords: ["def", "class", "return", "if", "elif", "else", "for", "while", "break",
                   "continue", "pass", "import", "from", "as", "with", "try", "except", "finally",
                   "raise", "lambda", "yield", "global", "nonlocal", "in", "is", "not", "and", "or",
                   "None", "True", "False", "self", "async", "await", "del", "assert"],
        lineComments: ["#"], strings: ["\"", "'"])

    static let go = LanguageSpec(
        keywords: ["func", "package", "import", "var", "const", "type", "struct", "interface",
                   "map", "chan", "go", "defer", "if", "else", "for", "range", "switch", "case",
                   "default", "break", "continue", "return", "select", "fallthrough", "nil", "true",
                   "false", "iota", "string", "int", "int64", "bool", "byte", "rune", "error"],
        lineComments: ["//"], block: ("/*", "*/"), strings: ["\"", "`"])

    static let ruby = LanguageSpec(
        keywords: ["def", "end", "class", "module", "if", "elsif", "else", "unless", "case", "when",
                   "while", "until", "for", "in", "do", "begin", "rescue", "ensure", "raise",
                   "return", "yield", "next", "break", "then", "self", "nil", "true", "false",
                   "and", "or", "not", "require", "require_relative", "attr_accessor", "attr_reader",
                   "attr_writer", "lambda", "proc"],
        lineComments: ["#"], strings: ["\"", "'"])

    static let shell = LanguageSpec(
        keywords: ["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
                   "case", "esac", "function", "in", "return", "select", "break", "continue",
                   "export", "local", "readonly", "source", "alias", "echo"],
        lineComments: ["#"], strings: ["\"", "'"])
}
