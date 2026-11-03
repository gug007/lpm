import Foundation

extension AppModel {
    /// The Mac keeps lpm commands: its `features` has "lpmCommands".
    var lpmCommandsAvailable: Bool {
        client?.hostFeatures.contains(LpmClient.lpmCommandsFeature) == true
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
