import SwiftUI

/// A dependency-free renderer for the markdown subset lpm documents actually use:
/// ATX headings, bullet and numbered lists, fenced code blocks, thematic breaks,
/// and inline code / bold / italic. Block structure is parsed here; inline spans
/// are handed to Foundation's own markdown parser, so emphasis and escaping match
/// the rest of the platform.
struct MarkdownText: View {
    private let blocks: [MarkdownBlock]
    /// The block being read aloud, if any. Block ids come from the shared parse, so
    /// the reader and the renderer agree on what "this block" means.
    private let speakingBlock: Int?

    init(_ text: String, speakingBlock: Int? = nil) {
        blocks = MarkdownBlock.parse(text)
        self.speakingBlock = speakingBlock
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(blocks) { block in
                row(block)
                    .background(highlight(block), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func row(_ block: MarkdownBlock) -> some View {
        switch block.kind {
        case .heading(let level):
            Text(MarkdownInline.render(block.text))
                .font(Self.headingFont(level))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, level <= 2 ? 8 : 2)
        case .paragraph:
            Text(MarkdownInline.render(block.text))
                .font(.callout)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .listItem(let marker, let depth):
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text(marker)
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                Text(MarkdownInline.render(block.text))
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.leading, CGFloat(depth) * 16)
        case .code:
            codeBlock(block.text)
        case .rule:
            Divider().padding(.vertical, 2)
        }
    }

    private func codeBlock(_ code: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(.system(.footnote, design: .monospaced))
                .padding(10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    /// Code blocks paint their own background and are never spoken, so they stay
    /// out of the highlight.
    private func highlight(_ block: MarkdownBlock) -> Color {
        guard block.id == speakingBlock, !block.isCode else { return .clear }
        return Color.accentColor.opacity(0.14)
    }

    private static func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title3.weight(.bold)
        case 2: return .headline
        case 3: return .subheadline.weight(.semibold)
        default: return .footnote.weight(.semibold)
        }
    }
}

// MARK: - Blocks

/// Shared by the renderer and by SpeechText, so a block has one identity whether
/// it is being drawn or spoken.
struct MarkdownBlock: Identifiable {
    enum Kind {
        case heading(Int)
        case paragraph
        case listItem(marker: String, depth: Int)
        case code
        case rule
    }

    let id: Int
    let kind: Kind
    let text: String

    var isCode: Bool { if case .code = kind { return true }; return false }
}

extension MarkdownBlock {
    /// Single pass over the lines: a fence swallows everything up to its closing
    /// fence, a blank line ends a paragraph, and anything unrecognized is
    /// paragraph text. Soft line breaks inside a paragraph are kept, because
    /// these documents use them as real breaks.
    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var fenced: [String]?
        var nextId = 0

        func emit(_ kind: Kind, _ text: String) {
            blocks.append(MarkdownBlock(id: nextId, kind: kind, text: text))
            nextId += 1
        }
        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            emit(.paragraph, paragraph.joined(separator: "\n"))
            paragraph = []
        }

        for line in source.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                if let open = fenced {
                    emit(.code, open.joined(separator: "\n"))
                    fenced = nil
                } else {
                    flushParagraph()
                    fenced = []
                }
                continue
            }
            if fenced != nil {
                fenced?.append(line)
                continue
            }
            if trimmed.isEmpty {
                flushParagraph()
                continue
            }
            if isRule(trimmed) {
                flushParagraph()
                emit(.rule, "")
                continue
            }
            if let heading = heading(trimmed) {
                flushParagraph()
                emit(.heading(heading.level), heading.text)
                continue
            }
            if let item = listItem(line) {
                flushParagraph()
                emit(.listItem(marker: item.marker, depth: item.depth), item.text)
                continue
            }
            paragraph.append(trimmed)
        }

        if let open = fenced { emit(.code, open.joined(separator: "\n")) }
        flushParagraph()
        return blocks
    }

    private static func isRule(_ trimmed: String) -> Bool {
        guard trimmed.count >= 3, let first = trimmed.first,
              first == "-" || first == "*" || first == "_" else { return false }
        return trimmed.allSatisfy { $0 == first }
    }

    private static func heading(_ trimmed: String) -> (level: Int, text: String)? {
        var level = 0
        var rest = Substring(trimmed)
        while rest.first == "#", level < 6 {
            level += 1
            rest = rest.dropFirst()
        }
        guard level > 0, rest.isEmpty || rest.first == " " else { return nil }
        return (level, rest.trimmingCharacters(in: .whitespaces))
    }

    private static func listItem(_ line: String) -> (marker: String, depth: Int, text: String)? {
        let indent = line.prefix { $0 == " " || $0 == "\t" }.count
        let body = line.dropFirst(indent)
        let depth = min(3, indent / 2)

        if let first = body.first, first == "-" || first == "*" || first == "+" {
            let rest = body.dropFirst()
            guard rest.first == " " else { return nil }
            return ("•", depth, rest.trimmingCharacters(in: .whitespaces))
        }

        let digits = body.prefix { $0.isNumber }
        guard !digits.isEmpty else { return nil }
        let afterDigits = body.dropFirst(digits.count)
        guard afterDigits.first == ".", afterDigits.dropFirst().first == " " else { return nil }
        return (String(digits) + ".", depth,
                afterDigits.dropFirst().trimmingCharacters(in: .whitespaces))
    }
}

// MARK: - Inline spans

private enum MarkdownInline {
    /// Emphasis and links are left to SwiftUI's own handling of the parsed
    /// presentation intents; only inline code needs painting, since a code span
    /// carries no font of its own.
    static func render(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: true,
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible)
        guard var attributed = try? AttributedString(markdown: text, options: options) else {
            return AttributedString(text)
        }
        let codeRanges = attributed.runs.compactMap { run -> Range<AttributedString.Index>? in
            (run.inlinePresentationIntent?.contains(.code) ?? false) ? run.range : nil
        }
        for range in codeRanges {
            attributed[range].font = .system(.callout, design: .monospaced)
            attributed[range].foregroundColor = SwiftUI.Color.accentColor
        }
        return attributed
    }
}
