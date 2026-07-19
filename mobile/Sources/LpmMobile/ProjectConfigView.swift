import SwiftUI

/// Which editor the hub is presenting. Identifiable so it drives a single
/// `.sheet(item:)`.
private enum ConfigRoute: Identifiable {
    case addService
    case editService(String)
    case addProfile
    case editProfile(String)
    case addAction
    case editAction(String)
    case yaml

    var id: String {
        switch self {
        case .addService: return "add-service"
        case .editService(let key): return "service:\(key)"
        case .addProfile: return "add-profile"
        case .editProfile(let name): return "profile:\(name)"
        case .addAction: return "add-action"
        case .editAction(let key): return "action:\(key)"
        case .yaml: return "yaml"
        }
    }
}

/// The per-project configuration hub: lists the project's services, profiles,
/// and actions with editors to add, change, or remove each, plus an entry to
/// the raw configuration file. Presented as a sheet from the project menu.
struct ProjectConfigView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: Project

    @State private var route: ConfigRoute?

    // The live project, re-read each render so the lists reflect edits the
    // moment a save refreshes the projects push.
    private var live: Project {
        model.projects.first { $0.name == project.name } ?? project
    }

    var body: some View {
        NavigationStack {
            List {
                servicesSection
                profilesSection
                actionsSection
                configFileSection
            }
            .navigationTitle("Configuration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .sheet(item: $route) { route in
            editor(for: route)
        }
        // Surface a swipe-delete failure here; a child editor sheet owns its own
        // copy of this alert, so gate on no sheet being presented to avoid two
        // presentations of the same shared error.
        .alert("Couldn't update configuration", isPresented: hubErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
    }

    // MARK: sections

    private var servicesSection: some View {
        Section("Services") {
            ForEach(live.allServices) { service in
                Button {
                    route = .editService(service.name)
                } label: {
                    disclosureRow(title: service.name,
                                  subtitle: service.port > 0 ? "Port \(service.port)" : nil)
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        delete { model.deleteService(project: live.name, key: service.name) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
            addRow(title: "Add Service") { route = .addService }
        }
    }

    private var profilesSection: some View {
        Section("Profiles") {
            ForEach(live.profiles) { profile in
                Button {
                    route = .editProfile(profile.name)
                } label: {
                    disclosureRow(title: profile.name, subtitle: serviceCount(profile.services.count))
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        delete { model.deleteProfile(project: live.name, name: profile.name) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
            addRow(title: "Add Profile") { route = .addProfile }
        }
    }

    private var actionsSection: some View {
        Section("Actions") {
            ForEach(live.actions) { action in
                Button {
                    route = .editAction(action.name)
                } label: {
                    disclosureRow(title: actionTitle(action),
                                  subtitle: action.isRunnable ? nil : "Menu")
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        delete { model.deleteAction(project: live.name, key: action.name) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
            addRow(title: "Add Action") { route = .addAction }
        }
    }

    private var configFileSection: some View {
        Section {
            Button {
                route = .yaml
            } label: {
                disclosureRow(title: "Edit Configuration File", subtitle: nil)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: row helpers

    private func disclosureRow(title: String, subtitle: String?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func addRow(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: "plus")
        }
    }

    private func actionTitle(_ action: Action) -> String {
        action.emoji.isEmpty ? action.label : "\(action.emoji)  \(action.label)"
    }

    private func serviceCount(_ count: Int) -> String {
        "\(count) service\(count == 1 ? "" : "s")"
    }

    private var hubErrorPresented: Binding<Bool> {
        Binding(get: { route == nil && model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private func delete(_ perform: () -> Void) {
        Haptics.warning()
        perform()
    }

    @ViewBuilder
    private func editor(for route: ConfigRoute) -> some View {
        switch route {
        case .addService:
            ServiceEditorSheet(project: live, context: .create).environment(model)
        case .editService(let key):
            ServiceEditorSheet(project: live, context: .edit(key: key)).environment(model)
        case .addProfile:
            ProfileEditorSheet(project: live, context: .create).environment(model)
        case .editProfile(let name):
            ProfileEditorSheet(project: live, context: .edit(name: name)).environment(model)
        case .addAction:
            ActionEditorSheet(project: live, context: .create).environment(model)
        case .editAction(let key):
            ActionEditorSheet(project: live, context: .edit(key: key)).environment(model)
        case .yaml:
            YamlConfigEditorSheet(project: live).environment(model)
        }
    }
}
