import Foundation

/// Demo handlers for automations: the jobs list, run history, live output, running
/// and toggling, and the authoring editor (config read + save/delete + followup).
extension DemoServer {
    func registerJobsHandlers() {
        register("jobs") { [weak self] _ in
            guard let self else { return }
            self.refreshNextFires()
            self.push(self.world.jobsPayload())
        }
        register("jobHistory") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            let entries = (self.job(project, jobId)?.history ?? []).map(self.world.jobRunDict)
            self.push(["t": "jobHistory", "project": project, "jobId": jobId, "ok": true, "entries": entries])
        }
        register("jobLiveOutput") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            var reply: [String: Any] = ["t": "jobLiveOutput", "project": project, "jobId": jobId, "ok": true]
            if let j = self.job(project, jobId), let startedAt = j.liveStartedAt {
                reply["live"] = ["startedAt": startedAt, "text": j.liveText]
            } else {
                reply["live"] = NSNull()
            }
            self.push(reply)
        }
        register("runJob") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            guard let i = self.jobIndex(project, jobId) else {
                self.push(["t": "runJob", "project": project, "jobId": jobId, "ok": false,
                           "error": "No such automation."])
                return
            }
            self.push(["t": "runJob", "project": project, "jobId": jobId, "ok": true])
            if !self.world.jobs[i].running {
                self.startRun(project, jobId)
                self.push(["t": "jobs-changed"])
            }
        }
        register("stopJob") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            if let i = self.jobIndex(project, jobId), self.world.jobs[i].running {
                var j = self.world.jobs[i]
                j.runSeq += 1
                let done = Int(Date().timeIntervalSince1970)
                let started = j.liveStartedAt ?? done
                let run = DemoWorld.JobRun(at: done, result: "canceled", output: j.liveText,
                                           durationSecs: max(1, done - started))
                j.running = false
                j.runningSince = nil
                j.liveStartedAt = nil
                j.liveText = ""
                j.lastRunAt = done
                j.lastResult = "canceled"
                j.history.append(run)
                self.world.jobs[i] = j
            }
            self.push(["t": "stopJob", "project": project, "jobId": jobId, "ok": true])
            self.push(["t": "jobs-changed"])
        }
        register("setJobEnabled") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            if let i = self.jobIndex(project, jobId) {
                let enabled = o["enabled"] as? Bool ?? false
                self.world.jobs[i].enabled = enabled
                self.world.jobs[i].nextFireAt = enabled ? self.nextFire(self.world.jobs[i]) : nil
            }
            self.push(["t": "setJobEnabled", "project": project, "jobId": jobId, "ok": true])
            self.push(["t": "jobs-changed"])
        }
        register("jobConfig") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            guard let j = self.job(project, jobId) else {
                self.push(["t": "jobConfig", "project": project, "jobId": jobId, "ok": false,
                           "error": "Couldn't load the automation."])
                return
            }
            let body = j.body.isEmpty ? self.derivedBody(j) : j.body
            self.push(["t": "jobConfig", "project": project, "jobId": jobId, "ok": true, "job": body])
        }
        register("saveJob") { [weak self] o in
            guard let self else { return }
            let id = o["id"] as? String ?? ""
            guard !id.isEmpty else {
                self.push(["t": "saveJob", "ok": false, "id": id, "error": "The job needs an id."])
                return
            }
            let source = o["source"] as? String ?? "global"
            let project = o["project"] as? String ?? ""
            let body = o["job"] as? [String: Any] ?? [:]
            if let i = self.world.jobs.firstIndex(where: {
                $0.id == id && $0.source == source && (source == "global" || $0.project == project)
            }) {
                self.applyBody(body, to: &self.world.jobs[i])
            } else {
                var j = DemoWorld.Job(id: id, project: source == "global" ? "" : project, label: "")
                j.source = source
                self.applyBody(body, to: &j)
                j.nextFireAt = self.nextFire(j)
                self.world.jobs.append(j)
            }
            self.push(["t": "saveJob", "ok": true, "id": id])
            self.push(["t": "jobs-changed"])
        }
        register("deleteJob") { [weak self] o in
            guard let self else { return }
            let id = o["id"] as? String ?? ""
            let source = o["source"] as? String ?? "global"
            let project = o["project"] as? String ?? ""
            self.world.jobs.removeAll {
                $0.id == id && $0.source == source && (source == "global" || $0.project == project)
            }
            self.push(["t": "deleteJob", "ok": true, "id": id])
            self.push(["t": "jobs-changed"])
        }
        register("sendJobFollowup") { [weak self] o in
            guard let self, let project = o["project"] as? String, let jobId = o["jobId"] as? String else { return }
            guard let i = self.jobIndex(project, jobId), !self.world.jobs[i].running else {
                self.push(["t": "sendJobFollowup", "project": project, "jobId": jobId, "ok": false,
                           "error": "The automation is already running."])
                return
            }
            let at = o["at"] as? Int ?? 0
            let message = o["message"] as? String ?? ""
            let parent = self.world.jobs[i].history.first { $0.at == at } ?? self.world.jobs[i].history.last
            self.push(["t": "sendJobFollowup", "project": project, "jobId": jobId, "ok": true])
            self.startRun(project, jobId, question: message,
                          follows: parent?.at ?? at, resumed: parent?.session ?? "")
            self.push(["t": "jobs-changed"])
        }
    }

    // MARK: run simulation

    private struct RunScript {
        var steps: [(Double, String)]
        var duration: Double
        var result: String
        var output: String
        var session: String
        var costUsd: Double?
    }

    private func startRun(_ project: String, _ jobId: String, question: String? = nil,
                          follows: Int? = nil, resumed: String = "") {
        guard let i = jobIndex(project, jobId) else { return }
        let startedAt = Int(Date().timeIntervalSince1970)
        world.jobs[i].running = true
        world.jobs[i].runningSince = startedAt
        world.jobs[i].liveStartedAt = startedAt
        world.jobs[i].liveText = ""
        world.jobs[i].runSeq += 1
        let seq = world.jobs[i].runSeq
        let script = runScript(for: world.jobs[i], question: question)

        for (delay, chunk) in script.steps {
            pushAfter(delay) { [weak self] in
                guard let self, let i = self.jobIndex(project, jobId),
                      self.world.jobs[i].runSeq == seq, self.world.jobs[i].running else { return nil }
                self.world.jobs[i].liveText += chunk
                return nil
            }
        }
        pushAfter(script.duration) { [weak self] in
            guard let self, let i = self.jobIndex(project, jobId),
                  self.world.jobs[i].runSeq == seq, self.world.jobs[i].running else { return nil }
            let done = Int(Date().timeIntervalSince1970)
            var j = self.world.jobs[i]
            j.running = false
            j.runningSince = nil
            j.liveStartedAt = nil
            j.liveText = ""
            j.lastRunAt = done
            j.lastResult = script.result
            j.nextFireAt = j.enabled ? self.nextFire(j) : nil
            var run = DemoWorld.JobRun(at: done, result: script.result, output: script.output,
                                       durationSecs: max(1, done - startedAt))
            run.costUsd = script.costUsd
            run.session = script.session
            run.question = question ?? ""
            run.resumed = resumed
            run.follows = question == nil ? nil : follows
            j.history.append(run)
            self.world.jobs[i] = j
            return ["t": "jobs-changed"]
        }
    }

    private func runScript(for j: DemoWorld.Job, question: String?) -> RunScript {
        if question != nil { return followupScript(for: j) }
        switch j.id {
        case "nightly-tests": return nightlyTestsScript()
        case "weekly-deps": return weeklyDepsScript()
        default: return j.runKind == "prompt" ? genericPromptScript(for: j) : genericCmdScript(for: j)
        }
    }

    private func nightlyTestsScript() -> RunScript {
        let summary = "\n Test Files  3 passed (3)\n      Tests  25 passed (25)\n   Duration  6.8s\n"
        return RunScript(
            steps: [
                (0.4, "\n> storefront@0.4.2 test\n> vitest run\n\n"),
                (1.6, " RUN  v3.1.4 /Users/demo/dev/storefront\n\n"),
                (3.0, " ✓ lib/payments.test.ts (12 tests) 262ms\n"),
                (4.4, " ✓ components/CheckoutForm.test.tsx (8 tests) 418ms\n"),
                (5.8, " ✓ app/checkout/page.test.tsx (5 tests) 630ms\n"),
                (7.2, summary),
            ],
            duration: 8.2,
            result: "completed",
            output: " ✓ lib/payments.test.ts (12 tests) 262ms\n ✓ components/CheckoutForm.test.tsx (8 tests) 418ms\n ✓ app/checkout/page.test.tsx (5 tests) 630ms\n" + summary,
            session: "",
            costUsd: nil)
    }

    private func weeklyDepsScript() -> RunScript {
        RunScript(
            steps: [
                (0.5, "Reading package.json…\n"),
                (2.0, "Checking the npm registry for newer versions…\n"),
                (3.5, "astro 4.8.3 → 4.9.1 (minor)\n"),
                (4.8, "@astrojs/mdx 3.0.0 → 3.0.1 (patch)\n"),
                (6.0, "sharp 0.33.3 → 0.33.4 (patch)\n"),
                (7.2, "Reviewing release notes for breaking changes…\n"),
            ],
            duration: 8.4,
            result: "completed",
            output: """
            Checked 24 dependencies in package.json. Three are outdated:

            • astro 4.8.3 → 4.9.1 (minor)
            • @astrojs/mdx 3.0.0 → 3.0.1 (patch)
            • sharp 0.33.3 → 0.33.4 (patch)

            All three look safe — no breaking changes in the release notes. Run npm update when ready.
            """,
            session: newSession(),
            costUsd: 0.14)
    }

    private func genericPromptScript(for j: DemoWorld.Job) -> RunScript {
        let prompt = (j.body["run"] as? [String: Any])?["prompt"] as? String ?? ""
        return RunScript(
            steps: [
                (0.6, "Starting agent…\n"),
                (2.2, "Reading the project…\n"),
                (4.0, "Working through the task…\n"),
                (6.2, "Wrapping up…\n"),
            ],
            duration: 7.8,
            result: "completed",
            output: prompt.isEmpty
                ? "Finished the task. Everything checked out — no further action needed."
                : "Finished: \(prompt)\n\nEverything checked out — no further action needed.",
            session: newSession(),
            costUsd: 0.09)
    }

    private func genericCmdScript(for j: DemoWorld.Job) -> RunScript {
        let run = j.body["run"] as? [String: Any]
        let cmd: String
        if let c = run?["cmd"] as? String {
            cmd = c
        } else if let actionName = run?["action"] as? String {
            let actions = world.project(named: j.project)?.actions ?? []
            cmd = findAction(actionName, in: actions)?["cmd"] as? String ?? actionName
        } else {
            cmd = "npm test"
        }
        return RunScript(
            steps: [
                (0.4, "$ \(cmd)\n"),
                (2.0, "Running…\n"),
                (5.5, "Finished without errors.\n"),
            ],
            duration: 7.0,
            result: "completed",
            output: "$ \(cmd)\nRunning…\nFinished without errors.",
            session: "",
            costUsd: nil)
    }

    private func followupScript(for j: DemoWorld.Job) -> RunScript {
        let reply = j.id == "weekly-deps"
            ? "I took another look. Nothing risky in those updates — astro 4.9.1 only tightens a few types, and both patches are pure bug fixes. Safe to update whenever you like."
            : "I took another look at the last run and double-checked the details you asked about. Everything holds up — no further changes needed."
        return RunScript(
            steps: [
                (0.5, "Resuming session…\n"),
                (1.8, "Re-reading the last run…\n"),
                (3.5, "Working on your reply…\n"),
            ],
            duration: 6.0,
            result: "completed",
            output: reply,
            session: newSession(),
            costUsd: 0.07)
    }

    private func newSession() -> String {
        "demo-sess-" + UUID().uuidString.prefix(8).lowercased()
    }

    // MARK: schedule

    private func refreshNextFires() {
        for i in world.jobs.indices {
            world.jobs[i].nextFireAt = world.jobs[i].enabled ? nextFire(world.jobs[i]) : nil
        }
    }

    private func nextFire(_ j: DemoWorld.Job) -> Int? {
        let now = Date()
        switch j.scheduleMode {
        case "manual":
            return nil
        case "interval":
            guard j.everySecs > 0 else { return nil }
            return Int(now.timeIntervalSince1970) + j.everySecs
        default:
            let cal = Calendar.current
            let names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            let allowed = j.days.isEmpty ? Set(names) : Set(j.days)
            for offset in 0...7 {
                guard let day = cal.date(byAdding: .day, value: offset, to: now),
                      let fire = cal.date(bySettingHour: min(23, j.atMinutes / 60),
                                          minute: j.atMinutes % 60, second: 0, of: day)
                else { continue }
                let name = names[cal.component(.weekday, from: fire) - 1]
                if fire > now, allowed.contains(name) { return Int(fire.timeIntervalSince1970) }
            }
            return nil
        }
    }

    // MARK: body ↔ job

    private func applyBody(_ body: [String: Any], to j: inout DemoWorld.Job) {
        j.body = body
        j.label = body["label"] as? String ?? ""
        j.emoji = body["emoji"] as? String ?? ""
        j.duplicate = (body["duplicate"] as? Bool) == true

        let schedule = body["schedule"] as? [String: Any] ?? [:]
        if (schedule["manual"] as? Bool) == true {
            j.scheduleMode = "manual"
        } else if let every = schedule["every"] {
            j.scheduleMode = "interval"
            j.everySecs = Self.parseEverySecs(every)
        } else {
            j.scheduleMode = "calendar"
            j.atMinutes = Self.parseAtMinutes(schedule["at"] as? String ?? "")
            j.days = (schedule["days"] as? [Any])?.map { String(describing: $0).lowercased() } ?? []
        }

        let run = body["run"] as? [String: Any] ?? [:]
        if let a = run["action"] as? String, !a.isEmpty {
            j.runKind = "action"
            j.agent = ""; j.model = ""; j.effort = ""
        } else if let c = run["cmd"] as? String, !c.isEmpty {
            j.runKind = "cmd"
            j.agent = ""; j.model = ""; j.effort = ""
        } else {
            j.runKind = "prompt"
            j.agent = (run["agent"] as? String ?? "").lowercased()
            j.model = run["model"] as? String ?? ""
            j.effort = (run["effort"] as? String ?? "").lowercased()
        }
    }

    private func derivedBody(_ j: DemoWorld.Job) -> [String: Any] {
        var body: [String: Any] = ["label": j.label]
        if !j.emoji.isEmpty { body["emoji"] = j.emoji }
        switch j.scheduleMode {
        case "manual":
            body["schedule"] = ["manual": true]
        case "interval":
            let hours = max(1, j.everySecs / 3600)
            body["schedule"] = hours % 24 == 0 ? ["every": "\(hours / 24)d"] : ["every": "\(hours)h"]
        default:
            var s: [String: Any] = ["at": String(format: "%02d:%02d", j.atMinutes / 60, j.atMinutes % 60)]
            if !j.days.isEmpty { s["days"] = j.days }
            body["schedule"] = s
        }
        switch j.runKind {
        case "action":
            body["run"] = ["action": "test"]
        case "cmd":
            body["run"] = ["cmd": "npm test"]
        default:
            var run: [String: Any] = ["prompt": "Check the project and report anything that needs attention."]
            if !j.agent.isEmpty { run["agent"] = j.agent }
            if !j.model.isEmpty { run["model"] = j.model }
            if !j.effort.isEmpty { run["effort"] = j.effort }
            body["run"] = run
        }
        if j.duplicate { body["duplicate"] = true }
        return body
    }

    private static func parseEverySecs(_ every: Any) -> Int {
        if let n = every as? Int { return max(1, n) * 3600 }
        if let n = every as? Double { return max(1, Int(n)) * 3600 }
        let s = String(describing: every).trimmingCharacters(in: .whitespaces).lowercased()
        if s.hasSuffix("d"), let n = Int(s.dropLast()) { return max(1, n) * 86400 }
        if s.hasSuffix("h"), let n = Int(s.dropLast()) { return max(1, n) * 3600 }
        if let n = Int(s) { return max(1, n) * 3600 }
        return 6 * 3600
    }

    private static func parseAtMinutes(_ time: String) -> Int {
        let parts = time.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
              (0...23).contains(h), (0...59).contains(m) else { return 540 }
        return h * 60 + m
    }

    // MARK: helpers

    private func jobIndex(_ project: String, _ jobId: String) -> Int? {
        world.jobs.firstIndex { $0.project == project && $0.id == jobId }
    }

    private func job(_ project: String, _ jobId: String) -> DemoWorld.Job? {
        world.jobs.first { $0.project == project && $0.id == jobId }
    }
}
