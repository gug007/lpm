import Foundation

extension AppModel {
    /// The Mac keeps lpm commands: its `features` has "lpmCommands".
    var lpmCommandsAvailable: Bool {
        client?.hostFeatures.contains(LpmClient.lpmCommandsFeature) == true
    }

    /// The Mac can file other skills in folders and convert them.
    var lpmOtherSkillsAvailable: Bool {
        client?.hostFeatures.contains(LpmClient.lpmOtherSkillsFeature) == true
    }

    /// The Mac can keep folders inside folders.
    var lpmNestedFoldersAvailable: Bool {
        client?.hostFeatures.contains(LpmClient.lpmNestedFoldersFeature) == true
    }

    /// Counts a sent `/` command that isn't an lpm skill, for the menu's Most used.
    func noteCommandUsed(project: String, name: String) {
        guard let client, client.hostFeatures.contains(LpmClient.lpmCommandUsedFeature) else { return }
        client.noteCommandUsed(project: project, name: name)
    }

    func wireLpmCommands(_ c: LpmClient) {
        c.onLpmCommandReply = { [weak self, weak c] reply in
            guard let self, let c, c === self.client else { return }
            self.lpmCommands.deliver(reply)
        }
        c.onLpmCommandsChanged = { [weak self, weak c] project in
            guard let self, let c, c === self.client else { return }
            self.lpmCommands.changed(project)
        }
    }
}
