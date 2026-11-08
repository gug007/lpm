package cx.lpm.mobile.core.demo

/**
 * Demo Mode's service logs: `serviceLogs` captures and `serviceLogsWatch` pushes, over
 * canned output that grows a little with every capture.
 */
internal fun DemoServer.registerServiceLogHandlers() {
    register("serviceLogs") { o ->
        val project = o.string("project") ?: return@register
        push(serviceLogsFrame(project, pane = o.int("paneIndex") ?: 0))
    }
    register("serviceLogsWatch") { o ->
        val project = o.string("project") ?: return@register
        val pane = o.int("paneIndex") ?: 0
        world.serviceLogWatchSeq += 1
        val token = world.serviceLogWatchSeq
        world.serviceLogWatches["$project\n$pane"] = token
        pushWatchedServiceLogs(project, pane, token, last = null)
    }
    register("serviceLogsUnwatch") { o ->
        val project = o.string("project") ?: return@register
        world.serviceLogWatches.remove("$project\n${o.int("paneIndex") ?: 0}")
    }
}

/** One `serviceLogs` capture; each one finds a little more output, as a running service's would. */
private fun DemoServer.serviceLogsFrame(project: String, pane: Int): Dict {
    val p = world.project(project)
    val running = if (p?.running == true) p.services.filter { it.running } else emptyList()
    val svc = running.getOrNull(pane) ?: return mapOf(
        "t" to "serviceLogs",
        "project" to project,
        "paneIndex" to pane,
        "ok" to false,
        "error" to "That service isn't running."
    )
    val key = project + "\n" + svc.name
    val ticks = world.serviceLogTicks[key] ?: 0
    world.serviceLogTicks[key] = ticks + 1
    return mapOf(
        "t" to "serviceLogs",
        "project" to project,
        "paneIndex" to pane,
        "ok" to true,
        "text" to serviceLogText(svc, ticks)
    )
}

/**
 * A watched pane, pushed like the Mac does: whenever the capture changed, until the
 * watch is replaced or dropped.
 */
private fun DemoServer.pushWatchedServiceLogs(
    project: String,
    pane: Int,
    token: Int,
    last: String?
) {
    if (world.serviceLogWatches["$project\n$pane"] != token) return
    val frame = serviceLogsFrame(project, pane)
    val capture = (frame["text"] ?: frame["error"]) as? String
    if (capture != last) push(frame)
    after(1.5) { pushWatchedServiceLogs(project, pane, token, last = capture) }
}

private fun serviceLogText(svc: DemoWorld.Svc, ticks: Int): String {
    if (svc.exited) return WORKER_CRASH_LOG
    val (header, pool) = logTemplate(svc)
    val extra = minOf(3 + ticks * 2, 60)
    val lines = header + (0 until extra).map { pool[it % pool.size] }
    return lines.joinToString("\n") + "\n"
}

private fun logTemplate(svc: DemoWorld.Svc): Pair<List<String>, List<String>> = when (svc.name) {
    "web" -> listOf(
        "▲ Next.js 15.3.2",
        "- Local:        http://localhost:3000",
        "✓ Ready in 1.2s",
        ""
    ) to listOf(
        "GET / 200 in 41ms",
        "GET /products 200 in 63ms",
        "GET /checkout 200 in 57ms",
        "POST /api/cart 200 in 22ms",
        "GET /products/canvas-tote 200 in 48ms",
        "GET /api/health 200 in 4ms"
    )

    "api" -> listOf("api listening on http://localhost:4000", "") to listOf(
        "POST /v1/cart 200 18ms",
        "GET /v1/products 200 12ms",
        "POST /v1/checkout/intent 201 44ms",
        "GET /v1/products/canvas-tote 200 9ms",
        "GET /v1/health 200 2ms"
    )

    "worker" -> listOf("worker ready — waiting for jobs", "") to listOf(
        "processed email-receipt #1042 (320ms)",
        "processed image-resize #1043 (911ms)",
        "processed inventory-sync #1044 (204ms)"
    )

    "server" -> listOf("listening on :8080", "") to listOf(
        "GET /healthz 200 1ms",
        "POST /v1/token 200 12ms",
        "GET /v1/routes 200 7ms"
    )

    "metro" -> listOf(
        "Welcome to Metro",
        "Dev server ready on http://localhost:8081",
        ""
    ) to listOf(
        "BUNDLE ./index.js ▓▓▓▓▓▓▓▓▓▓ 100.0% (612/612)",
        "LOG Running \"mobile-app\" with 1 root tag"
    )

    "storybook" -> listOf(
        "Storybook started",
        "Local: http://localhost:6006/",
        ""
    ) to listOf(
        "info => Serving static files from ./public",
        "compiled successfully"
    )

    else -> listOf(
        "> ${svc.cmd}",
        "Local http://localhost:${svc.port}/",
        "watching for file changes…"
    ) to listOf(
        "200 / (12ms)",
        "200 /posts/hello-world (18ms)",
        "200 /about (9ms)"
    )
}
