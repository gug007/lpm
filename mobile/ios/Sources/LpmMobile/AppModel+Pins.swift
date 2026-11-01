import Foundation

/// Pinned projects: the Mac's own pins (the desktop sidebar's Pin to top), shown
/// as a Pinned section above the list. A pin is a way back, not a move, so the
/// project keeps its place below as well.
extension AppModel {
    var canPinProjects: Bool {
        client?.hostFeatures.contains(LpmClient.projectPinsFeature) == true
    }

    /// The pinned projects there is something to show for, in pinned order. A pin
    /// whose project is gone keeps its place on the Mac and shows when it's back.
    var pinnedProjects: [Project] {
        let byName = Dictionary(projects.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        var seen = Set<String>()
        return pins.compactMap { name in
            guard seen.insert(name).inserted else { return nil }
            return byName[name]
        }
    }

    func isPinned(_ project: Project) -> Bool { pins.contains(project.name) }

    /// Pin at the end, or unpin, at once; the Mac's reply carries the pins it kept.
    func setPinned(_ project: Project, _ pinned: Bool) {
        pins.removeAll { $0 == project.name }
        if pinned { pins.append(project.name) }
        Haptics.tap()
        client?.sidebarPin(project: project.name, pinned: pinned)
    }
}
