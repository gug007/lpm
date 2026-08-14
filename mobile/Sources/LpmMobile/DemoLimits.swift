import Foundation

private let hourSeconds: Double = 3_600
private let daySeconds: Double = 86_400

/// Demo handlers for the Usage screen (agent plan-usage meters). A static
/// snapshot, like the Stats fixtures — nothing lives in `DemoWorld`.
extension DemoServer {
    func registerLimitsHandlers() {
        register("limits") { [weak self] _ in
            guard let self else { return }
            self.pushAfter(0.5) { [weak self] in self?.limitsPayload(t: "limits", ok: true) }
            // A scripted follow-up so the reader also sees a live meter update,
            // not just the first read.
            self.pushAfter(6.0) { [weak self] in
                self?.limitsPayload(t: "limits-changed", ok: nil, advanced: true)
            }
        }
    }

    /// Built at fire time so every window — and the sender's clock stamp, which
    /// here is the same device's, leaving a zero offset — is measured against the
    /// clock the reader's phone will render it with.
    private func limitsPayload(t: String, ok: Bool?, advanced: Bool = false) -> [String: Any] {
        let now = Date().timeIntervalSince1970
        let nowMs = Int(now * 1000)
        var payload: [String: Any] = [
            "t": t,
            "limits": [
                "claude:default": [
                    "provider": "claude",
                    "accountId": "default",
                    "label": "Sonnet 4.6",
                    "fiveHour": limitWindow(used: advanced ? 71 : 62,
                                            resetsIn: 3 * hourSeconds, now: now),
                    "weekly": limitWindow(used: advanced ? 28 : 27,
                                          resetsIn: 4 * daySeconds, now: now),
                    "updatedAt": advanced ? nowMs : nowMs - 90_000,
                ],
                // No accountId: the Mac omits it for Codex, so the phone's
                // optional decode gets exercised here too.
                "codex": [
                    "provider": "codex",
                    "label": "pro",
                    "fiveHour": limitWindow(used: 19, resetsIn: 4 * hourSeconds, now: now),
                    "weekly": limitWindow(used: advanced ? 98 : 96,
                                          resetsIn: 2 * daySeconds + 10 * hourSeconds, now: now),
                    "updatedAt": advanced ? nowMs : nowMs - 90_000,
                ],
            ],
            "claudeEnabled": true,
            "now": nowMs,
        ]
        if let ok { payload["ok"] = ok }
        return payload
    }

    /// `resetsAt` is unix SECONDS while the card's `updatedAt` is millis — the
    /// units differ inside one object, and a normalized `resetsAt` renders every
    /// meter as already expired.
    private func limitWindow(used: Double, resetsIn: Double, now: Double) -> [String: Any] {
        ["usedPercent": used, "resetsAt": Int(now + resetsIn)]
    }
}
