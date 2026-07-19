import SwiftUI

/// The navigation-bar title menu for choosing which saved Mac is live. Shows the
/// active Mac's name; tapping opens a menu of all saved Macs (checkmark on the
/// active one) plus "Add a Mac…". With a single saved Mac it still works as an
/// entry point for adding another.
struct MacSwitcherMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            ForEach(model.macs) { mac in
                Button {
                    model.switchTo(mac)
                } label: {
                    if mac.localId == model.activeMacId {
                        Label(mac.displayName, systemImage: "checkmark")
                    } else {
                        Text(mac.displayName)
                    }
                }
            }
            Divider()
            Button {
                model.beginAddMac()
            } label: {
                Label("Add a Mac…", systemImage: "plus")
            }
        } label: {
            HStack(spacing: 4) {
                Text(model.activeRecord?.displayName ?? "Mac")
                    .font(.headline)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}
