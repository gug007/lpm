import SwiftUI

/// A tip shown once, where the feature it points at first becomes useful.
enum AppTip: String, CaseIterable {
    case projectMenu
    case tabMenu
    case actions
    case review

    var title: String {
        switch self {
        case .projectMenu: return "Hold a project for more"
        case .tabMenu: return "Hold a tab for more"
        case .actions: return "Run the project's actions"
        case .review: return "Review what changed"
        }
    }

    var message: String {
        switch self {
        case .projectMenu:
            return "Pin it to the top, start it with a profile, set its status or move it into a folder."
        case .tabMenu:
            return "Pin or rename it, fork its session here or into a copy, or close the other tabs."
        case .actions:
            return "Tap the bolt in the bar for the buttons this project has on your Mac."
        case .review:
            return "Review Changes in the ••• menu shows every diff, then commits, pushes or opens a pull request."
        }
    }

    var symbol: String {
        switch self {
        case .projectMenu, .tabMenu: return "hand.tap"
        case .actions: return "bolt"
        case .review: return "checklist"
        }
    }
}

/// Which tips were closed, kept on this phone. Settings › Tips shows them again.
@Observable @MainActor
final class TipsStore {
    static let shared = TipsStore()

    private static let key = "lpm.tips.closed"

    private(set) var closed: Set<String>
    /// The App Store screenshot build shows the screens without tips.
    private let hidden = ProcessInfo.processInfo.environment["LPM_SHOT_ROUTE"] != nil

    private init() {
        closed = Set(UserDefaults.standard.stringArray(forKey: Self.key) ?? [])
    }

    func shows(_ tip: AppTip) -> Bool { !hidden && !closed.contains(tip.rawValue) }

    /// The first of `tips` still to show, so a screen shows one tip at a time.
    func first(_ tips: [AppTip]) -> AppTip? { tips.first(where: shows) }

    func close(_ tip: AppTip) {
        closed.insert(tip.rawValue)
        save()
    }

    func reset() {
        closed = []
        save()
    }

    var anyClosed: Bool { !closed.isEmpty }

    private func save() {
        UserDefaults.standard.set(closed.sorted(), forKey: Self.key)
    }
}

/// A tip as a list row: its symbol, what to try and a close button.
struct TipCard: View {
    let tip: AppTip

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: tip.symbol)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(tip.title)
                    .font(.subheadline.weight(.semibold))
                Text(tip.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Button {
                withAnimation { TipsStore.shared.close(tip) }
            } label: {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Close tip")
        }
        .padding(.vertical, 4)
    }
}

/// The tip, when there is one to show, as a section of its own at the top of a list.
struct TipSection: View {
    let tip: AppTip?

    var body: some View {
        if let tip {
            Section { TipCard(tip: tip) }
        }
    }
}
