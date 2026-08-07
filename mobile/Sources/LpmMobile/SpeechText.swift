import Foundation

/// One spoken unit — a sentence, list item, or table row — tagged with the
/// markdown block it came from so the reader can highlight what it is saying.
struct SpeechSegment: Identifiable {
    let id: Int
    let blockID: Int
    let text: String
    /// Extra silence after this segment. Headings and list items get a beat so a
    /// document doesn't arrive as one unbroken sentence.
    let pause: TimeInterval
}

/// Turns an automation's markdown into text worth listening to. Read literally, a
/// result is unlistenable: heading hashes become "hash hash hash" and a single
/// link swallows twenty seconds of URL. Link targets, emphasis markers, fences and
/// rules all come out; link text, list items and table cells stay.
enum SpeechText {
    static func segments(_ markdown: String) -> [SpeechSegment] {
        var out: [SpeechSegment] = []

        func emit(_ text: String, block: Int, pause: TimeInterval) {
            let cleaned = clean(text)
            guard speakable(cleaned) else { return }
            out.append(SpeechSegment(id: out.count, blockID: block, text: cleaned, pause: pause))
        }

        for block in MarkdownBlock.parse(markdown) {
            // Notation is removed before sentences are found, not after: the "!" of
            // an image ends a sentence as far as the tokenizer is concerned, which
            // splits the syntax in half and leaves the halves unrecognizable.
            let text = stripNotation(block.text)
            switch block.kind {
            case .code, .rule:
                continue // a fence read aloud is noise, not information
            case .heading:
                emit(text, block: block.id, pause: 0.5)
            case .listItem:
                let parts = sentences(text)
                for (i, s) in parts.enumerated() {
                    emit(s, block: block.id, pause: i == parts.count - 1 ? 0.35 : 0.1)
                }
            case .paragraph:
                emitParagraph(text, id: block.id, emit: emit)
            }
        }
        return out
    }

    private static func emitParagraph(_ text: String, id: Int,
                                      emit: (String, Int, TimeInterval) -> Void) {
        let lines = text.components(separatedBy: "\n")
        // A pipe table arrives here as an ordinary paragraph — the renderer has no
        // table block — so its rows would otherwise be read pipe by pipe.
        if lines.contains(where: { $0.trimmingCharacters(in: .whitespaces).hasPrefix("|") }) {
            for line in lines {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("|") {
                    if let row = tableRow(trimmed) { emit(row, id, 0.35) }
                } else {
                    emit(trimmed, id, 0.2)
                }
            }
            return
        }

        let joined = lines.joined(separator: " ")
        let parts = sentences(joined)
        for (i, s) in parts.enumerated() {
            emit(s, id, i == parts.count - 1 ? 0.3 : 0.1)
        }
    }

    /// Table cells joined into a phrase. Returns nil for the `|---|:--:|` separator
    /// row, which carries no words.
    private static func tableRow(_ line: String) -> String? {
        var body = Substring(line)
        if body.hasPrefix("|") { body = body.dropFirst() }
        if body.hasSuffix("|") { body = body.dropLast() }
        // Cells with no word in them — a "#" column header, a dash placeholder —
        // are noise read aloud, and a row of only those is the separator.
        let cells = body.components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter(speakable)
        guard !cells.isEmpty else { return nil }
        return cells.joined(separator: ", ")
    }

    private static func sentences(_ text: String) -> [String] {
        guard !text.isEmpty else { return [] }
        var out: [String] = []
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex,
                                 options: [.bySentences, .localized]) { sub, _, _, _ in
            let s = sub?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !s.isEmpty { out.append(s) }
        }
        return out.isEmpty ? [text] : out
    }

    /// Strip everything that is notation rather than words. Foundation's inline
    /// parser does the well-formed cases — for `[text](url)` it keeps `text` and
    /// moves the target into an attribute — but plenty of markdown never reaches it
    /// intact: unclosed emphasis, task boxes, blockquote arrows, HTML, footnotes.
    /// So the passes below narrow from "syntax I recognize" down to a final rule
    /// that no token without a letter or digit in it is ever spoken.
    private static func clean(_ text: String) -> String {
        var s = inlinePlain(text)
        s = s.replacingOccurrences(of: urlPattern, with: " ", options: .regularExpression)
        s = despecial(s)
        s = dropWordlessTokens(s)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Block-level syntax that has to go before the text is cut into sentences,
    /// because each of these contains punctuation the sentence tokenizer treats as
    /// a boundary. An image keeps its alt text — that is real prose, and dropping it
    /// leaves a hole in the sentence around it.
    private static func stripNotation(_ text: String) -> String {
        // A link definition (`[ref]: https://…`) is markdown plumbing: nothing is
        // left to say once the URL is gone.
        var s = text.components(separatedBy: "\n")
            .filter { $0.range(of: linkDefinitionPattern, options: .regularExpression) == nil }
            .joined(separator: "\n")
        s = s.replacingOccurrences(of: imagePattern, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: footnotePattern, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: htmlTagPattern, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: taskBoxPattern, with: " ", options: .regularExpression)
        return s
    }

    private static let urlPattern = "(?i)\\b(?:https?://|www\\.)\\S+"
    private static let imagePattern = "!\\[([^\\]]*)\\]\\([^)]*\\)"
    private static let footnotePattern = "\\[\\^[^\\]]*\\]"
    private static let htmlTagPattern = "</?[A-Za-z][^>]*>"
    /// A task-list box at the start of a list item: `[ ]`, `[x]`, `[X]`.
    private static let taskBoxPattern = "^\\s*\\[[ xX]?\\]\\s*"
    private static let linkDefinitionPattern = "^\\s*\\[[^\\]]+\\]:\\s*\\S*\\s*$"

    /// Markdown punctuation that glues to words (`**bold**`, `` `code` ``) is
    /// deleted; punctuation that separates words (`a|b`, `> quote`) becomes a space
    /// so the words don't run together. Decorative symbols — check marks, arrows,
    /// box drawing, emoji — go too: spoken, they become "check mark", "rightwards
    /// arrow", "black square".
    private static func despecial(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for scalar in text.unicodeScalars {
            if deletedScalars.contains(scalar) { continue }
            if spacedScalars.contains(scalar) || isDecorativeSymbol(scalar) {
                out.append(" ")
                continue
            }
            out.append(scalar)
        }
        return String(out)
    }

    private static let deletedScalars = CharacterSet(charactersIn: "*`~^\\\u{200D}")
        .union(CharacterSet(charactersIn: "\u{FE00}"..."\u{FE0F}"))
    private static let spacedScalars = CharacterSet(charactersIn: "_|<>[]{}=#")

    private static func isDecorativeSymbol(_ scalar: Unicode.Scalar) -> Bool {
        // "+" reads as "plus" in "+15.4%", which is meaning, not decoration.
        if scalar == "+" { return false }
        switch scalar.properties.generalCategory {
        case .otherSymbol, .modifierSymbol, .mathSymbol:
            return true
        default:
            return scalar.properties.isEmoji && scalar.properties.isEmojiPresentation
        }
    }

    /// The safety net. Whatever the passes above missed, a run of characters with no
    /// letter or digit in it is notation — a stray bullet, an orphan dash, the "()"
    /// left where a link used to be — and is dropped rather than pronounced.
    private static func dropWordlessTokens(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace)
            .filter { $0.rangeOfCharacter(from: .alphanumerics) != nil }
            .joined(separator: " ")
    }

    private static func inlinePlain(_ text: String) -> String {
        let options = AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: true,
            interpretedSyntax: .inlineOnlyPreservingWhitespace,
            failurePolicy: .returnPartiallyParsedIfPossible)
        guard let attributed = try? AttributedString(markdown: text, options: options) else {
            return text
        }
        return String(attributed.characters)
    }

    /// Anything with no letter or digit in it — a rule, a lone bullet, a separator
    /// row — is silence, not speech.
    private static func speakable(_ text: String) -> Bool {
        text.rangeOfCharacter(from: .alphanumerics) != nil
    }
}
