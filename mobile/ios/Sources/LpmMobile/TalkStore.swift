import Foundation

/// The Talk button's one request, reached as `model.talk`: a sentence said or
/// typed, the plan the Mac makes of it, and the run once that plan is approved.
/// Nothing reaches `talkRun` that wasn't on screen when Approve was tapped.
@Observable @MainActor
final class TalkStore {
    enum Phase: Equatable {
        case ask
        case planning
        case plan
        case failed(unsupported: Bool, message: String)
    }

    static let dictationOwner = "talk"

    @ObservationIgnored weak var model: AppModel?

    /// The live Mac turns a sentence into a plan and runs it.
    private(set) var available = false
    /// The sheet is up. Shut by Cancel, by a swipe down or by a run the Mac
    /// took, and either way a reply still on its way is dropped.
    var open = false {
        didSet { if oldValue && !open { leave() } }
    }
    private(set) var phase: Phase = .ask
    var text = ""
    var plan: TalkPlan?
    /// The projects the sentence could mean, when the plan names none.
    private(set) var candidates: [String] = []
    private(set) var running = false
    private(set) var runError: String?

    @ObservationIgnored private let plans = MacRequests<TalkPlanReply>(timeout: .seconds(120))
    @ObservationIgnored private let runs = MacRequests<TalkRunReply>(timeout: .seconds(30))
    /// Bumped whenever the request on screen is left, so a late reply is dropped.
    @ObservationIgnored private var turn = 0

    private var sentence: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var hasText: Bool { !sentence.isEmpty }

    // MARK: from the Mac

    func noteReady(features: Set<String>) {
        available = features.contains(LpmClient.talkFeature)
    }

    func applyPlan(_ reply: TalkPlanReply) {
        plans.deliver(reqId: reply.reqId, reply, error: nil)
    }

    func applyRun(_ reply: TalkRunReply) {
        runs.deliver(reqId: reply.reqId, reply, error: nil)
    }

    func handleConnectionReset() {
        plans.failAll()
        runs.failAll()
    }

    // MARK: the sheet

    func begin() {
        phase = .ask
        text = ""
        plan = nil
        candidates = []
        runError = nil
        open = true
        model?.agentLaunch.loadOptions()
    }

    func close() {
        open = false
    }

    private func leave() {
        turn += 1
        plans.failAll()
        runs.failAll()
        running = false
        model?.dictation.abandon(Self.dictationOwner)
    }

    func tryAgain() {
        phase = .ask
    }

    /// A take's words go in the field and then to the Mac, as if Make a plan was tapped.
    func dictate() {
        model?.dictation.start(owner: Self.dictationOwner) { [weak self] words in
            guard let self, self.open, self.phase == .ask else { return }
            self.text = self.text.addingDictated(words)
            if !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { self.makePlan() }
        }
    }

    // MARK: to the Mac

    func makePlan() {
        let sentence = self.sentence
        guard phase == .ask, !sentence.isEmpty else { return }
        phase = .planning
        let turn = self.turn
        Task {
            do {
                let reply = try await plans.request { model?.client?.talkPlan(reqId: $0, text: sentence) }
                guard turn == self.turn else { return }
                if let plan = reply.plan {
                    self.plan = plan
                    candidates = reply.candidates
                    runError = nil
                    phase = .plan
                } else {
                    phase = .failed(unsupported: reply.unsupported, message: reply.error)
                }
            } catch {
                guard turn == self.turn else { return }
                phase = .failed(unsupported: false, message: error.localizedDescription)
            }
        }
    }

    func approve() {
        guard phase == .plan, !running, var plan, plan.canRun else { return }
        guard model?.link.isReady == true else {
            runError = MacRequestError.disconnected.localizedDescription
            return
        }
        plan.prompt = plan.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        running = true
        runError = nil
        let turn = self.turn
        Task {
            var failure: String?
            do {
                failure = try await runs.request { model?.client?.talkRun(reqId: $0, plan: plan) }.error
            } catch {
                failure = error.localizedDescription
            }
            guard turn == self.turn else { return }
            running = false
            runError = failure
            if failure == nil {
                Haptics.success()
                close()
            } else {
                Haptics.error()
            }
        }
    }
}

extension AppModel {
    func wireTalk(_ c: LpmClient) {
        c.onTalkPlan = { [weak self, weak c] reply in
            guard let self, let c, c === self.client else { return }
            self.talk.applyPlan(reply)
        }
        c.onTalkRun = { [weak self, weak c] reply in
            guard let self, let c, c === self.client else { return }
            self.talk.applyRun(reply)
        }
    }
}

/// What the plan's rows show and offer, from the lists the Mac already sent.
extension TalkStore {
    /// The Change menu's projects: the ones the sentence could mean, then the rest.
    var projectChoices: [Project] {
        let all = model?.projects ?? []
        var listed = Set<String>()
        let ordered = candidates.compactMap { name in all.first { $0.name == name } } + all
        return ordered.filter { listed.insert($0.name).inserted }
    }

    func projectTitle(_ project: Project) -> String {
        project.label.isEmpty ? project.name : project.label
    }

    func projectTitle(_ name: String) -> String {
        model?.projects.first { $0.name == name }.map { projectTitle($0) } ?? name
    }

    var agentChoices: [AgentOption] { model?.agentLaunch.options ?? [] }

    func agentLabel(_ id: String) -> String {
        agentChoices.first { $0.id == id }?.label ?? id
    }
}
