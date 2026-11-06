import Foundation

/// Demo handler for `actionPopup`: api-gateway's Stars action shows the repo's
/// GitHub stars month by month, drawn by the sample page in mobile/shared/demo.
extension DemoServer {
    func registerActionPopupHandlers() {
        register("actionPopup") { [weak self] o in
            guard let self else { return }
            let project = o["project"] as? String ?? ""
            let name = o["action"] as? String ?? ""
            var reply: [String: Any] = ["t": "actionPopup", "project": project, "action": name]
            guard let idx = self.world.projectIndex(project) else {
                reply["ok"] = false
                reply["error"] = "Couldn't find the project."
                self.push(reply)
                return
            }
            guard let action = self.world.projects[idx].actions.first(where: { $0["name"] as? String == name }),
                  action["popup"] != nil else {
                reply["ok"] = false
                reply["error"] = "This action has no popup."
                self.push(reply)
                return
            }
            reply["ok"] = true
            reply["popup"] = [
                "refresh": 0,
                "html": demoPopupPage(),
                "data": demoStars,
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

/// The sample page, the same file the Android demo ships (mobile/shared/demo).
private func demoPopupPage() -> String {
    guard let url = Bundle.main.url(forResource: "popup-stars", withExtension: "html", subdirectory: "demo"),
          let page = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return page
}
