import SwiftUI

/// How much each of the Mac's projects is heard about.
enum ProjectNotifyLevel: String, CaseIterable, Identifiable {
    case all, waiting, off

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .waiting: return "Only when it needs me"
        case .off: return "Off"
        }
    }
}

struct ProjectLevelsSection: View {
    @Environment(AppModel.self) private var model

    private var projects: [Project] {
        model.projects.filter { !$0.isDuplicate }
    }

    var body: some View {
        if !projects.isEmpty {
            Section {
                ForEach(projects) { project in
                    Picker(project.label.isEmpty ? project.name : project.label, selection: level(project.name)) {
                        ForEach(ProjectNotifyLevel.allCases) { level in
                            Text(level.label).tag(level)
                        }
                    }
                }
            } header: {
                Text("Projects")
            } footer: {
                Text("Only when it needs me: an agent waiting on you, or an automation asking a question.")
            }
        }
    }

    private func level(_ project: String) -> Binding<ProjectNotifyLevel> {
        Binding {
            ProjectNotifyLevel(rawValue: model.notifyProjectLevels[project] ?? "") ?? .all
        } set: { level in
            model.notifyProjectLevels[project] = level == .all ? nil : level.rawValue
        }
    }
}

struct QuietHoursSection: View {
    @State private var quiet = QuietHours.load()

    var body: some View {
        Section {
            Toggle("Quiet hours", isOn: $quiet.enabled)
            if quiet.enabled {
                DatePicker("From", selection: time(\.start), displayedComponents: .hourAndMinute)
                DatePicker("To", selection: time(\.end), displayedComponents: .hourAndMinute)
                Toggle("Let “needs you” through", isOn: $quiet.letWaitingThrough)
            }
        } footer: {
            Text("Notifications still arrive, without a sound or a banner. To hear from only some projects during a Focus, add lpm under Settings › Focus › Focus Filters.")
        }
        .onChange(of: quiet) { _, quiet in quiet.save() }
    }

    private func time(_ field: WritableKeyPath<QuietHours, Int>) -> Binding<Date> {
        Binding {
            Calendar.current.date(bySettingHour: quiet[keyPath: field] / 60,
                                  minute: quiet[keyPath: field] % 60, second: 0, of: Date()) ?? Date()
        } set: { date in
            let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
            quiet[keyPath: field] = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        }
    }
}
