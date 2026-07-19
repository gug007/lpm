import SwiftUI

/// A folder browser for picking a directory on the paired Mac. Pushed from the
/// add-project forms, it walks the Mac's filesystem one level at a time via
/// `loadDirs`, starting at the home folder, and hands the chosen path back
/// through `onPick`.
struct DirBrowserView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    // What the chosen folder is for, shown as the screen title (e.g. "Project folder").
    let title: String
    let onPick: (String) -> Void

    var body: some View {
        List {
            if let listing = model.dirListing {
                if let parent = listing.parent {
                    Button {
                        model.loadDirs(parent)
                    } label: {
                        Label("Up", systemImage: "arrow.up")
                    }
                }
                if listing.dirs.isEmpty {
                    Text("No folders here.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(listing.dirs, id: \.self) { dir in
                        Button {
                            model.loadDirs(childPath(of: listing.path, dir))
                        } label: {
                            folderRow(dir)
                        }
                    }
                }
            } else if model.dirListingLoading {
                HStack {
                    ProgressView()
                    Text("Loading…").foregroundStyle(.secondary)
                }
            }
        }
        .overlay {
            if let error = model.dirListingError {
                ContentUnavailableView {
                    Label("Can't open that folder", systemImage: "folder.badge.questionmark")
                } description: {
                    Text(error)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .top) { pathHeader }
        .safeAreaInset(edge: .bottom) { useThisFolderBar }
        .onAppear { model.loadDirs("~") }
    }

    private func folderRow(_ name: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "folder")
                .foregroundStyle(.tint)
            Text(name)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
    }

    private var pathHeader: some View {
        HStack(spacing: 8) {
            Image(systemName: "folder.fill")
                .foregroundStyle(.secondary)
            Text(model.dirListing?.path ?? "…")
                .font(.footnote)
                .lineLimit(1)
                .truncationMode(.head)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var useThisFolderBar: some View {
        VStack(spacing: 0) {
            Divider()
            Button {
                guard let path = model.dirListing?.path else { return }
                Haptics.tap()
                onPick(path)
                dismiss()
            } label: {
                Text("Use This Folder")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.roundedRectangle(radius: 14))
            .disabled(model.dirListing == nil)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(.bar)
    }

    private func childPath(of base: String, _ name: String) -> String {
        base.hasSuffix("/") ? base + name : base + "/" + name
    }
}
