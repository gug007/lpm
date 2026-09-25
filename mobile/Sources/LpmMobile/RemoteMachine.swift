import Foundation

/// One machine the connected Mac itself connects to — a Linux server or another
/// Mac — as listed by the `machines` reply.
struct RemoteMachine: Identifiable, Equatable {
    enum State: String {
        /// The Mac is connected to it and can get this phone a pairing code.
        case ready
        /// The Mac isn't connected to it right now.
        case offline
        /// Its lpm is too old to hand out a pairing code on request.
        case update
    }

    let slug: String
    let name: String
    let platform: String?
    /// The id it gives phones, matching `MacRecord.serverId`. Nil until the Mac has
    /// talked to a build of it that reports one.
    let serverId: String?
    let state: State

    var id: String { slug }
    var isLinuxHost: Bool { platform == "linux" }

    init(_ o: [String: Any]) {
        slug = o["slug"] as? String ?? ""
        name = o["name"] as? String ?? ""
        platform = nonEmpty(o["platform"])
        serverId = nonEmpty(o["serverId"])
        state = State(rawValue: o["state"] as? String ?? "") ?? .offline
    }
}

/// A pairing code one of the Mac's machines armed for this phone, with every
/// address the phone might reach it at and the certificate to pin.
struct MachinePairOffer {
    let slug: String
    let code: String
    let hosts: [String]
    let port: Int
    let fingerprint: String?
    let serverId: String?
    let name: String
    let platform: String?

    init(_ o: [String: Any]) {
        slug = o["slug"] as? String ?? ""
        code = o["code"] as? String ?? ""
        hosts = o["hosts"] as? [String] ?? []
        let p = o["port"] as? Int ?? 0
        port = p > 0 ? p : Int(MacStore.defaultPort)
        fingerprint = nonEmpty(o["fingerprint"])
        serverId = nonEmpty(o["serverId"])
        name = o["name"] as? String ?? ""
        platform = nonEmpty(o["platform"])
    }
}

private func nonEmpty(_ value: Any?) -> String? {
    guard let s = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else {
        return nil
    }
    return s
}
