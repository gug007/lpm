import SwiftUI
import UIKit

/// Under a crashed service's log: the CI sheet's Fix with … rows, each opening a
/// new tab whose agent is told how the service crashed, and Copy log.
struct ServiceCrashPanel: View {
    @Environment(AppModel.self) private var model
    let project: String
    let log: String
    let onFix: (LaunchpadOption) -> Void

    @State private var copied = false

    private var actions: [Action] {
        guard model.canPromptActions else { return [] }
        return model.projects.first { $0.name == project }?.actions ?? []
    }
    private var tabs: [LaunchpadTab]? {
        model.agentLaunch.options.map {
            launchpadTabs(actions, project: project, agents: $0, skipOwnTasks: true)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            VStack(spacing: 0) {
                if model.canLaunchAgents {
                    if let tabs {
                        CiFixRows(tabs: tabs, detail: "Opens a new tab with the crash", panel: true, onFix: onFix)
                    } else {
                        ProgressView().controlSize(.small).panelRowFrame(true)
                    }
                }
                if !log.isEmpty {
                    copyRow.overlay(alignment: .top) {
                        if model.canLaunchAgents { PanelRowDivider() }
                    }
                }
            }
            .panelBackground()
            if model.canLaunchAgents {
                Text("The agent is told the command, the exit code and the errors in the log.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, PanelRow.inset)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 20)
        .onAppear { if model.canLaunchAgents { model.agentLaunch.loadOptions() } }
    }

    private var copyRow: some View {
        Button {
            UIPasteboard.general.string = log
            Haptics.success()
            copied = true
        } label: {
            Label {
                Text(copied ? "Copied" : "Copy log")
            } icon: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc").frame(width: 20)
            }
            .panelRowFrame(true)
        }
        .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            copied = false
        }
    }
}
