import SwiftUI

/// What a new tab starts with, as the desktop's empty project offers it: a plain
/// terminal or the project's actions that open an agent, with a task for it, or a
/// past conversation to pick up again. A project without such actions offers the
/// agents the Mac can start, each with its model and effort. The pick (not the
/// task) is remembered for next time.
struct NewTabSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: Project
    let onOpen: (TerminalInfo) -> Void

    @State private var picked: String
    /// The model and effort a bare agent starts with.
    @State private var pick: NewTabPick
    @State private var prompt = ""
    @State private var detent: PresentationDetent
    @State private var gauntlet = ActionRunGauntlet()

    init(project: Project, onOpen: @escaping (TerminalInfo) -> Void) {
        self.project = project
        self.onOpen = onOpen
        let picked = NewTabLastOption.load()
        _picked = State(initialValue: picked)
        _pick = State(initialValue: NewTabPick.load())
        _detent = State(initialValue: picked == NewTabLastOption.terminal ? .medium : .large)
    }

    private var options: [AgentOption]? { model.agentLaunch.options }
    private var tabs: [LaunchpadTab]? {
        options.map { launchpadTabs(model.canPromptActions ? project.actions : [], project: project.name, agents: $0) }
    }
    private var option: LaunchpadOption? { tabs?.flatMap(\.options).first { $0.id == picked } }
    /// The agent a bare option starts, whose model and effort can be picked.
    private var bareAgent: AgentOption? {
        guard let option, option.action == nil else { return nil }
        return options?.first { $0.id == option.agent }
    }
    private var chosenModel: AgentModelOption? { bareAgent?.models.first { $0.value == pick.model } }
    /// A remembered agent can't show as picked until the Mac says it still offers it.
    private var awaitingOptions: Bool { options == nil && picked != NewTabLastOption.terminal }

    var body: some View {
        NavigationStack {
            Form {
                startSection
                if let bareAgent, !bareAgent.models.isEmpty {
                    modelSection(bareAgent)
                }
                if let option {
                    Section {
                        TextField("Task for \(option.label) (optional)", text: $prompt, axis: .vertical)
                            .lineLimit(2...6)
                    } header: {
                        SectionTitle(text: "First prompt")
                    }
                }
                if model.canResumeSessions(project) {
                    Section {
                        NavigationLink {
                            ResumeSessionList(project: project, onDone: { dismiss() }, onOpen: onOpen)
                                .onAppear { detent = .large }
                        } label: {
                            Label("Resume a Past Session…", systemImage: "clock.arrow.circlepath")
                        }
                    }
                }
            }
            .navigationTitle("New Tab")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Open", action: open).disabled(awaitingOptions)
                }
            }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .onAppear {
            fitPick()
            model.agentLaunch.loadOptions()
        }
        .onChange(of: options) { _, _ in fitPick() }
        // An agent brings its prompt row, and a bare one its model rows, so the
        // sheet makes room for them.
        .onChange(of: option?.id) { _, id in
            if id != nil { withAnimation { detent = .large } }
        }
        .actionRunGauntlet($gauntlet) { _, values in run(inputValues: values) }
    }

    private var startSection: some View {
        Section {
            NewTabStartRow(label: "Terminal", agent: nil, picked: !awaitingOptions && option == nil) {
                picked = NewTabLastOption.terminal
            }
            if let tabs {
                ForEach(tabs) { tab in
                    if tab.options.count > 1 {
                        NewTabGroupRow(tab: tab, picked: picked, onPick: choose)
                    } else if let only = tab.options.first {
                        NewTabStartRow(label: only.label, agent: only.agent, emoji: only.emoji, picked: picked == only.id) {
                            choose(only)
                        }
                    }
                }
            } else {
                TerminalRowSkeleton()
            }
        } header: {
            SectionTitle(text: "Start")
        }
    }

    private func modelSection(_ agent: AgentOption) -> some View {
        Section {
            Picker("Model", selection: Binding(
                get: { pick.model },
                set: { pick = pick.choosing(model: $0, effort: pick.effort, in: agent) }
            )) {
                ForEach(agent.models) { Text($0.label).tag($0.value) }
            }
            .pickerStyle(.menu)
            if let chosenModel, chosenModel.efforts.count > 1 {
                Picker("Effort", selection: $pick.effort) {
                    ForEach(chosenModel.efforts) { Text($0.label).tag($0.value) }
                }
                .pickerStyle(.menu)
            }
        } header: {
            SectionTitle(text: "Model")
        } footer: {
            Text("Applies to this tab only.")
        }
    }

    private func choose(_ next: LaunchpadOption) {
        picked = next.id
        fitPick()
    }

    /// The model pick follows the bare agent picked: one picked before keeps its
    /// model and effort where the Mac still offers them, another starts on defaults.
    private func fitPick() {
        guard let options else { return }
        if let bareAgent, pick.agent != bareAgent.id {
            pick = NewTabPick(agent: bareAgent.id).choosing(model: "", effort: "", in: bareAgent)
        } else {
            pick = pick.resolved(in: options)
        }
    }

    private func open() {
        NewTabLastOption.save(option?.id ?? NewTabLastOption.terminal)
        guard let option else { return launch(AgentLaunch()) }
        guard let action = option.action else {
            let chosen = pick.resolved(in: options ?? [])
            chosen.save()
            return launch(AgentLaunch(agent: chosen.agent, model: chosen.model, effort: chosen.effort,
                                      prompt: task))
        }
        if !gauntlet.begin(action) { run(inputValues: [:]) }
    }

    private var task: String { prompt.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func launch(_ launch: AgentLaunch) {
        Haptics.tap()
        model.newTerminal(project.name, launch: launch, onSpawn: onOpen)
        dismiss()
    }

    /// Run the picked action with the task as its agent's first prompt. An item run
    /// from a `last-used` split becomes the one it leads with, as on the desktop.
    private func run(inputValues: [String: String]) {
        guard let option, let action = option.action else { return }
        if let group = option.group, let key = group.lastUsedKey(running: action) {
            ActionPrimaryMemory.shared.remember(key, project: project.name, group: group.name)
        }
        Haptics.tap()
        model.runAction(project.name, action: action.name, inputValues: inputValues, confirmed: true,
                        prompt: task, onSpawn: onOpen)
        dismiss()
    }
}
