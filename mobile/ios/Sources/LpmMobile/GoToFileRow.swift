import SwiftUI

/// One Go to File result: the name over the folder it's in.
struct GoToFileRow: View {
    let path: String
    var isFolder = false
    /// Said at the row's end, such as where a folder is.
    var note: String? = nil

    private var folder: String { (path as NSString).deletingLastPathComponent }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: isFolder ? "folder.fill" : "doc")
                .font(.system(size: 17))
                .foregroundStyle(isFolder ? Color.blue : Color.secondary)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text((path as NSString).lastPathComponent)
                    .foregroundStyle(Color.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if !folder.isEmpty {
                    Text(folder)
                        .font(.caption)
                        .foregroundStyle(Color.secondary)
                        .lineLimit(1)
                        .truncationMode(.head)
                }
            }
            Spacer(minLength: 0)
            if let note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(Color.secondary)
                    .fixedSize()
            }
        }
        .frame(minHeight: 40)
    }
}
