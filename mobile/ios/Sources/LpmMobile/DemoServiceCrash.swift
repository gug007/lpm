import Foundation

/// Demo Mode's crash: the storefront's worker, started on its own, dies on its
/// first job, so a crashed service, its log and the ways to fix it can be seen.
/// Started with the rest of the project it keeps running, leaving the demo's
/// other screens as they are.
extension DemoServer {
    static let crashingService = (project: "storefront", service: "worker")

    static let workerCrashLog = """
        worker ready — waiting for jobs

        processed image-resize #1043 (911ms)
        processed inventory-sync #1044 (204ms)
        sending email-receipt #1045
        jobs/receipt.ts:42
          const total = formatMoney(order.totals.grand)
                                                 ^

        TypeError: Cannot read properties of undefined (reading 'grand')
            at sendReceipt (jobs/receipt.ts:42:41)
            at processJob (jobs/worker.ts:88:11)
            at Queue.run (jobs/worker.ts:31:7)

        Node.js v22.11.0

        """

    /// Ends `service` with exit code 1 a moment after it starts, if it's the one that crashes.
    func crashSoon(project: String, service: String) {
        guard project == Self.crashingService.project, service == Self.crashingService.service else { return }
        pushAfter(2.4) { [weak self] in
            guard let self, let idx = self.world.projectIndex(project),
                  let si = self.world.projects[idx].services.firstIndex(where: { $0.name == service }),
                  self.world.projects[idx].services[si].running,
                  !self.world.projects[idx].services[si].exited else { return nil }
            self.world.projects[idx].services[si].exited = true
            self.world.projects[idx].services[si].exitCode = 1
            return ["t": "projects-changed"]
        }
    }
}

extension DemoWorld.Svc {
    mutating func start() {
        running = true
        exited = false
        exitCode = nil
    }

    mutating func stop() {
        running = false
        exited = false
        exitCode = nil
    }
}
