import SwiftUI
import UIKit
import UserNotifications

struct NotificationSettingsSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    // Whether the OS-level permission was denied; if so the master toggle can't
    // actually deliver anything, so we surface a jump to Settings.
    @State private var systemDenied = false

    var body: some View {
        NavigationStack {
            Form {
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
                    } else {
                        Text("Get a nudge on your phone when something happens while the app is closed.")
                    }
                }

                Section {
                    Toggle("Waiting for you", isOn: $model.notifyWaiting)
                    Toggle("Finished", isOn: $model.notifyDone)
                    Toggle("Error", isOn: $model.notifyError)
                } footer: {
                    Text("Waiting for you: an agent needs your input or approval. Finished: a run wrapped up. Error: something went wrong.")
                }
                .disabled(!model.notifyEnabled)
                .opacity(model.notifyEnabled ? 1 : 0.4)
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
            .onAppear(perform: refreshSystemStatus)
        }
    }

    private func refreshSystemStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                systemDenied = settings.authorizationStatus == .denied
            }
        }
    }
}
