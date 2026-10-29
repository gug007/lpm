import SwiftUI
import UIKit
import UserNotifications

struct NotificationSettingsView: View {
    @Environment(AppModel.self) private var model

    // Whether the OS-level permission was denied; if so the master toggle can't
    // actually deliver anything, so we surface a jump to Settings. Not asked yet
    // offers the prompt itself.
    @State private var systemDenied = false
    @State private var notAsked = false

    private var isConnected: Bool {
        if case .ready = model.connection { return true }
        return false
    }

    var body: some View {
        @Bindable var model = model
        return Form {
            Section {
                Toggle("Push notifications", isOn: $model.notifyEnabled)
            } footer: {
                if systemDenied {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Notifications are turned off for lpm in your device settings.")
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                } else if notAsked {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Get a nudge on your phone when something happens while the app is closed.")
                        Button("Allow notifications") {
                            model.allowNotifications { _ in refreshSystemStatus() }
                        }
                    }
                } else {
                    Text("Get a nudge on your phone when something happens while the app is closed.")
                }
            }

            Section {
                Toggle("Waiting for you", isOn: $model.notifyWaiting)
                Toggle("Finished", isOn: $model.notifyDone)
                Toggle("Error", isOn: $model.notifyError)
            } header: {
                Text("Agents")
            } footer: {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Waiting for you: an agent needs your input or approval. Finished: a run wrapped up. Error: something went wrong.")
                    if !isConnected {
                        Text("Not connected to your Mac — changes apply the next time this phone connects.")
                    }
                }
            }
            .dimmed(unless: model.notifyEnabled)

            ProjectLevelsSection()
                .dimmed(unless: model.notifyEnabled)

            QuietHoursSection()
                .dimmed(unless: model.notifyEnabled)

            Section {
                Toggle("Started", isOn: $model.notifyAutomationStarted)
                Toggle("Finished", isOn: $model.notifyAutomationDone)
                Toggle("Error or timeout", isOn: $model.notifyAutomationError)
            } header: {
                Text("Automations")
            } footer: {
                Text("Choose which automation outcomes send a notification when this app is closed.")
            }
            .dimmed(unless: model.notifyEnabled)

            Section {
                Toggle("Weekly recap", isOn: $model.notifyWeeklyRecap)
            } footer: {
                Text("Mondays, when your week in lpm is ready")
            }
            .dimmed(unless: model.notifyEnabled)

            Section {
                Toggle("Show agents on the Lock Screen", isOn: $model.liveActivitiesEnabled)
            } header: {
                Text("Live Activity")
            } footer: {
                Text("While agents work, a Live Activity shows them on the Lock Screen and in the Dynamic Island.")
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: refreshSystemStatus)
    }

    private func refreshSystemStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                systemDenied = settings.authorizationStatus == .denied
                notAsked = settings.authorizationStatus == .notDetermined
            }
        }
    }
}

private extension View {
    /// Greyed out and inert while notifications are off.
    func dimmed(unless on: Bool) -> some View {
        disabled(!on).opacity(on ? 1 : 0.4)
    }
}
