import Foundation

// Screenshot builds only: a busier Mac than the stock Demo Mode seed.
extension DemoWorld {
    mutating func shotSeed() {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        func update(_ name: String, _ change: (inout Project) -> Void) {
            if let i = projectIndex(name) { change(&projects[i]) }
        }
        update("api-gateway") { project in
            project.running = true
            project.services = project.services.map { svc in
                var running = svc
                running.running = true
                return running
            }
            project.workStatus = ["state": "in_progress", "note": "Rate limiting", "since": now - 5_400_000]
            project.status = [Status(key: "codex_demo-api-gateway-codex", value: "Running", priority: 10,
                                     timestamp: now - 140_000, paneID: "demo-api-gateway-codex")]
        }
        update("mobile-app") { project in
            project.workStatus = ["state": "blocked", "note": "Waiting on API keys", "since": now - 86_400_000]
        }
        projects += [
            Project(name: "analytics", label: "analytics", running: true,
                    services: [Svc(name: "dashboard", cmd: "npm run dev", port: 5173, running: true)]),
            Project(name: "payments-service", label: "payments-service", running: false,
                    services: [Svc(name: "server", cmd: "cargo run", port: 8000, running: false)]),
            Project(name: "docs-site", label: "docs-site", running: false,
                    workStatus: ["state": "done", "note": "v2 docs live", "since": now - 7_200_000],
                    services: [Svc(name: "dev", cmd: "npm run dev", port: 3001, running: false)]),
            Project(name: "landing-page", label: "landing-page", running: false,
                    services: [Svc(name: "dev", cmd: "npm run dev", port: 4322, running: false)]),
        ]
        if let i = folders.firstIndex(where: { $0.id == "client-work" }) {
            folders[i].members.append("landing-page")
        }
        sidebarOrder = ["storefront", "api-gateway", "analytics", "mobile-app", "payments-service", "docs-site"]
            + sidebarOrder.filter { $0.hasPrefix("group:") }
        terminals["api-gateway"] = [Terminal(id: "demo-api-gateway-codex", label: "Codex", project: "api-gateway",
                                             emoji: "🤖", cli: "codex")]
        for name in ["analytics", "payments-service", "docs-site", "landing-page"] {
            git[name] = git["blog"]
        }
    }
}

// The storefront Claude session has already finished and is waiting on you, so
// no screenshot has to sit through the scripted run.
extension DemoServer {
    func shotPrefill() {
        guard var list = world.terminals["storefront"],
              let i = list.firstIndex(where: { $0.id == "demo-storefront-claude" }) else { return }
        list[i].buffer = claudeWelcome("storefront") + claudeScriptSteps().map(\.1).joined()
        list[i].scriptStarted = true
        list[i].scriptFinished = true
        world.terminals["storefront"] = list
        if let p = world.projectIndex("storefront") {
            world.projects[p].status = [DemoWorld.Status(
                key: "claude_code_demo-storefront-claude", value: "Waiting", priority: 30,
                timestamp: Int(Date().timeIntervalSince1970 * 1000) - 19_000, paneID: "demo-storefront-claude")]
        }
    }
}
