import Foundation

/// One answer a terminal's agent gave, as the raw markdown it wrote, so a copy
/// keeps tables and code fences. `at` is unix millis, nil when the transcript
/// record carried no timestamp.
struct RecentAnswer {
    let text: String
    let at: Int?

    init(_ o: [String: Any]) {
        text = o["text"] as? String ?? ""
        at = o["at"] as? Int
    }

    /// The first meaningful line, stripped of markdown furniture, so a row reads
    /// like a sentence rather than a heading marker. Mirrors the desktop's
    /// answerPreview.
    var preview: String {
        for line in text.split(separator: "\n") {
            let plain = line.drop { " \t#>*`-".contains($0) }.trimmingCharacters(in: .whitespaces)
            if !plain.isEmpty { return plain }
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension Wire {
    static func answers(id: String, project: String, limit: Int, reqId: String) -> String {
        json(["t": "answers", "id": id, "project": project, "limit": limit, "reqId": reqId])
    }
}
