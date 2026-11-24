import Foundation

/// One terminal's conversation as the phone has it.
struct ConversationList: Equatable {
    var items: [ConversationItem] = []
    /// There are entries before the first one.
    var more = false
    /// The Mac has sent it at least once.
    var loaded = false
    var error: String?
    var loadingEarlier = false
    /// Prompts sent from here the transcript doesn't have yet, oldest first.
    var sending: [PendingPrompt] = []

    /// A whole list. What was scrolled back to stays when the list goes on from
    /// it; anything else is another conversation.
    mutating func reset(_ update: ConversationUpdate) {
        let head = update.items.first.flatMap { first in items.firstIndex { $0.id == first.id } }
        if let head, head > 0 {
            items = items[..<head] + update.items
        } else {
            items = update.items
            more = update.more
        }
        sending = []
    }

    /// Entries that changed, and new ones.
    mutating func apply(_ changed: [ConversationItem]) {
        for item in changed {
            if let at = items.lastIndex(where: { $0.id == item.id }) {
                items[at] = item
            } else {
                items.append(item)
                if item.isPrompt, !sending.isEmpty { sending.removeFirst() }
            }
        }
    }
}

/// A prompt on its way to the agent.
struct PendingPrompt: Identifiable, Equatable {
    let id = UUID()
    let text: String
}

/// What a tool call's opened line shows.
enum ConversationDetail: Equatable {
    case loading
    case parts([ConversationPart])
    case failed(String)
}

/// The conversations of agent tabs, reached as `model.conversations`: pushed by the
/// Mac while a tab's Conversation view is on screen, and kept while the app runs so
/// going back to it shows what was there.
@Observable @MainActor
final class ConversationStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    private(set) var lists: [String: ConversationList] = [:]
    /// Opened tool calls by "terminal/entry/state": a call that finishes has more
    /// to show than it did.
    private(set) var details: [String: ConversationDetail] = [:]
    /// The terminals on screen, each with how many screens show it.
    @ObservationIgnored private var watched: [String: (source: AnswerSource, screens: Int)] = [:]
    @ObservationIgnored private let pages = MacRequests<ConversationPage>(timeout: .seconds(20))
    @ObservationIgnored private let parts = MacRequests<[ConversationPart]>(timeout: .seconds(20))

    /// How long a prompt sent to an agent that isn't working may take to show up.
    private static let sendingLapse: Duration = .seconds(12)

    var available: Bool { client?.hostFeatures.contains(LpmClient.agentConversationFeature) == true }

    func list(_ terminal: String) -> ConversationList { lists[terminal] ?? ConversationList() }

    // MARK: Following a terminal

    /// Keeps a terminal's conversation current until cancelled. The Mac forgets a
    /// dropped connection's watch, so the screen asks again once the link is back.
    func follow(_ source: AnswerSource) async {
        let id = source.terminal
        watched[id] = (source, (watched[id]?.screens ?? 0) + 1)
        client?.watchConversation(id: id, project: source.project)
        while !Task.isCancelled { try? await Task.sleep(for: .seconds(3600)) }
        let left = (watched[id]?.screens ?? 1) - 1
        watched[id] = left > 0 ? (source, left) : nil
        if left <= 0 { client?.unwatchConversation(id: id) }
    }

    func apply(_ update: ConversationUpdate) {
        guard !update.id.isEmpty else { return }
        var list = list(update.id)
        list.error = update.error
        if update.error == nil {
            list.loaded = true
            if update.reset { list.reset(update) } else { list.apply(update.items) }
        }
        guard lists[update.id] != list else { return }
        lists[update.id] = list
    }

    // MARK: Earlier entries and opened calls

    func loadEarlier(_ source: AnswerSource) async {
        let id = source.terminal
        guard var list = lists[id], list.more, !list.loadingEarlier, let first = list.items.first else { return }
        list.loadingEarlier = true
        lists[id] = list
        let page = try? await pages.request { [weak self] reqId in
            self?.client?.requestConversationPage(id: id, project: source.project, before: first.id, reqId: reqId)
        }
        lists[id]?.loadingEarlier = false
        // Only what still goes before the list as it is now.
        guard let page, lists[id]?.items.first?.id == first.id else { return }
        lists[id]?.items.insert(contentsOf: page.items, at: 0)
        lists[id]?.more = page.more
    }

    func detail(_ source: AnswerSource, _ item: ConversationItem) -> ConversationDetail? {
        details[key(source, item)]
    }

    func loadDetail(_ source: AnswerSource, _ item: ConversationItem) async {
        let key = key(source, item)
        switch details[key] {
        case .loading, .parts: return
        case .failed, nil: details[key] = .loading
        }
        do {
            let loaded = try await parts.request { [weak self] reqId in
                self?.client?.requestConversationDetail(id: source.terminal, project: source.project,
                                                        item: item.id, reqId: reqId)
            }
            details[key] = .parts(loaded)
        } catch {
            details[key] = .failed(error.localizedDescription)
        }
    }

    private func key(_ source: AnswerSource, _ item: ConversationItem) -> String {
        "\(source.terminal)/\(item.id)/\(item.tool?.state.rawValue ?? "")"
    }

    // MARK: Prompts sent from here

    /// Shows a prompt sent from here until the transcript has it: an agent at work
    /// takes it only once it gets to it.
    func noteSent(_ terminal: String, _ text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let source = watched[terminal]?.source, !text.isEmpty else { return }
        let prompt = PendingPrompt(text: text)
        lists[terminal, default: ConversationList()].sending.append(prompt)
        Task { [weak self] in
            repeat {
                try? await Task.sleep(for: Self.sendingLapse)
            } while self?.model?.isAgentWorking(source) == true
            self?.lists[terminal]?.sending.removeAll { $0.id == prompt.id }
        }
    }

    // MARK: Connection

    func handleConnectionReset() {
        pages.failAll()
        parts.failAll()
    }

    func deliverPage(reqId: String, _ page: ConversationPage?, error: String?) {
        pages.deliver(reqId: reqId, page, error: error)
    }

    func deliverDetail(reqId: String, _ loaded: [ConversationPart]?, error: String?) {
        parts.deliver(reqId: reqId, loaded, error: error)
    }
}
