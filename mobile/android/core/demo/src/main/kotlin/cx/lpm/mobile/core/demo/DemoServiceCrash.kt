package cx.lpm.mobile.core.demo

// Demo Mode's crash (iOS DemoServiceCrash.swift): the storefront's worker, started on
// its own, dies on its first job, so a crashed service, its log and the ways to fix it
// can be seen. Started with the rest of the project it keeps running, leaving the
// demo's other screens as they are.

private const val CRASHING_PROJECT = "storefront"
private const val CRASHING_SERVICE = "worker"

internal val WORKER_CRASH_LOG = listOf(
    "worker ready — waiting for jobs",
    "",
    "processed image-resize #1043 (911ms)",
    "processed inventory-sync #1044 (204ms)",
    "sending email-receipt #1045",
    "jobs/receipt.ts:42",
    "  const total = formatMoney(order.totals.grand)",
    "                                         ^",
    "",
    "TypeError: Cannot read properties of undefined (reading 'grand')",
    "    at sendReceipt (jobs/receipt.ts:42:41)",
    "    at processJob (jobs/worker.ts:88:11)",
    "    at Queue.run (jobs/worker.ts:31:7)",
    "",
    "Node.js v22.11.0",
    ""
).joinToString("\n")

/** Ends [service] with exit code 1 a moment after it starts, if it's the one that crashes. */
internal fun DemoServer.crashSoon(project: String, service: String) {
    if (project != CRASHING_PROJECT || service != CRASHING_SERVICE) return
    pushAfter(2.4) {
        val idx = world.projectIndex(project) ?: return@pushAfter null
        val s = world.projects[idx].services.firstOrNull { it.name == service }
            ?: return@pushAfter null
        if (!s.running || s.exited) return@pushAfter null
        s.exited = true
        s.exitCode = 1
        mapOf("t" to "projects-changed")
    }
}

internal fun DemoWorld.Svc.start() {
    running = true
    exited = false
    exitCode = null
}

internal fun DemoWorld.Svc.stop() {
    running = false
    exited = false
    exitCode = null
}
