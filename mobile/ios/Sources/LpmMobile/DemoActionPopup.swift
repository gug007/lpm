import Foundation

/// Demo handlers for `actionPopup` and `actionApp`: api-gateway's Stars action
/// shows the repo's GitHub stars month by month, and its Releases action the
/// latest releases with a button that runs Release (`lpm.run`), each drawn by its
/// sample page in mobile/shared/demo, which lays itself out larger as the app.
extension DemoServer {
    func registerActionPopupHandlers() {
        registerActionPage("actionPopup", key: "popup", noun: "popup")
        registerActionPage("actionApp", key: "app", noun: "mini app")
    }

    private func registerActionPage(_ type: String, key: String, noun: String) {
        register(type) { [weak self] o in
            guard let self else { return }
            let project = o["project"] as? String ?? ""
            let name = o["action"] as? String ?? ""
            var reply: [String: Any] = ["t": type, "project": project, "action": name]
            guard let idx = self.world.projectIndex(project) else {
                reply["ok"] = false
                reply["error"] = "Couldn't find the project."
                self.push(reply)
                return
            }
            guard let action = self.world.projects[idx].actions.first(where: { $0["name"] as? String == name }),
                  action[key] != nil else {
                reply["ok"] = false
                reply["error"] = "This action has no \(noun)."
                self.push(reply)
                return
            }
            let releases = name == "releases"
            reply["ok"] = true
            reply[key] = [
                "refresh": 0,
                "html": demoPopupPage(releases ? "popup-releases" : "popup-stars"),
                "data": releases ? demoReleases : demoStars,
                "updatedAt": Int(Date().timeIntervalSince1970 * 1000),
                "stale": false,
            ] as [String: Any]
            self.pushAfter(0.4, reply)
        }
    }
}

private let demoStars: [String: Any] = [
    "total": 1396,
    "months": [
        ["label": "Jun", "stars": 64],
        ["label": "Jul", "stars": 98],
        ["label": "Aug", "stars": 131],
        ["label": "Sep", "stars": 156],
        ["label": "Oct", "stars": 189],
        ["label": "Nov", "stars": 212],
    ],
]

private let demoReleases: [String: Any] = [
    "next": "v2.4.2",
    "releases": [
        ["tag": "v2.4.1", "notes": "Rate limits per route", "age": "3d ago"],
        ["tag": "v2.4.0", "notes": "gRPC upstreams", "age": "2w ago"],
        ["tag": "v2.3.2", "notes": "Fix header casing on retries", "age": "1mo ago"],
    ],
]

/// A sample page, the same file the Android demo ships (mobile/shared/demo).
private func demoPopupPage(_ name: String) -> String {
    guard let url = Bundle.main.url(forResource: name, withExtension: "html", subdirectory: "demo"),
          let page = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return page
}
