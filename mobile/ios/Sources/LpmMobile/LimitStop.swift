import Foundation

/// Why a Claude tab stopped, as the Mac lists it with the terminal: its
/// account's limit, the account put on hold, or one model's weekly limit; and
/// where the conversation can go on. Worded as the desktop's bar words it.
struct LimitStop: Hashable {
    struct Offer: Hashable {
        let account: String
        let label: String
        let fiveHour: Double?
        let weekly: Double?
        /// Every account with room is close to a limit; this one has the most.
        let near: Bool
    }

    struct FirstFree: Hashable {
        let account: String
        let label: String
        let resetsAt: Int
    }

    /// "limit", "hold" or "model".
    let kind: String
    let account: String
    let accountLabel: String
    /// "fiveHour" or "weekly", with "limit".
    let window: String?
    let model: String?
    /// Unix seconds; 0 when unknown or for a hold.
    let resetsAt: Int
    let offer: Offer?
    let firstFree: FirstFree?

    init?(_ o: [String: Any]?) {
        guard let o, let kind = o["kind"] as? String, !kind.isEmpty else { return nil }
        self.kind = kind
        account = o["account"] as? String ?? ""
        accountLabel = o["accountLabel"] as? String ?? ""
        window = o["window"] as? String
        model = o["model"] as? String
        resetsAt = o["resetsAt"] as? Int ?? 0
        offer = (o["offer"] as? [String: Any]).flatMap { f in
            guard let account = f["account"] as? String, !account.isEmpty else { return nil }
            return Offer(account: account,
                         label: f["label"] as? String ?? account,
                         fiveHour: (f["fiveHour"] as? NSNumber)?.doubleValue,
                         weekly: (f["weekly"] as? NSNumber)?.doubleValue,
                         near: f["near"] as? Bool ?? false)
        }
        firstFree = (o["firstFree"] as? [String: Any]).flatMap { f in
            guard let account = f["account"] as? String, !account.isEmpty else { return nil }
            return FirstFree(account: account, label: f["label"] as? String ?? account,
                             resetsAt: f["resetsAt"] as? Int ?? 0)
        }
    }

    /// "Main login hit its weekly limit", "Main login was put on hold".
    var headline: String {
        switch kind {
        case "hold": return "\(accountLabel) was put on hold"
        case "model": return "\(accountLabel) hit its weekly \(model ?? "model") limit"
        default: return "\(accountLabel) hit its \(window == "fiveHour" ? "5-hour" : "weekly") limit"
        }
    }

    /// "resets in 2d 14h"; empty for a hold or an unknown reset. `now` is unix millis.
    func reset(now: Double) -> String {
        resetText(resetsAt, now: now)
    }

    /// Where the conversation can go, or why it can't.
    func detail(now: Double) -> String {
        switch kind {
        case "hold":
            return "Account switching is paused. Conversations stay on their account until you turn switching back on."
        case "model":
            return "This account still works with other models. Type /model to switch."
        default:
            if let offer {
                let room = offer.near ? "has the most room" : "has room"
                let used = [("5-hour", offer.fiveHour), ("weekly", offer.weekly)].compactMap { name, pct in
                    pct.map { "\(name) \(Int($0.rounded()))%" }
                }
                return ([("\(offer.label) \(room)")] + used).joined(separator: " · ")
            }
            if let firstFree {
                let span = resetShort(firstFree.resetsAt, now: now)
                let when = span == "now" ? "now" : "in \(span)"
                return span.isEmpty
                    ? "Every account is at a limit."
                    : "Every account is at a limit. \(firstFree.label) resets first, \(when)."
            }
            return "No other account in your list has room."
        }
    }

    /// A limit or model stop is over once its window resets; a hold, which has
    /// no reset, lasts until the Mac says otherwise.
    func holds(now: Double) -> Bool {
        resetsAt == 0 || Double(resetsAt) * 1000 > now
    }
}
