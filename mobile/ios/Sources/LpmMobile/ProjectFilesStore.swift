import Foundation

/// The Files browser's folders, reached as `model.projectFiles`, keyed by
/// project and project-relative folder. The client transport lives on
/// `AppModel`; this store reaches it through `model`.
@Observable @MainActor
final class ProjectFilesStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    var folders: [String: ProjectFolderListing] = [:]
    /// project -> its absolute folder on the Mac, once a reply has said.
    var roots: [String: String] = [:]
    /// Where the last path typed into Go to File leads, by project.
    var located: [String: LocatedPath] = [:]

    @ObservationIgnored private let timeout = GenerationTimeout<String>()
    @ObservationIgnored private let locateTimeout = GenerationTimeout<String>()

    /// A Mac that can be asked where a typed path leads.
    var canLocatePaths: Bool {
        client?.hostFeatures.contains(LpmClient.locatePathFeature) == true
    }

    /// Where `path` leads, nil until the Mac has said.
    func located(_ project: String, _ path: String) -> LocatedPath? {
        located[project].flatMap { $0.typed == path ? $0 : nil }
    }

    /// A Mac that doesn't answer leaves the path to the file index alone.
    func locate(_ project: String, _ path: String) {
        client?.requestLocatePath(project: project, path: path)
        locateTimeout.arm(project, seconds: 10) { [weak self] in
            self?.located[project] = LocatedPath(["project": project, "path": path])
        }
    }

    func apply(_ path: LocatedPath) {
        locateTimeout.cancel(path.project)
        located[path.project] = path
    }

    func key(_ project: String, _ dir: String) -> String { project + "\n" + dir }

    func folder(_ project: String, _ dir: String) -> ProjectFolderListing {
        folders[key(project, dir)] ?? ProjectFolderListing()
    }

    /// Ask for the folder again, keeping what's listed until the answer lands.
    func load(_ project: String, _ dir: String) {
        let k = key(project, dir)
        var listing = folders[k] ?? ProjectFolderListing()
        listing.loading = true
        folders[k] = listing
        client?.requestListDir(project: project, dir: dir)
        timeout.arm(k, seconds: 20) { [weak self] in
            guard let self, var listing = self.folders[k], listing.loading else { return }
            listing.loading = false
            listing.error = "The Mac didn't answer in time."
            self.folders[k] = listing
        }
    }

    /// Pull to refresh: ask again and hold the spinner until the answer lands.
    func refresh(_ project: String, _ dir: String) async {
        load(project, dir)
        for _ in 0..<50 {
            guard folder(project, dir).loading else { return }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    func apply(_ contents: ProjectDirContents) {
        let k = key(contents.project, contents.dir)
        timeout.cancel(k)
        var listing = folders[k] ?? ProjectFolderListing()
        listing.loading = false
        if let entries = contents.entries {
            listing.entries = entries
            listing.error = nil
        } else {
            listing.entries = nil
            listing.error = contents.error
        }
        folders[k] = listing
        if let root = contents.root { roots[contents.project] = root }
    }

    /// A folder waiting on a reply the dropped link took with it asks again.
    func handleConnectionReset() {
        for (k, listing) in folders where listing.loading {
            let parts = k.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            if parts.count == 2 { load(parts[0], parts[1]) }
        }
    }
}

/// One folder as last listed. `entries` nil with no `error` is still loading.
struct ProjectFolderListing {
    var entries: [ProjectFileEntry]?
    var error: String?
    var loading = false
}
