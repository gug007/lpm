import SwiftUI
import WebKit

/// Find in a terminal's scrollback, as the desktop's search bar does: the page
/// marks every match and reports which one is current out of how many.
@Observable @MainActor
final class TerminalFind {
    enum Step: String { case type, next, prev }

    var isOpen = false
    var query = ""
    private(set) var index = -1
    private(set) var count = 0
    @ObservationIgnored weak var web: WKWebView?

    var summary: String? {
        guard !query.isEmpty else { return nil }
        return count > 0 ? "\(max(index, 0) + 1) of \(count)" : "No matches"
    }

    func open() { isOpen = true }

    /// Open with a query already in, searching for it at once.
    func open(query: String) {
        self.query = query
        isOpen = true
        search(.type)
    }

    func close() {
        isOpen = false
        query = ""
        index = -1
        count = 0
        web?.evaluateJavaScript("window.lpmFindClear()")
    }

    func search(_ step: Step) {
        let b64 = Data(query.utf8).base64EncodedString()
        web?.evaluateJavaScript("window.lpmFind('\(b64)', '\(step.rawValue)')")
    }

    /// What the page reported for the current query.
    func found(index: Int, count: Int) {
        self.index = index
        self.count = count
    }
}

/// The bar across the top of a terminal while Find is open.
struct TerminalFindBar: View {
    @Bindable var find: TerminalFind
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            TextField("Find in terminal", text: $find.query)
                .focused($focused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit { find.search(.next) }
                .onChange(of: find.query) { _, _ in find.search(.type) }
            if let summary = find.summary {
                Text(summary)
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .fixedSize()
            }
            step("chevron.up", label: "Previous match") { find.search(.prev) }
            step("chevron.down", label: "Next match") { find.search(.next) }
            Button("Done") { find.close() }
                .font(.subheadline.weight(.semibold))
        }
        .padding(.leading, 12)
        .padding(.trailing, 10)
        .padding(.vertical, 6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .onAppear { focused = true }
    }

    private func step(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.footnote.weight(.semibold))
                .frame(width: 30, height: 30)
                .background(.white.opacity(0.1), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(find.count == 0)
        .accessibilityLabel(label)
    }
}
