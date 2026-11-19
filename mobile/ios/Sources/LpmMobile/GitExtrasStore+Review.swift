import Foundation

/// The review on the branch's pull request, why a check failed, and saving an
/// edit from the file preview.
extension GitExtrasStore {
    var canReadDiscussion: Bool { has(LpmClient.gitPrDiscussionFeature) }
    var canReadCheckLogs: Bool { has(LpmClient.gitCheckLogFeature) }
    var canWriteFiles: Bool { has(LpmClient.writeFileFeature) }

    /// Asks again at most once a minute unless `fresh`, as the CI row does.
    func loadDiscussion(_ project: String, fresh: Bool = false) {
        guard canReadDiscussion else { return }
        if !fresh, let at = discussionAsked[project], Date().timeIntervalSince(at) < 55 { return }
        discussionAsked[project] = Date()
        client?.requestPrDiscussion(project: project)
    }

    func applyDiscussion(_ reply: PrDiscussionReply) {
        guard reply.error == nil else { return }
        discussions[reply.project] = reply.discussion
    }

    func logKey(_ project: String, url: String) -> String { project + "\n" + url }

    func loadCheckLog(_ project: String, url: String) {
        let key = logKey(project, url: url)
        guard canReadCheckLogs, !checkLogLoading.contains(key) else { return }
        checkLogLoading.insert(key)
        checkLogErrors[key] = nil
        client?.requestCheckLog(project: project, url: url)
        timeout.arm("log\u{0}" + key, seconds: 45) { [weak self] in
            guard let self, self.checkLogLoading.remove(key) != nil else { return }
            self.checkLogErrors[key] = "Couldn't read the log. Try again."
        }
    }

    func applyCheckLog(_ reply: CheckLogReply) {
        let key = logKey(reply.project, url: reply.url)
        timeout.cancel("log\u{0}" + key)
        checkLogLoading.remove(key)
        if let log = reply.log {
            checkLogs[key] = log
        } else {
            checkLogErrors[key] = reply.error
        }
    }

    /// The CI sheet asked again: a re-run's logs are new.
    func forgetCheckLogs(_ project: String) {
        let prefix = project + "\n"
        for key in Array(checkLogs.keys) where key.hasPrefix(prefix) { checkLogs[key] = nil }
        for key in Array(checkLogErrors.keys) where key.hasPrefix(prefix) { checkLogErrors[key] = nil }
    }

    func save(_ project: String, path: String, content: String, base: String) async -> FileWriteReply {
        do {
            return try await saves.request {
                client?.writeFile(project: project, path: path, content: content, base: base, reqId: $0)
            }
        } catch MacRequestError.timedOut {
            return FileWriteReply(["ok": false, "error": "Saving timed out. Check your Mac and try again."])
        } catch {
            return FileWriteReply(["ok": false, "error": "Lost the connection to your Mac before it saved."])
        }
    }
}
