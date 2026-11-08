import Foundation

/// Demo Mode's service logs: `serviceLogs` captures and `serviceLogsWatch`
/// pushes, over canned output that grows a little with every capture.
extension DemoServer {
    func registerServiceLogHandlers() {
        register("serviceLogs") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.push(self.serviceLogsFrame(project: project, pane: o["paneIndex"] as? Int ?? 0))
        }
        register("serviceLogsWatch") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            let pane = o["paneIndex"] as? Int ?? 0
            self.world.serviceLogWatchSeq += 1
            let token = self.world.serviceLogWatchSeq
            self.world.serviceLogWatches[project + "\n" + String(pane)] = token
            self.pushWatchedServiceLogs(project: project, pane: pane, token: token, last: nil)
        }
        register("serviceLogsUnwatch") { [weak self] o in
            guard let self, let project = o["project"] as? String else { return }
            self.world.serviceLogWatches[project + "\n" + String(o["paneIndex"] as? Int ?? 0)] = nil
        }
    }

    /// One `serviceLogs` capture; each one finds a little more output, as a
    /// running service's would.
    private func serviceLogsFrame(project: String, pane: Int) -> [String: Any] {
        let running = (world.project(named: project)?.running ?? false)
            ? (world.project(named: project)?.services.filter { $0.running } ?? [])
            : []
        guard running.indices.contains(pane) else {
            return ["t": "serviceLogs", "project": project, "paneIndex": pane,
                    "ok": false, "error": "That service isn't running."]
        }
        let key = project + "\n" + running[pane].name
        let ticks = world.serviceLogTicks[key] ?? 0
        world.serviceLogTicks[key] = ticks + 1
        return ["t": "serviceLogs", "project": project, "paneIndex": pane, "ok": true,
                "text": serviceLogText(svc: running[pane], ticks: ticks)]
    }

    /// A watched pane, pushed like the Mac does: whenever the capture changed,
    /// until the watch is replaced or dropped.
    private func pushWatchedServiceLogs(project: String, pane: Int, token: Int, last: String?) {
        guard world.serviceLogWatches[project + "\n" + String(pane)] == token else { return }
        let frame = serviceLogsFrame(project: project, pane: pane)
        let capture = (frame["text"] ?? frame["error"]) as? String
        if capture != last { push(frame) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.pushWatchedServiceLogs(project: project, pane: pane, token: token, last: capture)
        }
    }

    private func serviceLogText(svc: DemoWorld.Svc, ticks: Int) -> String {
        if svc.exited { return Self.workerCrashLog }
        let (header, pool) = logTemplate(svc)
        var lines = header
        let extra = min(3 + ticks * 2, 60)
        for i in 0..<extra { lines.append(pool[i % pool.count]) }
        return lines.joined(separator: "\n") + "\n"
    }

    private func logTemplate(_ svc: DemoWorld.Svc) -> ([String], [String]) {
        switch svc.name {
        case "web":
            return (["▲ Next.js 15.3.2",
                     "- Local:        http://localhost:3000",
                     "✓ Ready in 1.2s",
                     ""],
                    ["GET / 200 in 41ms",
                     "GET /products 200 in 63ms",
                     "GET /checkout 200 in 57ms",
                     "POST /api/cart 200 in 22ms",
                     "GET /products/canvas-tote 200 in 48ms",
                     "GET /api/health 200 in 4ms"])
        case "api":
            return (["api listening on http://localhost:4000", ""],
                    ["POST /v1/cart 200 18ms",
                     "GET /v1/products 200 12ms",
                     "POST /v1/checkout/intent 201 44ms",
                     "GET /v1/products/canvas-tote 200 9ms",
                     "GET /v1/health 200 2ms"])
        case "worker":
            return (["worker ready — waiting for jobs", ""],
                    ["processed email-receipt #1042 (320ms)",
                     "processed image-resize #1043 (911ms)",
                     "processed inventory-sync #1044 (204ms)"])
        case "server":
            return (["listening on :8080", ""],
                    ["GET /healthz 200 1ms",
                     "POST /v1/token 200 12ms",
                     "GET /v1/routes 200 7ms"])
        case "metro":
            return (["Welcome to Metro",
                     "Dev server ready on http://localhost:8081",
                     ""],
                    ["BUNDLE ./index.js ▓▓▓▓▓▓▓▓▓▓ 100.0% (612/612)",
                     "LOG Running \"mobile-app\" with 1 root tag"])
        case "storybook":
            return (["Storybook started",
                     "Local: http://localhost:6006/",
                     ""],
                    ["info => Serving static files from ./public",
                     "compiled successfully"])
        default:
            return (["> \(svc.cmd)",
                     "Local http://localhost:\(svc.port)/",
                     "watching for file changes…"],
                    ["200 / (12ms)",
                     "200 /posts/hello-world (18ms)",
                     "200 /about (9ms)"])
        }
    }
}
