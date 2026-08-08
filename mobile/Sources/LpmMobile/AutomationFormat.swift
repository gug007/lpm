import SwiftUI

// MARK: - Threads

/// A run plus the follow-up replies that grew out of it: one row in the run
/// history, one page in the conversation view.
struct AutomationThread: Identifiable {
    let root: AutomationHistoryEntry
    var replies: [AutomationHistoryEntry]

    var id: Int { root.at }
    var entries: [AutomationHistoryEntry] { [root] + replies }
    var tail: AutomationHistoryEntry { replies.last ?? root }
}

func automationThreads(_ entries: [AutomationHistoryEntry]) -> [AutomationThread] {
    var threads: [AutomationThread] = []
    var bySession: [String: Int] = [:]
    var byAt: [Int: Int] = [:]

    for entry in entries {
        let resumedIndex = entry.resumed.isEmpty ? nil : bySession[entry.resumed]
        let followsIndex = entry.follows.flatMap { byAt[$0] }
        let index: Int
        if let parent = resumedIndex ?? followsIndex {
            threads[parent].replies.append(entry)
            index = parent
        } else {
            threads.append(AutomationThread(root: entry, replies: []))
            index = threads.count - 1
        }
        if !entry.session.isEmpty { bySession[entry.session] = index }
        byAt[entry.at] = index
    }
    return threads
}

/// The job a page opened for `project` is about. A shared job is one row over
/// several projects, so it answers to any of them — a page reached from a
/// notification or the Activity feed carries the project that ran, which need
/// not be the one the list addresses it by.
func automationMatching(_ jobs: [AutomationJob],
                        _ project: String, _ jobId: String) -> AutomationJob? {
    jobs.first { $0.id == jobId && ($0.runTargets.contains(project) || $0.runProject == project) }
}

// MARK: - Scope

/// What a row says about its job's reach, when that isn't already its section:
/// no project, or the several it spans. A shared job that runs in one project
/// says nothing extra — the section it sits in already names that project.
func automationScopeTag(_ job: AutomationJob) -> String? {
    if job.standalone { return "NO PROJECT" }
    if job.runsIn.count > 1 { return "\(job.runsIn.count) PROJECTS" }
    return job.source == "repo" ? "IN REPO" : nil
}

/// Where a job runs, said in a few words for its row: the project's own name
/// when there's one, a count when there are several, and "All projects" when
/// that count is every project there is.
func automationScopeLabel(_ job: AutomationJob, projectCount: Int) -> String {
    let targets = job.runsIn
    if targets.isEmpty { return "No project" }
    if targets.count == 1 { return targets[0] }
    if targets.count >= projectCount { return "All projects" }
    return "\(targets.count) projects"
}

/// Newest activity first, with everything unread ahead of everything read — the
/// list is a feed of what the automations did, not a directory of what exists.
func automationsSortedForList(_ jobs: [AutomationJob]) -> [AutomationJob] {
    jobs.sorted { a, b in
        if (a.unread > 0) != (b.unread > 0) { return a.unread > 0 }
        if a.running != b.running { return a.running }
        let lastA = a.lastRunAt ?? 0
        let lastB = b.lastRunAt ?? 0
        if lastA != lastB { return lastA > lastB }
        return a.displayName.localizedCaseInsensitiveCompare(b.displayName) == .orderedAscending
    }
}

/// A run stays unread while any message in it is — a reply that landed since is
/// the part that hasn't been read.
func automationThreadUnread(_ thread: AutomationThread) -> Bool {
    thread.root.unread || thread.replies.contains { $0.unread }
}

/// Where a job runs, for its own page: the project, the count when it spans
/// several, or the home folder when it belongs to none.
func automationScopeText(_ job: AutomationJob) -> String {
    if job.standalone { return "No project" }
    if job.runsIn.count > 1 { return "\(job.runsIn.count) projects" }
    return job.runsIn.first ?? ""
}

/// Which agent answers the prompt, at what model and effort — "Claude · opus ·
/// high effort". An unpinned job says "Default", which is what the app picks.
func automationAgentText(_ job: AutomationJob) -> String {
    var parts = [automationAgentName(job.agent)]
    if !job.model.isEmpty { parts.append(job.model) }
    if !job.effort.isEmpty { parts.append("\(job.effort) effort") }
    return parts.joined(separator: " · ")
}

private func automationAgentName(_ agent: String) -> String {
    switch agent {
    case "": return "Default"
    case "claude": return "Claude"
    case "codex": return "Codex"
    case "gemini": return "Gemini"
    case "opencode": return "OpenCode"
    default: return agent.prefix(1).uppercased() + agent.dropFirst()
    }
}

// MARK: - Schedule prose

/// "6 hours" / "30 minutes" / "2 days" — a gap sized to the unit it reads best in.
private func intervalParts(_ secs: Int) -> (value: Int, unit: String) {
    if secs > 0, secs % 86400 == 0 { return (secs / 86400, "day") }
    if secs > 0, secs < 3600 { return (max(1, secs / 60), "minute") }
    return (max(1, secs / 3600), "hour")
}

private func pluralized(_ value: Int, _ unit: String) -> String {
    value == 1 ? unit : "\(unit)s"
}

func automationScheduleText(_ job: AutomationJob) -> String {
    if job.scheduleMode == "interval" {
        let lo = intervalParts(job.everySecs)
        guard job.everyMaxSecs > job.everySecs else {
            return lo.value == 1 ? "Every \(lo.unit)" : "Every \(lo.value) \(pluralized(lo.value, lo.unit))"
        }
        let hi = intervalParts(job.everyMaxSecs)
        if lo.unit == hi.unit {
            return "Every \(lo.value)–\(hi.value) \(pluralized(hi.value, hi.unit))"
        }
        return "Every \(lo.value) \(pluralized(lo.value, lo.unit)) to \(hi.value) \(pluralized(hi.value, hi.unit))"
    }
    let days = automationDayPhrase(job)
    let time = automationTimePhrase(job)
    guard job.times > 1 else { return days.prefix(1).uppercased() + days.dropFirst() + " " + time }
    return "\(job.times) times \(days == "every day" ? "a day" : "on \(days)") \(time)"
}

/// Which days the job runs on: "every day", "Mon, Thu", "2 random weekdays".
private func automationDayPhrase(_ job: AutomationJob) -> String {
    guard job.pickDays > 0 else {
        if job.days.isEmpty { return "every day" }
        return job.days.map { $0.prefix(1).uppercased() + String($0.dropFirst()) }
            .joined(separator: ", ")
    }
    let set = Set(job.days)
    let s = job.pickDays == 1 ? "" : "s"
    let noun: String
    if set == ["mon", "tue", "wed", "thu", "fri"] {
        noun = "weekday\(s)"
    } else if set == ["sat", "sun"] {
        noun = "weekend day\(s)"
    } else {
        noun = "day\(s)"
    }
    return "\(job.pickDays) random \(noun) a week"
}

/// When in the day: "at 09:00", or the window a random time is drawn from.
private func automationTimePhrase(_ job: AutomationJob) -> String {
    let clock = { (minutes: Int) in String(format: "%02d:%02d", minutes / 60, minutes % 60) }
    guard let until = job.untilMinutes else { return "at \(clock(job.atMinutes))" }
    return "between \(clock(job.atMinutes)) and \(clock(until))"
}

// MARK: - Status

func automationStatusText(_ job: AutomationJob) -> String {
    if !job.valid { return job.error.isEmpty ? "Invalid automation" : job.error }
    if job.running { return "Running" }
    if !job.enabled { return "Paused · \(automationScheduleText(job))" }
    if let next = job.nextFireAt { return "\(automationScheduleText(job)) · \(automationDateText(next))" }
    return automationScheduleText(job)
}

func automationStatusColor(_ job: AutomationJob) -> Color {
    if !job.valid { return .red }
    if job.running { return .blue }
    if !job.enabled { return .secondary }
    return automationResultColor(job.lastResult)
}

func automationResultColor(_ result: String) -> Color {
    switch result {
    case "completed", "found-work": return .green
    case "error", "timed-out", "context-full": return .red
    case "skipped-overlap", "skipped-pending-copy", "skipped-capacity", "pending-window": return .orange
    default: return .secondary
    }
}

func automationResultLabel(_ result: String) -> String {
    switch result {
    case "nothing-to-do": return "Nothing to do"
    case "found-work": return "Found work"
    case "completed": return "Done"
    case "error": return "Problem during the run"
    case "canceled": return "Stopped"
    case "timed-out": return "Stopped — ran too long"
    case "context-full": return "Conversation full"
    case "skipped-overlap": return "Skipped — still running"
    case "skipped-pending-copy": return "Waiting for the previous copy"
    case "skipped-capacity": return "Waiting — other automations were running"
    case "pending-window": return "Waiting for the app window"
    default: return result.isEmpty ? "No runs yet" : result
    }
}

/// What a finished run is called once its own check has had a say. "Done" alone
/// says the agent exited, not that it did what it was asked.
func automationEntryLabel(_ entry: AutomationHistoryEntry) -> String {
    let base = automationResultLabel(entry.result)
    guard entry.result == "completed", let verified = entry.verified else { return base }
    return verified ? "\(base) — checks passed" : "\(base) — checks failed"
}

/// The opening line of a run's answer or a job's prompt, for the rows that stand
/// in for them. Markdown bullets and headings lose their markers — the marker is
/// layout, not words.
func automationFirstLine(_ text: String) -> String? {
    for raw in text.split(separator: "\n", omittingEmptySubsequences: true) {
        var line = raw.trimmingCharacters(in: .whitespaces)
        while let first = line.first, "#>-*•".contains(first) {
            line = String(line.dropFirst()).trimmingCharacters(in: .whitespaces)
        }
        line = line.replacingOccurrences(of: "**", with: "")
        if line.count > 1 { return String(line.prefix(140)) }
    }
    return nil
}

// MARK: - Dates

func automationDateText(_ seconds: Int) -> String {
    Date(timeIntervalSince1970: TimeInterval(seconds)).formatted(.relative(presentation: .named))
}

/// "Today at 10:00" / "Mon at 10:00" / "Jul 24 at 10:00" — the clock time, on the
/// day named the way you'd say it out loud. Beyond a week the weekday stops
/// being an anchor, so it gives the date instead.
func automationClockText(_ seconds: Int) -> String {
    let date = Date(timeIntervalSince1970: TimeInterval(seconds))
    let time = date.formatted(date: .omitted, time: .shortened)
    let cal = Calendar.current
    let day: String
    if cal.isDateInToday(date) { day = "Today" }
    else if cal.isDateInTomorrow(date) { day = "Tomorrow" }
    else if cal.isDateInYesterday(date) { day = "Yesterday" }
    else {
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: Date()),
                                      to: cal.startOfDay(for: date)).day ?? 0
        day = abs(days) < 7
            ? date.formatted(.dateTime.weekday(.abbreviated))
            : date.formatted(.dateTime.month(.abbreviated).day())
    }
    return "\(day) at \(time)"
}

func automationDurationText(_ seconds: Int) -> String {
    Duration.seconds(seconds)
        .formatted(.units(allowed: [.hours, .minutes, .seconds], width: .condensedAbbreviated))
}

/// "45s" / "4m 12s" / "1h 03m" — a clock that ticks in place, short enough to
/// sit in a status pill without resizing it every second.
func automationElapsedText(since seconds: Int, now: Date) -> String {
    let elapsed = max(0, Int(now.timeIntervalSince1970) - seconds)
    if elapsed < 60 { return "\(elapsed)s" }
    if elapsed < 3600 { return String(format: "%dm %02ds", elapsed / 60, elapsed % 60) }
    return String(format: "%dh %02dm", elapsed / 3600, (elapsed % 3600) / 60)
}
