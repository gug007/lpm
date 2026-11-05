import ActivityKit
import Foundation

private typealias AgentActivity = ActivityKit.Activity<AgentActivityAttributes>

/// The live Mac's agents on the Lock Screen and in the Dynamic Island while any
/// is at work. The app starts the Live Activity and keeps it current while it
/// shows that Mac; once the app leaves the screen the Mac updates it by push,
/// through the activity's own token, which `onToken` hands over for registering.
/// Another Mac's activity, from when that one was on screen, runs on its pushes.
@MainActor
final class LiveActivityController {
    /// How long the last reading stays up once nothing is at work — when it still
    /// lists an agent; with none left it goes at once.
    private static let linger: TimeInterval = 15 * 60

    var onToken: ((_ serverId: String, _ token: String) -> Void)?
    var onDismissed: ((_ serverId: String) -> Void)?

    private var shown: [String: LiveSnapshot] = [:]
    private(set) var tokens: [String: String] = [:]
    private var watching: Set<String> = []

    init() {
        AgentActivity.activities.forEach(watch)
    }

    /// Show the live Mac's reading: start an activity once something is at work,
    /// update it as that changes, end it when nothing is left.
    func show(_ snapshot: LiveSnapshot, serverId: String, macName: String) async {
        let current = activity(for: serverId)
        guard snapshot != shown[serverId] || current == nil,
              let blob = snapshot.sealed() else { return }
        let content = ActivityContent(state: AgentActivityAttributes.ContentState(blob: blob), staleDate: nil)
        if let current {
            if snapshot.live {
                await current.update(content)
            } else if snapshot.agents.isEmpty {
                await current.end(content, dismissalPolicy: .immediate)
            } else {
                await current.end(content, dismissalPolicy: .after(Date().addingTimeInterval(Self.linger)))
            }
        } else if snapshot.live, ActivityAuthorizationInfo().areActivitiesEnabled {
            await dismissEnded(serverId)
            let attributes = AgentActivityAttributes(serverId: serverId, macName: macName)
            guard let started = try? AgentActivity.request(attributes: attributes, content: content,
                                                           pushType: .token) else { return }
            watch(started)
        }
        shown[serverId] = snapshot
    }

    /// Live Activities were turned off: take every one down now.
    func endAll() async {
        for activity in AgentActivity.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        shown = [:]
        tokens = [:]
    }

    /// The Mac's last reading, still up after it ended: the new activity replaces it,
    /// so the Lock Screen never shows the same Mac twice.
    private func dismissEnded(_ serverId: String) async {
        for activity in AgentActivity.activities
        where activity.attributes.serverId == serverId && activity.activityState != .active {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private func activity(for serverId: String) -> AgentActivity? {
        AgentActivity.activities.first {
            $0.attributes.serverId == serverId && $0.activityState == .active
        }
    }

    private func watch(_ activity: AgentActivity) {
        guard watching.insert(activity.id).inserted else { return }
        let serverId = activity.attributes.serverId
        Task { [weak self] in
            for await data in activity.pushTokenUpdates {
                let hex = data.map { String(format: "%02x", $0) }.joined()
                self?.tokens[serverId] = hex
                self?.onToken?(serverId, hex)
            }
        }
        Task { [weak self] in
            for await state in activity.activityStateUpdates where state != .active && state != .stale {
                self?.watching.remove(activity.id)
                self?.shown[serverId] = nil
                if self?.activity(for: serverId) == nil { self?.tokens[serverId] = nil }
                if state == .dismissed { self?.onDismissed?(serverId) }
                return
            }
        }
    }
}
