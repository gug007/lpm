import SwiftUI
import UIKit

@main
struct LpmMobileApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel()
    @AppStorage(AppearanceMode.storageKey) private var appearanceRaw = AppearanceMode.system.rawValue

    init() {
        // Pin every nav-bar state (standard/compact/scrollEdge) to the same
        // compact, adaptive appearance and turn off large titles. This is what
        // fixes the push glitch where the bar briefly rendered its tall large-title
        // variant before settling — height is now stable from the first frame.
        // The terminal screen layers its own translucent background over this; all
        // other screens (Project detail, etc.) get this clean adaptive bar.
        let bar = UINavigationBar.appearance()
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        bar.standardAppearance = appearance
        bar.compactAppearance = appearance
        bar.scrollEdgeAppearance = appearance
        bar.prefersLargeTitles = false
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .onAppear { appDelegate.attach(model) }
                .preferredColorScheme((AppearanceMode(rawValue: appearanceRaw) ?? .system).colorScheme)
        }
    }
}
