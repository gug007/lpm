import SwiftUI

/// "Send to lpm": what was shared, a note to go with it, the project, and whether
/// it starts a new agent tab or goes into the project's notes.
struct ShareView: View {
    @Bindable var model: ShareModel
    let onDone: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if model.directory.macs.isEmpty {
                    ContentUnavailableView {
                        Label("Connect lpm Link first", systemImage: "laptopcomputer.and.iphone")
                    } description: {
                        Text("Open lpm Link and connect it to your Mac, then share again.")
                    }
                } else {
                    form
                }
            }
            .navigationTitle("Send to lpm")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                if !model.directory.macs.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Send") { Task { await model.send() } }
                            .fontWeight(.semibold)
                            .disabled(!model.canSend)
                    }
                }
            }
        }
        .overlay { ShareProgressCard(model: model, onDone: onDone) }
        .alert("Couldn't send", isPresented: Binding(
            get: { if case .failed = model.phase { true } else { false } },
            set: { if !$0 { model.dismissFailure() } }
        )) {
            Button("OK", role: .cancel) { model.dismissFailure() }
        } message: {
            if case .failed(let message) = model.phase { Text(message) }
        }
        .task(id: model.phase) {
            guard model.phase == .sent else { return }
            try? await Task.sleep(nanoseconds: 900_000_000)
            onDone()
        }
    }

    private var form: some View {
        Form {
            Section {
                SharedItemsRow(items: model.items, loading: model.phase == .loading)
            }
            Section("Add a note") {
                TextField("What should happen with it?", text: $model.note, axis: .vertical)
                    .lineLimit(2...6)
            }
            Section("Project") {
                if model.directory.macs.count > 1 {
                    Picker("Computer", selection: Binding(get: { model.macId }, set: { model.selectMac($0) })) {
                        ForEach(model.directory.macs) { Text($0.name).tag($0.serverId) }
                    }
                }
                Picker("Project", selection: $model.project) {
                    ForEach(model.projects, id: \.name) { Text($0.title).tag($0.name) }
                }
            }
            Section("Send to") {
                if !model.agents.isEmpty {
                    DestinationRow(title: "New agent tab", detail: "It's the tab's first prompt",
                                   symbol: "plus.square", chosen: model.destination == .agent) {
                        model.destination = .agent
                    }
                    if model.destination == .agent, model.agents.count > 1 {
                        Picker("Agent", selection: $model.agent) {
                            ForEach(model.agents, id: \.id) { Text($0.label).tag($0.id) }
                        }
                    }
                }
                DestinationRow(title: "Notes", detail: "Kept in the project's notes",
                               symbol: "note.text", chosen: model.destination == .notes) {
                    model.destination = .notes
                }
            }
        }
        .disabled(model.phase == .sending)
    }
}

/// What came in: its picture or kind, its title and where it's from.
private struct SharedItemsRow: View {
    let items: SharedItems
    let loading: Bool

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let thumbnail = items.thumbnail {
                    Image(uiImage: thumbnail).resizable().scaledToFill()
                } else {
                    Image(systemName: items.links.isEmpty ? "text.alignleft" : "link")
                        .font(.system(size: 20))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 52, height: 52)
            .background(Color(.tertiarySystemFill))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                if loading {
                    ProgressView().controlSize(.small)
                } else {
                    Text(items.headline).font(.subheadline.weight(.semibold)).lineLimit(2)
                    if !items.detail.isEmpty {
                        Text(items.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private struct DestinationRow: View {
    let title: String
    let detail: String
    let symbol: String
    let chosen: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).foregroundStyle(.secondary).frame(width: 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).foregroundStyle(.primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if chosen {
                    Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(Color.accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }
}

/// Over the form while it sends, and once it's sent or kept for later.
private struct ShareProgressCard: View {
    let model: ShareModel
    let onDone: () -> Void

    var body: some View {
        switch model.phase {
        case .sending:
            card {
                ProgressView().controlSize(.large)
                Text("Sending to \(model.mac?.name ?? "your Mac")…").font(.headline)
            }
        case .sent:
            card {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(.green)
                Text("Sent to \(model.projectTitle)").font(.headline)
            }
        case .queued:
            card {
                Image(systemName: "clock.badge.checkmark").font(.system(size: 40)).foregroundStyle(.secondary)
                Text("Saved for later").font(.headline)
                Text("lpm Link sends it to \(model.mac?.name ?? "your Mac") the next time it reaches it.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button("Done", action: onDone).buttonStyle(.borderedProminent).padding(.top, 4)
            }
        default:
            EmptyView()
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 12, content: content)
                .padding(24)
                .frame(maxWidth: 300)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .transition(.opacity)
    }
}
