import Foundation

/// The dialogs agents wait on, reached as `model.agentDialogs`: asked for while
/// a waiting agent's row is on screen, and answered from it with one of their
/// options — the desktop sidebar's question card (SidebarAgentAsk.tsx).
@Observable @MainActor
final class AgentDialogStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    /// What each terminal's waiting report shows, by terminal id.
    private(set) var reads: [String: AgentDialogRead] = [:]
    /// The option on its way to the Mac, by terminal id.
    private(set) var picking: [String: String] = [:]
    /// Why the last pick didn't land, by terminal id.
    private(set) var errors: [String: String] = [:]
    /// Picks sent, by request id: the terminal and the dialog they answered.
    @ObservationIgnored private var sent: [String: (terminal: String, dialog: String)] = [:]
    /// The dialog a pick that reached the Mac answered, until the agent moves on.
    @ObservationIgnored private var answered: [String: String] = [:]
    @ObservationIgnored private let timers = GenerationTimeout<String>()

    /// How long a pick that reached the Mac may leave its dialog on screen before
    /// the card says it didn't get through (the desktop's NO_EFFECT_MS).
    private static let noEffect: TimeInterval = 2.5

    var available: Bool { client?.hostFeatures.contains(LpmClient.agentDialogFeature) == true }

    /// The dialog to show for a waiting agent's row, once the Mac has read one.
    func read(terminal: String, key: String) -> AgentDialogRead? {
        guard let read = reads[terminal], read.key == key, read.dialog != nil else { return nil }
        return read
    }

    /// Asks for the dialog while the agent waits and its row is on screen. A CLI
    /// can draw it a moment after its hook reports the wait, so a read with no
    /// dialog is tried again a few times.
    func follow(project: String, terminal: String, key: String) async {
        guard available else { return }
        for delay: UInt64 in [1, 2, 4, 8, 15] {
            client?.requestAgentDialog(project: project, terminalId: terminal)
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            if Task.isCancelled { return }
            if read(terminal: terminal, key: key) != nil { return }
        }
    }

    func apply(_ read: AgentDialogRead) {
        guard !read.terminalId.isEmpty else { return }
        if let shown = answered[read.terminalId], read.key.isEmpty || read.dialog?.id != shown {
            answered[read.terminalId] = nil
        }
        guard reads[read.terminalId] != read else { return }
        if reads[read.terminalId]?.dialog?.id != read.dialog?.id {
            errors[read.terminalId] = nil
        }
        reads[read.terminalId] = read
    }

    func pick(_ option: AgentDialogOption, of read: AgentDialogRead) {
        guard let dialog = read.dialog, picking[read.terminalId] == nil, let client else { return }
        Haptics.tap()
        let reqId = UUID().uuidString
        sent[reqId] = (read.terminalId, dialog.id)
        picking[read.terminalId] = option.key
        errors[read.terminalId] = nil
        client.pickAgentDialog(read, option: option.key, reqId: reqId)
        timers.arm(reqId, seconds: 10) { [weak self] in
            guard let self, self.sent.removeValue(forKey: reqId) != nil else { return }
            self.picking[read.terminalId] = nil
            self.errors[read.terminalId] = "Couldn't reach your Mac. Try again."
        }
    }

    /// The Mac's word on a pick. False when `reqId` isn't one of this store's.
    func applyAnswer(reqId: String, error: String?) -> Bool {
        guard let pick = sent.removeValue(forKey: reqId) else { return false }
        timers.cancel(reqId)
        picking[pick.terminal] = nil
        if let error {
            Haptics.warning()
            errors[pick.terminal] = error
            refresh(pick.terminal)
            return true
        }
        answered[pick.terminal] = pick.dialog
        timers.arm("\(reqId)/refresh", seconds: Self.noEffect) { [weak self] in
            self?.refresh(pick.terminal)
        }
        timers.arm("\(reqId)/check", seconds: Self.noEffect + 1.5) { [weak self] in
            guard let self, self.answered[pick.terminal] == pick.dialog,
                  self.reads[pick.terminal]?.dialog?.id == pick.dialog else { return }
            self.answered[pick.terminal] = nil
            self.errors[pick.terminal] = "The answer didn't reach the agent. Open the tab to check."
        }
        return true
    }

    /// Whether a pick of this dialog went through and the agent hasn't moved on yet.
    func isAnswered(_ read: AgentDialogRead) -> Bool {
        guard let id = read.dialog?.id else { return false }
        return answered[read.terminalId] == id
    }

    private func refresh(_ terminal: String) {
        guard let read = reads[terminal] else { return }
        client?.requestAgentDialog(project: read.project, terminalId: terminal)
    }

    func handleConnectionReset() {
        timers.cancelAll()
        picking = [:]
        sent = [:]
        answered = [:]
    }
}

extension AppModel {
    func wireAgentDialogs(_ c: LpmClient) {
        c.onAgentDialog = { [weak self] read in self?.agentDialogs.apply(read) }
    }
}
