import CryptoKit
import SwiftUI

/// A small fix made right in the file preview: the file's text in a code field,
/// saved into the project on the Mac only while the file still holds what was
/// opened here, so a change an agent made meanwhile is never overwritten.
struct FileEditScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    /// The file's path in the project.
    let path: String
    /// The copy the preview opened.
    let url: URL
    let onSaved: () -> Void

    @State private var text = ""
    @State private var original = ""
    @State private var base = ""
    @State private var unreadable = false
    @State private var saving = false
    @State private var failure: FileWriteReply?

    static let maxBytes: Int64 = 200 * 1024

    private var edited: Bool { text != original }

    var body: some View {
        Group {
            if unreadable {
                ContentUnavailableView("Can't edit this file", systemImage: "doc.badge.ellipsis",
                                       description: Text("It isn't UTF-8 text."))
            } else {
                CodeEditorTextView(text: $text, ext: (path as NSString).pathExtension.lowercased())
                    .ignoresSafeArea(.container, edges: .bottom)
            }
        }
        .navigationTitle((path as NSString).lastPathComponent)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(edited)
        .toolbar {
            if edited {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView()
                } else {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(!edited || unreadable)
                }
            }
        }
        .onAppear(perform: load)
        .alert(failure?.changed == true ? "Changed on your Mac" : "Couldn't save",
               isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
            if failure?.changed == true {
                Button("Open Again") {
                    failure = nil
                    onSaved()
                    dismiss()
                }
                Button("Keep Editing", role: .cancel) { failure = nil }
            } else {
                Button("OK", role: .cancel) { failure = nil }
            }
        } message: {
            Text(failure?.error ?? "")
        }
    }

    private func load() {
        guard base.isEmpty, let data = try? Data(contentsOf: url) else { return }
        guard let string = String(data: data, encoding: .utf8) else {
            unreadable = true
            return
        }
        base = Self.sha256(data)
        original = string
        text = string
    }

    private func save() {
        saving = true
        Haptics.tap()
        Task {
            let reply = await model.gitExtras.save(project, path: path, content: text, base: base)
            saving = false
            if let sha = reply.sha256 {
                base = sha
                original = text
                Haptics.success()
                onSaved()
                dismiss()
            } else {
                Haptics.error()
                failure = reply
            }
        }
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
