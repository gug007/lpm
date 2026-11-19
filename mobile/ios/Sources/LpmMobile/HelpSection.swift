import SwiftUI
import UIKit

/// Settings' Help: feedback to the lpm team, the video lessons, what changed in
/// lpm, and a rating, with which versions are talking at the foot.
struct HelpSection: View {
    @Environment(AppModel.self) private var model
    let onSendFeedback: () -> Void

    static let appStoreReview = URL(string: "https://apps.apple.com/app/id6788396977?action=write-review")!

    var body: some View {
        Section {
            Button(action: onSendFeedback) {
                Label("Send Feedback", systemImage: "envelope")
            }
            Link(destination: URL(string: "https://lpm.cx/lessons")!) {
                Label("Video Guides", systemImage: "play.rectangle")
            }
            Link(destination: URL(string: "https://lpm.cx/changelog")!) {
                Label("What's New in lpm", systemImage: "sparkles")
            }
            Link(destination: Self.appStoreReview) {
                Label("Rate lpm Link", systemImage: "star")
            }
        } header: {
            Text("Help")
        } footer: {
            Text(AppVersions.line(macVersion: model.macUpdate.version, demo: model.demoMode))
        }
    }
}

/// "lpm Link 1.85 · Mac runs lpm 0.7.62": which versions a report is about.
enum AppVersions {
    static var phone: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? ""
        return build.isEmpty || build == "1" ? version : "\(version) (\(build))"
    }

    static func line(macVersion: String?, demo: Bool) -> String {
        var parts = ["lpm Link \(phone)"]
        if demo {
            parts.append("Demo Mode")
        } else if let macVersion, !macVersion.isEmpty {
            parts.append("Mac runs lpm \(macVersion)")
        }
        return parts.joined(separator: " · ")
    }

    /// What a report carries about where it came from, and nothing about who.
    static func footer(macVersion: String?, demo: Bool) -> String {
        "\n\n---\n\(line(macVersion: macVersion, demo: demo)) · \(UIDevice.current.model) · iOS \(UIDevice.current.systemVersion)"
    }
}
