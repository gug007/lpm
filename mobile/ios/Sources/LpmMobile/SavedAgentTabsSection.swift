import SwiftUI

/// A project's agent tabs while the Mac is away, as this phone last had them: they
/// open read-only.
struct SavedAgentTabsSection: View {
    @Environment(AppModel.self) private var model
    let tabs: [TerminalInfo]
    let onOpen: (TerminalInfo) -> Void

    var body: some View {
        Section {
            ForEach(tabs, id: \.tabKey) { tab in
                TabRow(term: tab, agent: nil, onOpen: { onOpen(tab) })
                    .compactRow()
            }
        } header: {
            SectionTitle(text: "Tabs")
        } footer: {
            if let seen = model.link.listAsOf {
                Text("Last seen \(seen.clockStamp). Tabs open read-only until \(model.link.macLabel) is back.")
            } else {
                Text("Tabs open read-only until \(model.link.macLabel) is back.")
            }
        }
    }
}
