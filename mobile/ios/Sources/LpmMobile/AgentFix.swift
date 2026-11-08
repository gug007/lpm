import Foundation

extension AppModel {
    /// Starts a Fix with … row's pick in a new tab, `prompt` its agent's first
    /// prompt: the bare agent, or `action` with its input `values`. An item run
    /// from a `last-used` split becomes the one it leads with, as on the desktop.
    func startFix(_ project: String, option: LaunchpadOption, action: Action?, values: [String: String] = [:],
                  prompt: String, onSpawn: @escaping (TerminalInfo) -> Void) {
        Haptics.tap()
        guard let action else {
            newTerminal(project, launch: AgentLaunch(agent: option.agent, prompt: prompt), onSpawn: onSpawn)
            return
        }
        if let group = option.group, let key = group.lastUsedKey(running: action) {
            ActionPrimaryMemory.shared.remember(key, project: project, group: group.name)
        }
        runAction(project, action: action.name, inputValues: values, confirmed: true, prompt: prompt,
                  onSpawn: onSpawn)
    }
}
