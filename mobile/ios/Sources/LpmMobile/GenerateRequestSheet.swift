import SwiftUI

/// An agent's `lpm generate` waiting for a yes, as the Mac's card shows it: what
/// it makes, from which prompt (editable before anything is spent), for how much
/// and where it goes. A missing key is typed in here and saved on the Mac.
struct GenerateRequestSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let request: GenerateRequest

    @State private var prompt: String
    @State private var editing = false
    @State private var key = ""
    @FocusState private var keyFocused: Bool

    init(request: GenerateRequest) {
        self.request = request
        _prompt = State(initialValue: request.prompt)
    }

    private var store: GenerateStore { model.generate }
    private var busy: Bool { store.answering == request.id }
    private var macName: String { model.link.macLabel }

    private var subtitle: String {
        if request.needsKey != nil {
            let agent = request.agent.isEmpty ? "the agent" : request.agent
            return "\(request.who) is waiting. The key stays on \(macName), and \(agent) only gets the file back."
        }
        let place = request.project.isEmpty ? macName : "\(request.project) on \(macName)"
        return store.waiting > 0 ? "\(place) · \(store.waiting) more waiting" : place
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if request.needsKey != nil { keyField }
                promptBox
                VStack(alignment: .leading, spacing: 6) {
                    Text(request.facts)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(request.out)
                        .font(.footnote.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .truncationMode(.middle)
                    Text(request.overLimit ? "This goes past today's limit. \(request.today)" : request.today)
                        .font(.footnote)
                        .foregroundStyle(request.overLimit ? Color.orange : Color.secondary)
                }
                if let error = store.error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                buttons
            }
            .padding(20)
        }
        .onAppear { if request.needsKey != nil { keyFocused = true } }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: request.needsKey != nil ? "key" : request.isSpeech ? "waveform" : "photo")
                .font(.title3)
                .frame(width: 40, height: 40)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(request.title).font(.headline)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private var keyField: some View {
        VStack(alignment: .leading, spacing: 8) {
            SecureField("Paste key", text: $key)
                .textContentType(.password)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .focused($keyFocused)
                .padding(12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("\(request.keyLabel) API key")
            if let provider = request.needsKey, let url = GenerateRequest.getKeyURL[provider] {
                Button("Get a key") { openURL(url) }.font(.footnote)
            }
        }
    }

    private var promptBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            if editing {
                TextField(request.isSpeech ? "Text to speak" : "Prompt", text: $prompt, axis: .vertical)
                    .lineLimit(3...8)
            } else {
                Text(prompt).frame(maxWidth: .infinity, alignment: .leading)
            }
            Button(editing ? "Done" : "Edit") { editing.toggle() }
                .font(.footnote)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var buttons: some View {
        VStack(spacing: 8) {
            Button {
                send(request.primaryDecision)
            } label: {
                Text(request.primaryLabel).frame(maxWidth: .infinity, minHeight: 34)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || (request.needsKey != nil && key.trimmingCharacters(in: .whitespaces).isEmpty))
            if request.allowsProject {
                Button {
                    send("once")
                } label: {
                    Text("Just this once").frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.bordered)
                .disabled(busy)
            }
            Button(role: .destructive) {
                send("deny")
            } label: {
                Text(request.needsKey != nil ? "Cancel" : "Deny").frame(maxWidth: .infinity, minHeight: 34)
            }
            .disabled(busy)
        }
    }

    private func send(_ decision: String) {
        store.answer(request, decision: decision, prompt: prompt, key: key)
    }
}

/// Shows the live Mac's oldest waiting `lpm generate` request over whatever is
/// open, another sheet included. Swiping it away leaves it waiting on the Mac.
struct GenerateSheets: ViewModifier {
    @Environment(AppModel.self) private var model
    @State private var presenter = TopSheetPresenter()

    func body(content: Content) -> some View {
        content
            .onChange(of: model.generate.shown?.id, initial: true) { _, _ in show() }
            .onDisappear { presenter.dismiss() }
    }

    private func show() {
        guard let request = model.generate.shown else { return presenter.dismiss() }
        presenter.present(GenerateRequestSheet(request: request).environment(model)) { [model] in
            model.generate.setAside(request)
        }
    }
}
