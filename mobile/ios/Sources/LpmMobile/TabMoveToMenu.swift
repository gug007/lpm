import SwiftUI

/// "Move To" in a tab's menu, as on the desktop: the Mac's other projects. The
/// tab keeps running in the folder it started in.
struct TabMoveToMenu: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo

    var body: some View {
        let destinations = model.canMoveTabs ? model.moveDestinations(term) : []
        if !destinations.isEmpty {
            Menu {
                Section("It keeps running in this project's folder") {
                    ForEach(destinations) { p in
                        Button(p.label) {
                            Haptics.tap()
                            model.moveTerminal(term, to: p)
                        }
                    }
                }
            } label: {
                Label("Move To", systemImage: "folder")
            }
        }
    }
}
