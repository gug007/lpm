import Foundation
import SwiftUI
import UIKit

/// Top-level observable state: the connection, the project list, and per-project
/// status. Views observe this; the client drives it.
@MainActor
final class AppModel: ObservableObject {
    @Published var connection: LpmClient.State = .idle
    @Published var projects: [Project] = []
    @Published var terminals: [String: [TerminalInfo]] = [:] // project -> terminals
    @Published var paired: Bool = false

    // Output is streamed straight to whichever TerminalScreen is subscribed; the
    // emulator (SwiftTerm) holds the buffer, not this model.
    var onTerminalFeed: [String: (String) -> Void] = [:]

    private var client: LpmClient?

    func bootstrap() {
        guard let cred = Keychain.load() else { paired = false; return }
        paired = true
        // Endpoint is remembered from the last successful connect (persist it in
        // UserDefaults in a real build); default to loopback for the simulator.
        connect(host: UserDefaults.standard.string(forKey: "lpm.host") ?? "127.0.0.1",
                port: UserDefaults.standard.integer(forKey: "lpm.port").nonzero ?? 8765,
                credential: cred)
    }

    func connect(host: String, port: Int, credential: LpmClient.Credential) {
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: UIDevice.current.name)
        wire(c)
        client = c
        c.connect()
    }

    func pair(host: String, port: Int, code: String) {
        UserDefaults.standard.set(host, forKey: "lpm.host")
        UserDefaults.standard.set(port, forKey: "lpm.port")
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: nil, deviceName: UIDevice.current.name)
        wire(c)
        client = c
        c.pair(host: host, port: port, code: code)
    }

    func reconnectIfNeeded() {
        if case .ready = connection { return }
        client?.connect()
    }

    // Terminal wiring used by TerminalScreen.
    func subscribe(_ id: String, feed: @escaping (String) -> Void) {
        onTerminalFeed[id] = feed
        client?.subscribe(id)
    }
    func unsubscribe(_ id: String) {
        onTerminalFeed[id] = nil
        client?.unsubscribe(id)
    }
    func input(_ id: String, _ data: String) { client?.sendInput(id, data) }
    func resize(_ id: String, cols: Int, rows: Int) { client?.resize(id, cols: cols, rows: rows) }

    func startProject(_ p: Project) { client?.startProject(p.name) }
    func stopProject(_ p: Project) { client?.stopProject(p.name) }
    func loadTerminals(_ project: String) { client?.requestTerminals(project: project) }

    private func wire(_ c: LpmClient) {
        c.onState = { [weak self] s in
            self?.connection = s
            if case .ready = s { self?.paired = true; c.requestProjects() }
        }
        c.onProjects = { [weak self] p in self?.projects = p }
        c.onTerminals = { [weak self] proj, t in self?.terminals[proj] = t }
        c.onProjectsChanged = { c.requestProjects() }
        c.onStatusChanged = { proj in c.requestStatus(project: proj) }
        c.onStatus = { [weak self] proj, entries in
            guard let self else { return }
            if let idx = self.projects.firstIndex(where: { $0.name == proj }) {
                // Rebuild the project with fresh status (Project is a value type).
                var dict = [String: Any]()
                dict["name"] = self.projects[idx].name
                dict["label"] = self.projects[idx].label
                dict["running"] = self.projects[idx].running
                dict["isRemote"] = self.projects[idx].isRemote
                dict["statusEntries"] = entries.map { ["key": $0.key, "value": $0.value, "priority": $0.priority, "timestamp": $0.timestamp] }
                self.projects[idx] = Project(dict)
            }
        }
        c.onSeed = { [weak self] id, _, _, data in self?.onTerminalFeed[id]?(data) }
        c.onOutput = { [weak self] id, data in self?.onTerminalFeed[id]?(data) }
    }
}

private extension Int {
    var nonzero: Int? { self == 0 ? nil : self }
}
