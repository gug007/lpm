import AppIntents
import Foundation

/// The projects a Focus filter can name: every project the phone has listed on
/// any of its Macs, by file name, with the name the sidebar shows.
enum FocusProjects {
    private static let appGroup = "group.cx.lpm.mobile"
    private static let key = "lpm.focus.projects"
    private static let cap = 300

    static func all() -> [String: String] {
        UserDefaults(suiteName: appGroup)?.dictionary(forKey: key) as? [String: String] ?? [:]
    }

    static func remember(_ projects: [Project]) {
        guard !projects.isEmpty, let defaults = UserDefaults(suiteName: appGroup) else { return }
        var known = all()
        let before = known
        for project in projects where !project.isDuplicate {
            known[project.name] = project.label.isEmpty ? project.name : project.label
        }
        guard known != before, known.count <= cap else { return }
        defaults.set(known, forKey: key)
    }
}

struct FocusProject: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Project"
    static var defaultQuery = FocusProjectQuery()

    let id: String
    let title: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}

struct FocusProjectQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FocusProject] {
        let known = FocusProjects.all()
        return identifiers.map { FocusProject(id: $0, title: known[$0] ?? $0) }
    }

    func suggestedEntities() async throws -> [FocusProject] {
        FocusProjects.all()
            .map { FocusProject(id: $0.key, title: $0.value) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }
}

/// A Focus filter (Settings › Focus › a Focus › Focus Filters): during that
/// Focus, only the chosen projects' notifications come through. The extension
/// names each notification's project in `filterCriteria` for the system to match.
struct ProjectFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Choose projects"
    static var description: IntentDescription? = "Only notifications from these projects come through during this Focus."

    @Parameter(title: "Projects")
    var projects: [FocusProject]?

    var displayRepresentation: DisplayRepresentation {
        let names = (projects ?? []).map(\.title)
        return DisplayRepresentation(title: names.isEmpty ? "All projects" : "\(names.joined(separator: ", "))")
    }

    var appContext: FocusFilterAppContext {
        guard let projects, !projects.isEmpty else { return FocusFilterAppContext(notificationFilterPredicate: nil) }
        return FocusFilterAppContext(notificationFilterPredicate: NSPredicate(format: "SELF IN %@", projects.map(\.id)))
    }

    func perform() async throws -> some IntentResult { .result() }
}
