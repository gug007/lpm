import Foundation

/// The other computer Demo Mode's @ menu offers for its main project: a Mac mini
/// holding the same project, reachable with `lpm exec --on` and `lpm cp`.
extension DemoServer {
    func mentionComputers(_ project: String) -> [[String: Any]] {
        guard project == "storefront" else { return [] }
        let name = "Mac mini"
        func place(_ label: String, _ path: String) -> [String: Any] {
            let reference = "\(name):\(path)"
            return ["label": label, "path": reference,
                    "insert": "\(reference) (on another computer; reach it with lpm exec --on and lpm cp)"]
        }
        return [[
            "name": name,
            "access": "commands · copy from it",
            "places": [place(project, "~/\(project)"), place("Home folder", "~")],
        ]]
    }
}
