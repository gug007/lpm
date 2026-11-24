import Foundation

/// The answer each agent tab last ended a turn on, for reading it while the Mac is
/// away: a file in the app group's Caches, so it's never backed up, written by the app
/// while a Mac is live and by the notification extension from a finish's push.
enum AgentAnswerStore {
    struct Answer: Codable, Equatable {
        var text: String
        /// Millis the turn ended.
        var at: Int
        /// A push's, which is cut to what a push holds.
        var partial: Bool?

        /// Whether the answer of a turn that ended at `ended` is still worth asking for.
        func lacks(_ ended: Int) -> Bool { ended > at || (partial == true && ended == at) }
    }

    private static let appGroup = "group.cx.lpm.mobile"
    private static let maxTabs = 60
    private static let maxChars = 32_000

    private static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("Library/Caches/agent-answers.json")
    }

    /// One Mac's answers by terminal id.
    static func load(mac: String) -> [String: Answer] {
        guard let url, let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: [String: Answer]].self, from: data))?[mac] ?? [:]
    }

    /// Keeps the answers, by terminal id, newer than what's known.
    static func record(mac: String, _ answers: [String: Answer]) {
        let answers = answers.mapValues { answer in
            Answer(text: String(answer.text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxChars)),
                   at: answer.at, partial: answer.partial)
        }.filter { !$0.key.isEmpty && !$0.value.text.isEmpty }
        guard !mac.isEmpty, !answers.isEmpty else { return }
        update { macs in
            let known = macs[mac] ?? [:]
            let news = answers.filter { id, answer in
                guard let old = known[id] else { return true }
                return answer.partial == true ? answer.at > old.at : old.lacks(answer.at)
            }
            guard !news.isEmpty else { return false }
            let newest = known.merging(news) { $1 }.sorted { $0.value.at > $1.value.at }.prefix(maxTabs)
            macs[mac] = Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
            return true
        }
    }

    /// A finish's push: the answer it ended on.
    static func apply(push payload: [String: Any]) {
        guard (payload["target"] as? String ?? "terminal") == "terminal",
              let mac = payload["serverId"] as? String,
              let terminal = payload["terminalId"] as? String,
              let answer = payload["answer"] as? String,
              let at = (payload["ts"] as? NSNumber)?.intValue else { return }
        record(mac: mac, [terminal: Answer(text: answer, at: at, partial: true)])
    }

    /// Forget Macs the phone no longer has.
    static func keep(_ macs: Set<String>) {
        update { all in
            let before = all.count
            all = all.filter { macs.contains($0.key) }
            return all.count != before
        }
    }

    /// Read, change and write back under a file lock, so the app and the notification
    /// extension never overwrite each other's change.
    private static func update(_ change: (inout [String: [String: Answer]]) -> Bool) {
        guard let url else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var failure: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forMerging, error: &failure) { url in
            var all = (try? Data(contentsOf: url)).flatMap {
                try? JSONDecoder().decode([String: [String: Answer]].self, from: $0)
            } ?? [:]
            guard change(&all), let data = try? JSONEncoder().encode(all) else { return }
            try? data.write(to: url, options: .atomic)
        }
    }
}
