import Foundation

/// A place on another computer the composer's @ menu offers: one of its lpm
/// projects or its home folder. `path` reads `NAME:PATH`, and `insert` replaces
/// the "@fragment" verbatim. Two places can share a path (a project rooted at
/// the home folder reads `~`, like the Home folder place), so `id` is the
/// place's position in the reply.
struct MentionPlace: Identifiable, Equatable {
    let id: Int
    let label: String
    let path: String
    let insert: String

    init(_ o: [String: Any], id: Int) {
        self.id = id
        label = o["label"] as? String ?? ""
        path = o["path"] as? String ?? ""
        insert = o["insert"] as? String ?? ""
    }
}

/// A paired computer an agent on this Mac can reach with `lpm exec --on` and
/// `lpm cp`, with a summary of what its policy allows and its places.
struct MentionComputer: Identifiable, Equatable {
    let name: String
    let slug: String
    let access: String
    let places: [MentionPlace]

    var id: String { slug.isEmpty ? name : slug }
    var heading: String { "\(name) · \(access)" }
}

extension MentionComputer {
    init(_ o: [String: Any]) {
        name = o["name"] as? String ?? ""
        slug = o["slug"] as? String ?? ""
        access = o["access"] as? String ?? ""
        places = (o["places"] as? [[String: Any]] ?? []).enumerated()
            .map { MentionPlace($0.element, id: $0.offset) }
    }
}

extension Array where Element == MentionComputer {
    /// Every place for an empty fragment; otherwise the places whose label, path
    /// or computer name holds it, ignoring case. A computer left with no place drops out.
    func matching(_ fragment: String) -> [MentionComputer] {
        compactMap { computer in
            let places = fragment.isEmpty || computer.name.localizedCaseInsensitiveContains(fragment)
                ? computer.places
                : computer.places.filter {
                    $0.label.localizedCaseInsensitiveContains(fragment)
                        || $0.path.localizedCaseInsensitiveContains(fragment)
                }
            guard !places.isEmpty else { return nil }
            return MentionComputer(name: computer.name, slug: computer.slug,
                                   access: computer.access, places: places)
        }
    }
}
