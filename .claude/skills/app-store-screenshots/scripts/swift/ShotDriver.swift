import SwiftUI

// Screenshot builds only: launched with LPM_SHOT_ROUTE, the app enters Demo Mode
// and opens the route, e.g. "project:storefront > changes:storefront".
enum ShotDriver {
    @MainActor static func start(_ model: AppModel, show: @escaping (NavigationPath) -> Void) {
        guard let route = ProcessInfo.processInfo.environment["LPM_SHOT_ROUTE"] else { return }
        model.enterDemo()
        Task { @MainActor in
            for _ in 0..<100 where !model.projectsLoaded {
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            try? await Task.sleep(nanoseconds: 500_000_000)
            show(path(route))
        }
    }

    static func path(_ route: String) -> NavigationPath {
        var p = NavigationPath()
        for step in route.split(separator: ">").map({ $0.trimmingCharacters(in: .whitespaces) }) where !step.isEmpty {
            let parts = step.split(separator: ":", maxSplits: 1).map(String.init)
            let arg = parts.count > 1 ? parts[1] : ""
            let pair = arg.split(separator: "/", maxSplits: 1).map(String.init)
            switch parts[0] {
            case "list": break
            case "project": p.append(arg)
            case "terminal" where pair.count == 2:
                p.append(NotificationRoute.terminal(project: pair[0], id: pair[1]))
            case "changes": p.append(NotificationRoute.changes(project: arg))
            case "usage": p.append(NotificationRoute.usage)
            case "stats": p.append(NotificationRoute.stats)
            case "activity": p.append(NotificationRoute.activity)
            case "automations": p.append(NotificationRoute.automations)
            case "automation" where pair.count == 2:
                p.append(NotificationRoute.automation(project: pair[0], id: pair[1]))
            default: print("ShotDriver: unknown route step \(step)")
            }
        }
        return p
    }
}
