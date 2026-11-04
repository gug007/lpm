import SwiftUI

/// One folder of an lpm command list (nil for the commands in no folder), with
/// how many commands it holds.
struct CommandFolderRow: View {
    let folder: String?
    let count: Int

    var body: some View {
        HStack {
            Label(folder.map(LpmFolderPath.label) ?? "No folder", systemImage: folder == nil ? "tray" : "folder")
            Spacer()
            Text("\(count)")
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }
}
