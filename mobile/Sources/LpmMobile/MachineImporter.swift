import Foundation
import Observation
import UIKit

/// Adds the connected Mac's own machines — its Linux servers and other Macs — to
/// this phone, so nobody has to scan a code per machine.
///
/// The Mac lists them (`machines`); for each one the phone doesn't have yet, the
/// Mac asks that machine to arm a pairing code (`machinePair`), and the phone
/// pairs with it directly over a throwaway connection. The result is an ordinary
/// saved machine that the phone reaches on its own, with the Mac asleep.
///
/// A machine the user removed from the phone is never re-added on its own; it
/// stays listed with an Add button instead. A failure isn't retried
/// automatically until `retryAfter` has passed, so an unreachable server doesn't
/// have a fresh code armed on it on every reconnect.
@MainActor
@Observable
final class MachineImporter {
    enum Status: Equatable {
        case adding
        case failed(String)
        case removed
        case offline
        case needsUpdate
    }

    struct Row: Identifiable {
        let machine: RemoteMachine
        let status: Status
        var id: String { machine.slug }
    }

    /// Everything a successful pairing learned, for the model to save.
    struct Paired {
        let label: String
        let deviceId: String
        let token: String
        let serverId: String?
        let serverName: String?
        let platform: String?
        let hosts: [String]
        let port: UInt16
        let fingerprint: String?
    }

    /// Sends `machines` over the live connection.
    @ObservationIgnored var requestMachines: (() -> Void)?
    /// Sends `machinePair` over the live connection; false when there is none.
    @ObservationIgnored var requestOffer: ((String) -> Bool)?
    /// Saves a paired machine and returns its record id.
    @ObservationIgnored var onPaired: ((Paired) -> UUID?)?

    private(set) var machines: [RemoteMachine] = []
    private var adding: Set<String> = []
    // Keyed like the ledger, so a failure outlives switching Macs and back.
    private var failures: [String: (at: Date, message: String)] = [:]

    @ObservationIgnored private var sourceId: String?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var queue: [String] = []
    @ObservationIgnored private var running = false
    @ObservationIgnored private var offerWaiters: [String: (id: Int, cont: CheckedContinuation<OfferResult, Never>)] = [:]
    @ObservationIgnored private var nextWaiterId = 0
    @ObservationIgnored private var inFlight: MachinePairAttempt?
    @ObservationIgnored private var relists = 0

    private static let ledgerKey = "lpm.machineImports"
    private static let retryAfter: TimeInterval = 10 * 60
    private static let offerTimeout: TimeInterval = 30
    private static let pairTimeout: TimeInterval = 25
    private static let relistDelay: TimeInterval = 30
    private static let maxRelists = 3

    private enum OfferResult {
        case offer(MachinePairOffer)
        case failed(String)
    }

    /// The machines of the live Mac that aren't on this phone, with where each stands.
    func rows(macs: [MacRecord]) -> [Row] {
        guard let sourceId else { return [] }
        return machines.compactMap { m in
            if isOnPhone(m, source: sourceId, macs: macs) { return nil }
            if adding.contains(m.slug) { return Row(machine: m, status: .adding) }
            if let f = failures[Self.key(sourceId, m.slug)] { return Row(machine: m, status: .failed(f.message)) }
            if wasRemoved(m, source: sourceId, macs: macs) { return Row(machine: m, status: .removed) }
            switch m.state {
            case .ready: return Row(machine: m, status: .adding)
            case .offline: return Row(machine: m, status: .offline)
            case .update: return Row(machine: m, status: .needsUpdate)
            }
        }
    }

    /// The live Mac (`source` is its serverId) listed its machines. Starts adding
    /// every one that's new here and pairable now.
    func update(_ list: [RemoteMachine], source: String, macs: [MacRecord]) {
        if source != sourceId { detach() }
        sourceId = source
        machines = list
        for m in list where m.state == .ready && shouldAdd(m, source: source, macs: macs) {
            enqueue(m.slug)
        }
        let waiting = list.contains { $0.state == .offline && !isOnPhone($0, source: source, macs: macs) }
        if waiting, relists < Self.maxRelists {
            relists += 1
            let gen = generation
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.relistDelay) { [weak self] in
                guard let self, self.generation == gen else { return }
                self.requestMachines?()
            }
        }
    }

    /// Add one machine now — a retry after a failure, or one the user removed.
    func add(_ slug: String) {
        guard let sourceId else { return }
        failures[Self.key(sourceId, slug)] = nil
        enqueue(slug)
    }

    func receiveOffer(slug: String, offer: MachinePairOffer?, error: String?) {
        let result: OfferResult = offer.map { .offer($0) } ?? .failed(Self.offerFailure(error))
        offerWaiters.removeValue(forKey: slug)?.cont.resume(returning: result)
    }

    /// The live Mac went away (switched, removed, or reset). Forget its list; a
    /// pairing already under way still finishes and is saved.
    func detach() {
        generation += 1
        sourceId = nil
        machines = []
        adding = []
        queue = []
        relists = 0
        for (_, waiter) in offerWaiters { waiter.cont.resume(returning: .failed("Lost the connection to the Mac.")) }
        offerWaiters = [:]
    }

    // MARK: deciding

    private func isOnPhone(_ m: RemoteMachine, source: String, macs: [MacRecord]) -> Bool {
        if let sid = m.serverId, macs.contains(where: { $0.serverId == sid }) { return true }
        guard let id = Self.ledger()[Self.key(source, m.slug)] else { return false }
        return macs.contains { $0.localId.uuidString == id }
    }

    private func wasRemoved(_ m: RemoteMachine, source: String, macs: [MacRecord]) -> Bool {
        Self.ledger()[Self.key(source, m.slug)] != nil && !isOnPhone(m, source: source, macs: macs)
    }

    private func shouldAdd(_ m: RemoteMachine, source: String, macs: [MacRecord]) -> Bool {
        if isOnPhone(m, source: source, macs: macs) || wasRemoved(m, source: source, macs: macs) { return false }
        if adding.contains(m.slug) { return false }
        if let f = failures[Self.key(source, m.slug)], Date().timeIntervalSince(f.at) < Self.retryAfter {
            return false
        }
        return true
    }

    // MARK: adding

    private func enqueue(_ slug: String) {
        guard !adding.contains(slug) else { return }
        adding.insert(slug)
        queue.append(slug)
        guard !running else { return }
        running = true
        Task { [weak self] in
            while let self, !self.queue.isEmpty {
                let next = self.queue.removeFirst()
                await self.addOne(next)
            }
            self?.running = false
        }
    }

    private func addOne(_ slug: String) async {
        guard let source = sourceId else { return }
        let gen = generation
        let outcome = await pair(slug)
        switch outcome {
        case .success(let paired):
            save(paired, source: source, slug: slug)
        case .failure(let message):
            // Leaving the Mac mid-way is not the machine's failure; retry it on return.
            guard generation == gen else { return }
            failures[Self.key(source, slug)] = (Date(), message)
        }
        if generation == gen { adding.remove(slug) }
    }

    private func save(_ paired: Paired, source: String, slug: String) {
        guard let id = onPaired?(paired) else { return }
        var ledger = Self.ledger()
        ledger[Self.key(source, slug)] = id.uuidString
        UserDefaults.standard.set(ledger, forKey: Self.ledgerKey)
    }

    private enum Outcome {
        case success(Paired)
        case failure(String)
    }

    private func pair(_ slug: String) async -> Outcome {
        let offer: MachinePairOffer
        switch await fetchOffer(slug) {
        case .offer(let o): offer = o
        case .failed(let message): return .failure(message)
        }
        guard !offer.hosts.isEmpty else { return .failure("The Mac doesn't know an address for it.") }
        let (winner, _) = await HostProbe.race(offer.hosts, port: offer.port)
        guard let host = winner else { return .failure(Self.unreachable(offer.port)) }

        let attempt = MachinePairAttempt()
        inFlight = attempt
        defer { inFlight = nil }
        let result = await withCheckedContinuation { cont in
            attempt.start(host: host, port: offer.port, code: offer.code,
                          fingerprint: offer.fingerprint, timeout: Self.pairTimeout) { cont.resume(returning: $0) }
        }
        switch result {
        case .failed(let reason):
            return .failure(Self.pairFailure(reason, port: offer.port))
        case .paired(let p):
            var hosts = [host]
            for h in offer.hosts + p.hosts where !hosts.contains(h) { hosts.append(h) }
            return .success(Paired(label: offer.name, deviceId: p.deviceId, token: p.token,
                                   serverId: p.serverId ?? offer.serverId, serverName: p.serverName,
                                   platform: p.platform ?? offer.platform, hosts: hosts,
                                   port: UInt16(clamping: offer.port),
                                   fingerprint: p.fingerprint ?? offer.fingerprint))
        }
    }

    private func fetchOffer(_ slug: String) async -> OfferResult {
        guard let requestOffer, requestOffer(slug) else { return .failed("Not connected to the Mac.") }
        nextWaiterId += 1
        let id = nextWaiterId
        return await withCheckedContinuation { cont in
            offerWaiters[slug] = (id, cont)
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.offerTimeout) { [weak self] in
                guard let self, self.offerWaiters[slug]?.id == id else { return }
                self.offerWaiters.removeValue(forKey: slug)?.cont
                    .resume(returning: .failed("It didn't answer in time."))
            }
        }
    }

    // MARK: copy

    private static func offerFailure(_ error: String?) -> String {
        let e = (error ?? "").lowercased()
        if e.contains("not connected") || e.contains("no longer connected") {
            return "The Mac isn't connected to it right now."
        }
        if e.contains("timed out") { return "It didn't answer in time." }
        if e.contains("update") { return "Update lpm on it first." }
        return "Couldn't get a pairing code from it."
    }

    private static func unreachable(_ port: Int) -> String {
        "This phone can't reach it on port \(port)."
    }

    private static func pairFailure(_ reason: String, port: Int) -> String {
        switch reason {
        case LpmClient.pairMismatchError: return "Its identity didn't match. Try again."
        case "pairing rejected": return "Its pairing code expired. Try again."
        case "pairing unavailable": return "It couldn't save this phone. Check lpm on it."
        default: return unreachable(port)
        }
    }

    // MARK: ledger

    /// `<source serverId>/<slug>` → the record id it was saved as. Outlives the
    /// record on purpose: a key whose record is gone is a machine the user removed.
    private static func ledger() -> [String: String] {
        UserDefaults.standard.dictionary(forKey: ledgerKey) as? [String: String] ?? [:]
    }

    private static func key(_ source: String, _ slug: String) -> String { "\(source)/\(slug)" }
}

/// One pairing connection to a machine the Mac handed over: redeems the code,
/// keeps the credential, and hangs up. Like the push registrar's attempts it is
/// never given to the app, so it can't disturb the live session. Resolves once —
/// on `paired`, on a terminal failure, or on the watchdog.
@MainActor
private final class MachinePairAttempt {
    struct Pairing {
        let deviceId: String
        let token: String
        let serverId: String?
        let serverName: String?
        let platform: String?
        let hosts: [String]
        let fingerprint: String?
    }

    enum Outcome {
        case paired(Pairing)
        case failed(String)
    }

    private var client: LpmClient?
    private var watchdog: DispatchWorkItem?
    private var completion: ((Outcome) -> Void)?

    func start(host: String, port: Int, code: String, fingerprint: String?,
               timeout: TimeInterval, completion: @escaping (Outcome) -> Void) {
        self.completion = completion
        let c = LpmClient(endpoint: .init(host: host, port: port), credential: nil,
                          deviceName: UIDevice.current.name, expectedFingerprint: fingerprint)
        client = c
        c.onPaired = { [weak self, weak c] deviceId, token, serverId, serverName, hosts, platform in
            self?.finish(.paired(Pairing(deviceId: deviceId, token: token, serverId: serverId,
                                         serverName: serverName, platform: platform, hosts: hosts,
                                         fingerprint: c?.observedFingerprint)))
        }
        c.onState = { [weak self] state in
            if case .failed(let reason) = state { self?.finish(.failed(reason)) }
        }
        let w = DispatchWorkItem { [weak self] in self?.finish(.failed("timed out")) }
        watchdog = w
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: w)
        c.pair(host: host, port: port, code: code)
    }

    private func finish(_ outcome: Outcome) {
        guard let completion else { return }
        self.completion = nil
        watchdog?.cancel()
        watchdog = nil
        client?.onState = nil
        client?.onPaired = nil
        client?.shutdown()
        client = nil
        completion(outcome)
    }
}
