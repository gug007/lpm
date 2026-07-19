import SwiftUI

/// Whether the editor is creating a new job or editing an existing one. Create
/// always targets the global layer (like the desktop's "New job"); edit carries
/// the job so the sheet knows its layer, project, and id.
enum AutomationEditorContext: Identifiable {
    case create
    case edit(AutomationJob)

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let job): return "edit:\(job.key)"
        }
    }

    var isEditing: Bool { if case .edit = self { return true } else { return false } }
}

private let WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
private let DAY_LETTER = ["mon": "M", "tue": "T", "wed": "W", "thu": "T",
                          "fri": "F", "sat": "S", "sun": "S"]

/// The editor's in-flight form state — the mobile analogue of the desktop's
/// JobDraft. `duplicate` has no UI (the desktop modal has none either) but is
/// carried through so editing a duplicate-creating job preserves it.
private struct JobEditorDraft {
    var label = ""
    var emoji = ""
    var scheduleMode = "time"       // time | interval | manual
    var time = "09:00"
    var days: [String] = []
    var intervalValue = 6
    var intervalUnit = "hours"      // hours | days
    var check = ""
    var duplicate = false
    var runMode = "prompt"          // prompt | cmd | action
    var action = ""
    var cmd = ""
    var prompt = ""
    var agent = ""                  // "" = the app's default agent
    var model = ""
    var effort = ""
    var access = "full"             // full | read
    var targets: [String] = []      // "runs in"; empty = standalone
}

/// The mobile equivalent of the desktop JobEditorModal: create or edit a
/// scheduled automation. Presented as a sheet; on save it hands the built YAML
/// body to the Mac (see AppModel.saveJob), which writes it to the same layer
/// file a desktop edit would.
struct AutomationEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let context: AutomationEditorContext

    @State private var draft = JobEditorDraft()
    @State private var seeded = false
    @State private var didRequest = false
    @State private var scopeHasProjectsKey = false
    @State private var confirmDelete = false
    @State private var deleteCopies = false
    @State private var pendingToken: Int?

    private var editingJob: AutomationJob? {
        if case .edit(let job) = context { return job } else { return nil }
    }

    private var source: String { editingJob?.source ?? "global" }

    // The concrete project a scoped feature (actions) runs against: the job's
    // project when editing a non-global job, or the single selected target on a
    // new job. Mirrors JobEditorModal.runProject.
    private var runProject: String? {
        if let job = editingJob { return source == "global" ? nil : job.project }
        return draft.targets.count == 1 ? draft.targets.first : nil
    }

    private var localProjects: [Project] { model.projects.filter { !$0.isRemote } }

    private var availableActions: [Action] {
        guard let name = runProject,
              let project = model.projects.first(where: { $0.name == name }) else { return [] }
        return project.actions.flatMap { $0.runnableLeaves }
    }

    private var actionsAvailable: Bool { !availableActions.isEmpty }

    // Scope is editable when creating, or when editing a global job that picks
    // specific projects / is standalone (its body carries a `projects` list). A
    // project/repo job is bound to its project; an every-project global job can't
    // be expressed by the multi-select, so both show read-only.
    private var scopeEditable: Bool {
        if editingJob == nil { return true }
        return source == "global" && scopeHasProjectsKey
    }

    private var isStandalone: Bool { editingJob == nil && draft.targets.isEmpty }

    private var loading: Bool {
        context.isEditing && !seeded && model.jobConfigError == nil
    }

    private var validationError: String? {
        if draft.label.trimmed.isEmpty { return "Give this job a name." }
        if isStandalone && draft.runMode == "action" {
            return "Standalone jobs can't run an action."
        }
        if draft.scheduleMode == "time", parseTimeMinutes(draft.time) == nil {
            return "Pick a valid time."
        }
        if draft.scheduleMode == "interval", draft.intervalValue < 1 {
            return "The interval must be at least 1."
        }
        switch draft.runMode {
        case "action": if draft.action.trimmed.isEmpty { return "Choose an action to run." }
        case "cmd": if draft.cmd.trimmed.isEmpty { return "Enter a command to run." }
        default: if draft.prompt.trimmed.isEmpty { return "Enter a prompt to run." }
        }
        return nil
    }

    private var canSave: Bool {
        validationError == nil && !loading && !model.jobMutationInFlight
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading job…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    form
                }
            }
            .navigationTitle(context.isEditing ? "Edit job" : "New job")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.jobMutationInFlight {
                        ProgressView()
                    } else {
                        Button("Save") { submit() }
                            .fontWeight(.semibold)
                            .disabled(!canSave)
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.jobMutationInFlight)
        .onAppear(perform: seedIfReady)
        .onChange(of: model.jobConfigBody == nil) { _, _ in seedIfReady() }
        .onChange(of: model.jobMutationDoneToken) { _, token in
            if let pending = pendingToken, token > pending {
                Haptics.success()
                dismiss()
            }
        }
        .alert("Couldn't save automation", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.jobMutationError = nil }
        } message: {
            Text(model.jobMutationError ?? "")
        }
        .alert("Couldn't load automation", isPresented: configErrorPresented) {
            Button("OK", role: .cancel) { model.jobConfigError = nil; dismiss() }
        } message: {
            Text(model.jobConfigError ?? "")
        }
        .confirmationDialog("Delete this job?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(source == "global"
                 ? "Remove it from every project. This can't be undone."
                 : "Remove it from this project. This can't be undone.")
        }
    }

    private var form: some View {
        Form {
            nameSection
            scopeSection
            runSection
            frequencySection
            advancedSection
            if context.isEditing, source != "repo" { deleteSection }
        }
    }

    // MARK: sections

    private var nameSection: some View {
        Section {
            TextField("Name this job", text: $draft.label)
            TextField("Emoji (optional)", text: $draft.emoji)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: draft.emoji) { _, v in
                    // A single emoji only, like the desktop's slot.
                    if let first = v.first, v.count > 1 { draft.emoji = String(first) }
                }
        }
    }

    @ViewBuilder private var scopeSection: some View {
        Section {
            if scopeEditable {
                ForEach(localProjects) { project in
                    Button {
                        toggleTarget(project.name)
                    } label: {
                        HStack {
                            Text(project.label).foregroundStyle(.primary)
                            Spacer()
                            if draft.targets.contains(project.name) {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                }
            } else {
                LabeledContent("Runs in", value: scopeReadOnlyLabel)
            }
        } header: {
            Text("Runs in")
        } footer: {
            if scopeEditable {
                Text(draft.targets.isEmpty
                     ? "No project selected — runs on its own in your home folder."
                     : "Runs in the selected project\(draft.targets.count == 1 ? "" : "s").")
            }
        }
    }

    @ViewBuilder private var runSection: some View {
        Section {
            Picker("Does", selection: $draft.runMode) {
                Text("AI prompt").tag("prompt")
                Text("Command").tag("cmd")
                if actionsAvailable || draft.runMode == "action" { Text("Action").tag("action") }
            }

            switch draft.runMode {
            case "cmd":
                TextField("npm run refresh-fixtures", text: $draft.cmd, axis: .vertical)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.system(.body, design: .monospaced))
            case "action":
                if actionsAvailable {
                    Picker("Action", selection: $draft.action) {
                        ForEach(availableActions) { a in
                            Text(a.emoji.isEmpty ? a.label : "\(a.emoji) \(a.label)").tag(a.name)
                        }
                    }
                } else {
                    LabeledContent("Action", value: draft.action)
                }
            default:
                TextField("What should the agent do?", text: $draft.prompt, axis: .vertical)
                    .lineLimit(2...8)
                Picker("Agent", selection: $draft.agent) {
                    Text("Default").tag("")
                    Text("Claude").tag("claude")
                    Text("Codex").tag("codex")
                    Text("Gemini").tag("gemini")
                    Text("OpenCode").tag("opencode")
                }
                TextField("Model (optional)", text: $draft.model)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if effortAvailable {
                    Picker("Effort", selection: $draft.effort) {
                        Text("Default").tag("")
                        Text("Low").tag("low")
                        Text("Medium").tag("medium")
                        Text("High").tag("high")
                    }
                }
                Picker("Access", selection: $draft.access) {
                    Text("Full access").tag("full")
                    Text("Read only").tag("read")
                }
            }
        } header: {
            Text("Does")
        } footer: {
            if draft.runMode == "prompt" {
                Text("Full access lets the agent edit files and run commands unattended; read only looks around and reports.")
            }
        }
        .onChange(of: draft.runMode) { _, mode in
            if mode == "action", draft.action.isEmpty {
                draft.action = availableActions.first?.name ?? ""
            }
        }
        .onChange(of: draft.agent) { _, _ in
            if !effortAvailable { draft.effort = "" }
        }
    }

    // Only Claude and Codex expose reasoning effort (default agent is Claude).
    private var effortAvailable: Bool {
        draft.agent.isEmpty || draft.agent == "claude" || draft.agent == "codex"
    }

    @ViewBuilder private var frequencySection: some View {
        Section {
            Picker("Repeat", selection: repeatBinding) {
                Text("Every day").tag("daily")
                Text("On certain days").tag("days")
                Text("On an interval").tag("interval")
                Text("Manually").tag("manual")
            }

            if draft.scheduleMode == "time" {
                if !draft.days.isEmpty || repeatBinding.wrappedValue == "days" {
                    weekdayRow
                }
                DatePicker("At", selection: timeBinding, displayedComponents: .hourAndMinute)
            } else if draft.scheduleMode == "interval" {
                Stepper(value: $draft.intervalValue, in: 1...240) {
                    HStack {
                        Text("Every")
                        Spacer()
                        Text("\(draft.intervalValue)").foregroundStyle(.secondary).monospacedDigit()
                    }
                }
                Picker("Unit", selection: $draft.intervalUnit) {
                    Text("Hours").tag("hours")
                    Text("Days").tag("days")
                }
                .pickerStyle(.segmented)
            }
        } header: {
            Text("Frequency")
        } footer: {
            Text(scheduleSummary)
        }
    }

    private var weekdayRow: some View {
        HStack(spacing: 8) {
            ForEach(WEEKDAYS, id: \.self) { day in
                let on = draft.days.contains(day)
                Button {
                    if on { draft.days.removeAll { $0 == day } } else { draft.days.append(day) }
                } label: {
                    Text(DAY_LETTER[day] ?? "?")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 34, height: 34)
                        .background(on ? Color.accentColor : Color(.secondarySystemFill))
                        .foregroundStyle(on ? Color.white : Color.primary)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
    }

    @ViewBuilder private var advancedSection: some View {
        Section {
            TextField("git fetch && git log HEAD..@{u} --oneline | grep .",
                      text: $draft.check, axis: .vertical)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(.system(.callout, design: .monospaced))
        } header: {
            Text("Only when there's work (optional)")
        } footer: {
            Text("A command that decides whether the job has anything to do — it runs only when this succeeds. Leave blank to run every time.")
        }
    }

    private var deleteSection: some View {
        Section {
            if let job = editingJob, job.duplicate {
                Toggle("Also remove the copies its runs created", isOn: $deleteCopies)
            }
            Button(role: .destructive) {
                Haptics.warning()
                confirmDelete = true
            } label: {
                HStack {
                    Spacer()
                    Text("Delete job")
                    Spacer()
                }
            }
            .disabled(model.jobMutationInFlight)
        }
    }

    // MARK: bindings & derived

    private var repeatBinding: Binding<String> {
        Binding(
            get: {
                switch draft.scheduleMode {
                case "manual": return "manual"
                case "interval": return "interval"
                default: return draft.days.isEmpty ? "daily" : "days"
                }
            },
            set: { next in
                switch next {
                case "manual": draft.scheduleMode = "manual"
                case "interval": draft.scheduleMode = "interval"
                case "daily": draft.scheduleMode = "time"; draft.days = []
                default:
                    draft.scheduleMode = "time"
                    if draft.days.isEmpty { draft.days = ["mon"] }
                }
            }
        )
    }

    private var timeBinding: Binding<Date> {
        Binding(
            get: {
                let minutes = parseTimeMinutes(draft.time) ?? 540
                return Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60,
                                             second: 0, of: Date()) ?? Date()
            },
            set: { date in
                let c = Calendar.current.dateComponents([.hour, .minute], from: date)
                draft.time = String(format: "%02d:%02d", c.hour ?? 9, c.minute ?? 0)
            }
        )
    }

    private var scopeReadOnlyLabel: String {
        if source == "global" { return "Every project" }
        if let job = editingJob,
           let project = model.projects.first(where: { $0.name == job.project }) {
            return project.label
        }
        return editingJob?.project ?? ""
    }

    private var scheduleSummary: String {
        switch draft.scheduleMode {
        case "manual": return "Runs only when you start it."
        case "interval":
            let unit = draft.intervalUnit == "days" ? "day" : "hour"
            return "Every \(draft.intervalValue) \(unit)\(draft.intervalValue == 1 ? "" : "s")."
        default:
            let time = draft.time
            if draft.days.isEmpty || draft.days.count == 7 { return "Every day at \(time)." }
            let names = WEEKDAYS.filter { draft.days.contains($0) }
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined(separator: ", ")
            return "\(names) at \(time)."
        }
    }

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.jobMutationError != nil },
                set: { if !$0 { model.jobMutationError = nil } })
    }

    private var configErrorPresented: Binding<Bool> {
        Binding(get: { model.jobConfigError != nil },
                set: { if !$0 { model.jobConfigError = nil } })
    }

    private func toggleTarget(_ name: String) {
        if draft.targets.contains(name) { draft.targets.removeAll { $0 == name } }
        else { draft.targets.append(name) }
        if draft.targets.count != 1, draft.runMode == "action" { draft.runMode = "prompt" }
    }

    // MARK: lifecycle

    private func seedIfReady() {
        guard !seeded else { return }
        switch context {
        case .create:
            model.jobConfigBody = nil
            seeded = true
        case .edit(let job):
            // Always fetch a fresh body — a body left over from a previous edit
            // would belong to a different job. loadJobConfig clears it and requests;
            // the reply lands via onJobConfig and re-runs this to seed.
            if !didRequest {
                didRequest = true
                model.loadJobConfig(project: job.project, jobId: job.id, source: job.source)
                return
            }
            if let body = model.jobConfigBody {
                seed(from: body)
                seeded = true
            }
        }
    }

    private func seed(from body: [String: Any]) {
        var d = JobEditorDraft()
        if let s = body["label"] as? String { d.label = s }
        if let s = body["emoji"] as? String { d.emoji = s }
        d.duplicate = (body["duplicate"] as? Bool) == true

        if let schedule = body["schedule"] as? [String: Any] {
            if (schedule["manual"] as? Bool) == true {
                d.scheduleMode = "manual"
            } else if let every = schedule["every"] {
                d.scheduleMode = "interval"
                let (value, unit) = parseEvery(every)
                d.intervalValue = value
                d.intervalUnit = unit
            } else {
                d.scheduleMode = "time"
                if let at = (schedule["at"] as? String)?.trimmed, !at.isEmpty { d.time = at }
                if let days = schedule["days"] as? [Any] {
                    let set = Set(days.map { String(describing: $0).lowercased() })
                    d.days = WEEKDAYS.filter { set.contains($0) }
                }
            }
        }

        if let run = body["run"] as? [String: Any] {
            if let action = (run["action"] as? String)?.trimmed, !action.isEmpty {
                d.runMode = "action"
                d.action = action
            } else if let cmd = (run["cmd"] as? String)?.trimmed, !cmd.isEmpty {
                d.runMode = "cmd"
                d.cmd = cmd
            } else if let prompt = run["prompt"] as? String {
                d.runMode = "prompt"
                d.prompt = prompt
                d.agent = (run["agent"] as? String ?? "").lowercased()
                d.model = run["model"] as? String ?? ""
                d.effort = (run["effort"] as? String ?? "").lowercased()
                if (run["access"] as? String)?.lowercased() == "read" { d.access = "read" }
            }
        }

        if let check = body["check"] as? String { d.check = check }
        if let projects = body["projects"] as? [Any] {
            d.targets = projects.map { String(describing: $0) }
            scopeHasProjectsKey = true
        }
        draft = d
    }

    // MARK: build & submit

    private func buildJob() -> [String: Any] {
        var payload: [String: Any] = ["label": draft.label.trimmed]
        let emoji = draft.emoji.trimmed
        if !emoji.isEmpty { payload["emoji"] = emoji }
        payload["schedule"] = buildSchedule()
        let check = draft.check.trimmed
        if !check.isEmpty { payload["check"] = check }
        if draft.duplicate { payload["duplicate"] = true }
        payload["run"] = buildRun()
        // The "runs in" list lives only on global-layer jobs; a project/repo job
        // is bound to its file. An every-project global job (scope read-only)
        // keeps that meaning by omitting `projects`.
        if source == "global", scopeEditable { payload["projects"] = draft.targets }
        return payload
    }

    private func buildSchedule() -> [String: Any] {
        switch draft.scheduleMode {
        case "manual": return ["manual": true]
        case "interval":
            let suffix = draft.intervalUnit == "days" ? "d" : "h"
            return ["every": "\(draft.intervalValue)\(suffix)"]
        default:
            var block: [String: Any] = ["at": draft.time]
            let ordered = WEEKDAYS.filter { draft.days.contains($0) }
            if !ordered.isEmpty, ordered.count < 7 { block["days"] = ordered }
            return block
        }
    }

    private func buildRun() -> [String: Any] {
        switch draft.runMode {
        case "action": return ["action": draft.action.trimmed]
        case "cmd": return ["cmd": draft.cmd.trimmed]
        default:
            var block: [String: Any] = ["prompt": draft.prompt.trimmed]
            let agent = draft.agent.trimmed
            if !agent.isEmpty { block["agent"] = agent }
            let m = draft.model.trimmed
            if !m.isEmpty { block["model"] = m }
            let e = draft.effort.trimmed
            if !e.isEmpty { block["effort"] = e }
            if draft.access == "read" { block["access"] = "read" }
            return block
        }
    }

    private func submit() {
        guard canSave else { return }
        Haptics.tap()
        pendingToken = model.jobMutationDoneToken
        let job = buildJob()
        if let editing = editingJob {
            model.saveJob(id: editing.id, source: source, project: editing.project, job: job)
        } else {
            // New jobs live in the global layer and need a fresh id that doesn't
            // shadow any existing job's saved history (mirrors the desktop's
            // uniqueKey over slugify(label)).
            let id = uniqueJobId(from: draft.label, taken: Set(model.automations.map(\.id)))
            model.saveJob(id: id, source: "global", project: "", job: job)
        }
    }

    private func remove() {
        guard let job = editingJob else { return }
        pendingToken = model.jobMutationDoneToken
        model.deleteJob(id: job.id, source: source, project: job.project, deleteCopies: deleteCopies)
    }
}

/// A URL-safe slug for `label`, uniquified against `taken` — the id a new job's
/// `jobs.<id>` mapping is written under.
private func uniqueJobId(from label: String, taken: Set<String>) -> String {
    let slug = label.lowercased().map { c -> Character in
        c.isLetter || c.isNumber ? c : "-"
    }
    var base = String(slug).split(separator: "-").joined(separator: "-")
    if base.isEmpty { base = "job" }
    if !taken.contains(base) { return base }
    var n = 2
    while taken.contains("\(base)-\(n)") { n += 1 }
    return "\(base)-\(n)"
}

private func parseTimeMinutes(_ time: String) -> Int? {
    let parts = time.split(separator: ":")
    guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
          h >= 0, h <= 23, m >= 0, m <= 59 else { return nil }
    return h * 60 + m
}

// `every` is a string like "6h"/"2d" or a bare number read as hours.
private func parseEvery(_ every: Any) -> (Int, String) {
    if let n = every as? Int { return (max(1, n), "hours") }
    if let n = every as? Double { return (max(1, Int(n)), "hours") }
    let s = String(describing: every).trimmingCharacters(in: .whitespaces).lowercased()
    if let n = Int(s.dropLast()), s.hasSuffix("d") { return (max(1, n), "days") }
    if let n = Int(s.dropLast()), s.hasSuffix("h") { return (max(1, n), "hours") }
    if let n = Int(s) { return (max(1, n), "hours") }
    return (6, "hours")
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
