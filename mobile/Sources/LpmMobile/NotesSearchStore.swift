import Foundation

/// The notes search half, split out of `NotesStore` so that file stays focused;
/// reached as `model.notes.search`. Its `model` is set for it whenever the
/// notes store's is, so there is no second wiring step to forget.
///
/// Results answer off a worker and a fast typist has several in flight at once,
/// so every reply is dropped unless it echoes the query still being asked.
@Observable @MainActor
final class NotesSearchStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    var hits: [String: [NoteSearchHit]] = [:]
    var loading: Set<String> = []
    var error: [String: String] = [:]

    @ObservationIgnored private var pendingQuery: [String: String] = [:]
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    /// The query a project's results answer, so a screen can tell "no matches"
    /// apart from "nothing searched yet".
    func query(_ project: String) -> String { pendingQuery[project] ?? "" }

    func search(_ project: String, query: String, limit: Int = 50) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { clear(project); return }
        pendingQuery[project] = trimmed
        loading.insert(project)
        error[project] = nil
        client?.notesSearch(project: project, query: trimmed, limit: limit)
        timeout.arm(project, seconds: 25) { [weak self] in
            guard let self, self.loading.remove(project) != nil else { return }
            self.error[project] = "Search timed out. Try again."
        }
    }

    func clear(_ project: String) {
        timeout.cancel(project)
        pendingQuery[project] = nil
        loading.remove(project)
        hits[project] = nil
        error[project] = nil
    }

    /// Drop a hit whose note was deleted, so results don't offer a dead row.
    func removeHit(_ project: String, id: String) {
        hits[project]?.removeAll { $0.id == id }
    }

    func apply(_ project: String, query: String, hits results: [NoteSearchHit], error message: String?) {
        guard pendingQuery[project] == query else { return }
        timeout.cancel(project)
        loading.remove(project)
        if let message { error[project] = message } else { hits[project] = results; error[project] = nil }
    }

    /// The socket was replaced: re-issue the open search, or drop its spinner.
    func handleConnectionReset(active project: String?) {
        timeout.cancelAll()
        loading = []
        guard let project, let query = pendingQuery[project] else { return }
        pendingQuery[project] = nil
        search(project, query: query)
    }
}
