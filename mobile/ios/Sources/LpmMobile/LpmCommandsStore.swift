import Foundation

/// The user's lpm commands per project, and the requests that read, change and
/// run them. Owned by `AppModel` and reached as `model.lpmCommands`. Every verb
/// runs on a worker on the Mac (an SSH project's list is a round trip to its
/// host), so replies are paired with their request by `reqId`.
@Observable @MainActor
final class LpmCommandsStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    /// Both lists per project, as the Mac last sent them.
    var lists: [String: LpmCommandLists] = [:]
    var loading: Set<String> = []
    var loadError: [String: String] = [:]
    /// Bumped on every change push, so a `/` menu asks for its rows again.
    var revision = 0

    @ObservationIgnored private let requests = MacRequests<LpmCommandReply>(timeout: .seconds(30))
    // Projects a screen is showing (counted, as a screen and its editor overlap),
    // so a change push or a reconnect refreshes just those.
    @ObservationIgnored private var watched: [String: Int] = [:]

    // MARK: screen lifecycle

    /// Every screen that reads a project's lists holds this while shown. The
    /// first one fetches them, as nothing refreshed them while none showed; while
    /// one stays open, change pushes keep them current.
    func open(_ project: String) {
        watched[project, default: 0] += 1
        if watched[project] == 1 || lists[project] == nil { load(project) }
    }

    func close(_ project: String) {
        guard let n = watched[project] else { return }
        watched[project] = n > 1 ? n - 1 : nil
    }

    // MARK: requests

    func load(_ project: String) {
        guard !loading.contains(project) else { return }
        loading.insert(project)
        Task {
            defer { loading.remove(project) }
            do {
                let reply = try await request { Wire.lpmCommands(project: project, reqId: $0) }
                if let fresh = reply.lists { lists[project] = fresh }
                loadError[project] = nil
            } catch {
                if lists[project] == nil { loadError[project] = error.localizedDescription }
            }
        }
    }

    /// Create a command, or with `previous` edit one: a new name, folder or list
    /// moves its file.
    func save(_ project: String, place: LpmCommandRef, description: String, body: String,
              previous: LpmCommandRef?) async throws {
        try await change(project) {
            Wire.lpmCommandSave(project: project, command: place, description: description, body: body,
                                previous: previous, reqId: $0)
        }
    }

    func delete(_ project: String, _ target: LpmCommandRef) async throws {
        try await change(project) { Wire.lpmCommandDelete(project: project, target: target, reqId: $0) }
    }

    func folder(_ project: String, _ op: LpmFolderOp, scope: LpmCommandScope, name: String,
                newName: String? = nil) async throws {
        try await change(project) {
            Wire.lpmCommandFolder(project: project, op: op, scope: scope, name: name, newName: newName, reqId: $0)
        }
    }

    /// The prompt `/name args` sends, filled in by the Mac that holds the project.
    func expand(_ project: String, name: String, args: String) async throws -> LpmCommandExpansion {
        let reply = try await request { Wire.lpmCommandExpand(project: project, name: name, args: args, reqId: $0) }
        return reply.expansion ?? LpmCommandExpansion(text: "", missing: [])
    }

    // MARK: replies (driven by AppModel.wireLpmCommands)

    func deliver(_ reply: LpmCommandReply) {
        requests.deliver(reqId: reply.reqId, reply.error == nil ? reply : nil, error: reply.error)
    }

    /// A command or folder changed somewhere: `""` is the global list, which
    /// every project's lists include, else the one project whose own list it was.
    func changed(_ project: String) {
        revision += 1
        for p in watched.keys where project.isEmpty || p == project { load(p) }
    }

    /// The socket was replaced: nothing in flight can still answer.
    func handleConnectionReset() {
        failAll()
        loading = []
        for p in watched.keys { load(p) }
    }

    func failAll() {
        requests.failAll()
    }

    // MARK: plumbing

    private func change(_ project: String, _ frame: (String) -> String) async throws {
        let reply = try await request(frame)
        if let fresh = reply.lists { lists[project] = fresh }
    }

    private func request(_ frame: (String) -> String) async throws -> LpmCommandReply {
        guard let client else { throw MacRequestError.disconnected }
        return try await requests.request { client.sendLpmCommandRequest(frame($0)) }
    }
}
