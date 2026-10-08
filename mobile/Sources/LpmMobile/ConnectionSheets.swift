import SwiftUI

/// The sheets the connection UI opens from anywhere in the app: details behind
/// the status line, the identity check, the machine list, Built-in Tailscale and
/// its sign-in page, and the check after pairing. An action that swaps one sheet
/// for another runs once the first has gone.
struct ConnectionSheets: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        @Bindable var link = model.link
        return content
            .sheet(isPresented: $link.sheetOpen, onDismiss: link.runAfterSheet) {
                ConnectionSheet().environment(model)
            }
            .sheet(isPresented: $link.identityCheckOpen, onDismiss: link.runAfterSheet) {
                IdentityCheckSheet().environment(model)
            }
            .sheet(isPresented: $link.manageOpen, onDismiss: link.runAfterSheet) {
                ManageMacsView().environment(model)
            }
            .sheet(isPresented: $link.tailscaleSettingsOpen) {
                NavigationStack {
                    TailnetSettingsView()
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { link.tailscaleSettingsOpen = false }.fontWeight(.semibold)
                            }
                        }
                }
            }
            .sheet(item: $link.tailscalePage) { page in
                SafariView(url: page.url).ignoresSafeArea()
            }
            .sheet(item: $link.summary) { summary in
                PairedSummarySheet(summary: summary).environment(model)
            }
            .onChange(of: BuiltInTailscale.shared.status.state) { _, state in
                if state == "running" { link.tailscalePage = nil }
            }
    }
}
