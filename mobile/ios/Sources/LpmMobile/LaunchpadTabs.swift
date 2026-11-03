import Foundation

/// Something a new tab can start with its prompt, as the desktop's empty project
/// offers it: a project action that opens an agent (and the split button or menu
/// it sits in), or a bare agent when the project has none.
struct LaunchpadOption: Identifiable {
    let id: String
    let label: String
    let agent: String
    var action: Action?
    var group: Action?
}

/// One entry of the New Tab sheet's Start list: a single option, or a header split
/// button or menu holding several.
struct LaunchpadTab: Identifiable {
    let id: String
    let label: String
    let options: [LaunchpadOption]
    /// What the entry itself picks; nil for a menu, which only opens.
    let primary: LaunchpadOption?
}

/// The project's actions that open one of `agents`, split buttons and menus kept
/// whole with only their agent items, each split led by the item its button runs.
/// The bare agents when the project has none. `skipOwnTasks` leaves out the actions
/// that start their agent on a task of their own, for a prompt that is the task.
/// Mirrors the desktop's launchpadTabs.
func launchpadTabs(_ actions: [Action], project: String, agents: [AgentOption],
                   memory: ActionPrimaryMemory = .shared, skipOwnTasks: Bool = false) -> [LaunchpadTab] {
    let ids = agents.map(\.id)
    func option(_ action: Action, in group: Action? = nil) -> LaunchpadOption? {
        guard action.type == "terminal", let agent = agentCLI(in: action.cmd, among: ids),
              !(skipOwnTasks && action.startsOwnTask(agent: agent)) else { return nil }
        return LaunchpadOption(id: action.name, label: action.label, agent: agent, action: action, group: group)
    }
    func descendants(_ actions: [Action]) -> [Action] {
        actions.flatMap { [$0] + descendants($0.children) }
    }
    var tabs: [LaunchpadTab] = []
    for action in actions {
        let own = option(action)
        let children = descendants(action.children).compactMap { option($0, in: action) }
        if children.isEmpty {
            if let own { tabs.append(LaunchpadTab(id: own.id, label: own.label, options: [own], primary: own)) }
            continue
        }
        let options = (own.map { [$0] } ?? []) + children
        let lead = action.primaryChild(remembered: memory.child(project: project, group: action.name))
        let primary = options.first { $0.id == lead?.name }
            ?? (lead != nil || !action.cmd.isEmpty ? options.first : nil)
        tabs.append(LaunchpadTab(id: action.name, label: action.label, options: options, primary: primary))
    }
    if !tabs.isEmpty { return tabs }
    return agents.map {
        let bare = LaunchpadOption(id: $0.id, label: $0.label, agent: $0.id)
        return LaunchpadTab(id: bare.id, label: bare.label, options: [bare], primary: bare)
    }
}

/// What the New Tab sheet last started: an option's id, or `terminal`, remembered
/// app-wide as the desktop remembers its empty project's pick.
enum NewTabLastOption {
    static let terminal = "terminal"
    static let defaultsKey = "newTab.lastOption"

    /// Before this was kept, the last agent picked stood for it.
    static func load(_ defaults: UserDefaults = .standard) -> String {
        if let id = defaults.string(forKey: defaultsKey) { return id }
        let agent = NewTabPick.load(defaults).agent
        return agent.isEmpty ? terminal : agent
    }

    static func save(_ id: String, _ defaults: UserDefaults = .standard) {
        defaults.set(id, forKey: defaultsKey)
    }
}
