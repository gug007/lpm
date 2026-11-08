import Foundation
import UIKit

/// The other machines saved on this phone, kept connected while the projects
/// list shows all of them (Show All Machines in the title menu), so each one's
/// projects and agents list as a section under the live Mac's own. A link only
/// reads the project list: it subscribes to no terminal and takes control of
/// nothing, and it tells its Mac the phone is away, so that Mac still sends
/// its notifications.
@Observable @MainActor
final class PairedMachineFeeds {
    enum State: Equatable { case connecting, ready, offline }

    struct Feed {
        var projects: [Project]?
        var state: State = .connecting
    }

    private static let enabledKey = "lpm.allMachines"

    var enabled = UserDefaults.standard.bool(forKey: enabledKey) {
        didSet { UserDefaults.standard.set(enabled, forKey: Self.enabledKey) }
    }
    private(set) var feeds: [UUID: Feed] = [:]

    @ObservationIgnored private var links: [UUID: FeedLink] = [:]

    /// Keep exactly `records` connected, opening the new ones and closing the rest.
    func keep(_ records: [MacRecord]) {
        let wanted = Dictionary(records.map { ($0.localId, $0) }, uniquingKeysWith: { a, _ in a })
        for (id, link) in links where wanted[id] == nil {
            link.stop()
            links[id] = nil
            feeds[id] = nil
        }
        for (id, record) in wanted where links[id] == nil {
            guard let credential = Keychain.load(for: id) else { continue }
            feeds[id] = Feed()
            let link = FeedLink(record: record, credential: credential) { [weak self] update in
                self?.apply(id, update)
            }
            links[id] = link
            link.start()
        }
    }

    /// The phone came back on screen: links waiting out a failure try again now.
    func retryNow() {
        for link in links.values { link.retryNow() }
    }

    private func apply(_ id: UUID, _ update: FeedLink.Update) {
        guard links[id] != nil else { return }
        var feed = feeds[id] ?? Feed()
        switch update {
        case .state(let state):
            feed.state = state
        case .projects(let projects):
            feed.projects = projects
            feed.state = .ready
        }
        feeds[id] = feed
    }
}

/// One saved machine's read-only link: find an address that answers, connect,
/// ask for the projects and ask again whenever they or their agents change.
@MainActor
private final class FeedLink {
    enum Update {
        case state(PairedMachineFeeds.State)
        case projects([Project])
    }

    private static let probeTimeout: TimeInterval = 6
    private static let retryDelays: [Double] = [5, 15, 30, 60]
    private static let refreshDelay: Double = 0.4

    private let record: MacRecord
    private let credential: MacCredential
    private let onUpdate: (Update) -> Void
    private var client: LpmClient?
    private var retry: DispatchWorkItem?
    private var refresh: DispatchWorkItem?
    private var failures = 0
    private var stopped = false
    private var dialing = false

    init(record: MacRecord, credential: MacCredential, onUpdate: @escaping (Update) -> Void) {
        self.record = record
        self.credential = credential
        self.onUpdate = onUpdate
    }

    func start() {
        guard !stopped, !dialing else { return }
        dialing = true
        onUpdate(.state(.connecting))
        let port = Int(record.port)
        let hosts = record.hosts
        Task { [weak self] in
            let host = await HostProbe.firstReachable(hosts, port: port, timeout: Self.probeTimeout)
            guard let self, !self.stopped else { return }
            self.dialing = false
            guard let host else { return self.failed() }
            self.connect(host: host, port: port)
        }
    }

    func retryNow() {
        guard retry != nil else { return }
        retry?.cancel()
        retry = nil
        failures = 0
        start()
    }

    func stop() {
        stopped = true
        retry?.cancel()
        refresh?.cancel()
        teardown()
    }

    private func connect(host: String, port: Int) {
        let localId = record.localId
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: UIDevice.current.name,
                          pinProvider: { Keychain.loadPin(for: localId) })
        c.inForeground = false
        client = c
        c.onState = { [weak self, weak c] state in
            guard let self, let c else { return }
            switch state {
            case .ready:
                self.failures = 0
                self.onUpdate(.state(.ready))
                c.requestProjects()
            case .failed: self.failed()
            case .idle, .connecting: break
            }
        }
        c.onProjects = { [weak self] projects in self?.onUpdate(.projects(projects)) }
        c.onProjectsChanged = { [weak self] in self?.refreshSoon() }
        c.onStatusChanged = { [weak self] _ in self?.refreshSoon() }
        c.connect()
    }

    /// A burst of agent updates asks for the list once.
    private func refreshSoon() {
        refresh?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.client?.requestProjects() }
        refresh = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.refreshDelay, execute: work)
    }

    /// Hang up and look for the machine again after a wait that grows, since it
    /// may have moved to another network meanwhile.
    private func failed() {
        teardown()
        guard !stopped else { return }
        onUpdate(.state(.offline))
        let delay = Self.retryDelays[min(failures, Self.retryDelays.count - 1)]
        failures += 1
        let work = DispatchWorkItem { [weak self] in
            self?.retry = nil
            self?.start()
        }
        retry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func teardown() {
        guard let c = client else { return }
        client = nil
        c.onState = nil
        c.onProjects = nil
        c.onProjectsChanged = nil
        c.onStatusChanged = nil
        c.shutdown()
    }
}
