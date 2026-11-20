package cx.lpm.mobile.core.demo

import cx.lpm.mobile.core.demo.DemoWorld.BgRunLine

// Project actions: terminal-relayed runs and background runs with their scripted output.

internal fun DemoServer.registerActionHandlers() {
    register("runAction") { o ->
        val project = o.string("project") ?: return@register
        val actionName = o.string("action") ?: return@register
        val action = world.project(project)?.let { findAction(actionName, it.actions) }
        if (action == null) {
            push(
                mapOf(
                    "t" to "runAction",
                    "ok" to false,
                    "project" to project,
                    "error" to "That action isn't available."
                )
            )
            return@register
        }
        val values = o["inputValues"].asStringMap() ?: emptyMap()
        val cmd = substitute(action.string("cmd") ?: actionName, values)
        val label = action.string("label")?.takeIf { it.isNotEmpty() } ?: actionName
        val id = "demo-$project-run-${nowMillis()}"
        val agent =
            demoActionAgentTerminal(action, o.string("prompt").orEmpty(), label, id, project)
        if (agent != null) {
            world.terminals.getOrPut(project) { mutableListOf() }.add(agent)
            push(mapOf("t" to "runAction", "ok" to true))
            return@register
        }
        world.terminals.getOrPut(project) { mutableListOf() }.add(
            DemoWorld.Terminal(
                id = id,
                label = label,
                project = project,
                buffer = shellPrompt(project) + cmd + "\r\n"
            )
        )
        push(mapOf("t" to "runAction", "ok" to true))
        writeToTerminalAfter(1.0, id = id, text = commandOutput(cmd, project))
    }
    register("runActionBackground") { o ->
        val project = o.string("project") ?: return@register
        val actionName = o.string("action") ?: return@register
        val runId = o.string("runId") ?: return@register
        val action = world.project(project)?.let { findAction(actionName, it.actions) }
        if (action == null) {
            push(
                mapOf(
                    "t" to "runActionBackground",
                    "ok" to false,
                    "runId" to runId,
                    "error" to "That action isn't available."
                )
            )
            return@register
        }
        val values = o["inputValues"].asStringMap() ?: emptyMap()
        val cmd = substitute(action.string("cmd") ?: actionName, values)
        val label = action.string("label")?.takeIf { it.isNotEmpty() } ?: actionName
        val now = nowInterval()
        val (duration, lines) = bgRunScript(cmd, project, values)
        world.backgroundRuns.add(
            DemoWorld.BgRun(
                runId = runId,
                project = project,
                label = label,
                startedAt = now.toLong(),
                startedRef = now,
                duration = duration,
                lines = lines
            )
        )
        push(mapOf("t" to "runActionBackground", "ok" to true))
    }
    register("actionBgOutput") { o ->
        val runId = o.string("runId") ?: return@register
        reapExpiredRuns()
        val run = world.backgroundRuns.firstOrNull { it.runId == runId }
        if (run == null) {
            push(mapOf("t" to "actionBgOutput", "ok" to true, "found" to false, "runId" to runId))
            return@register
        }
        val reply = bgRunSnapshot(run)
        reply["t"] = "actionBgOutput"
        reply["ok"] = true
        reply["found"] = true
        push(reply)
    }
    register("cancelActionBackground") { o ->
        val runId = o.string("runId") ?: return@register
        val run = world.backgroundRuns.firstOrNull { it.runId == runId }
        if (run != null && run.cancelledAt == null &&
            nowInterval() - run.startedRef < run.duration
        ) {
            run.cancelledAt = nowInterval()
        }
        push(mapOf("t" to "cancelActionBackground", "ok" to true, "runId" to runId))
    }
    register("backgroundRuns") { o ->
        val project = o.string("project") ?: return@register
        reapExpiredRuns()
        val runs = world.backgroundRuns
            .filter { it.project == project }
            .sortedByDescending { it.startedAt }
            .map { run ->
                val d = bgRunSnapshot(run)
                d.remove("project")
                d.remove("text")
                d
            }
        push(mapOf("t" to "backgroundRuns", "ok" to true, "project" to project, "runs" to runs))
    }
}

private fun DemoServer.bgRunSnapshot(run: DemoWorld.BgRun): MutableMap<String, Any?> {
    val now = nowInterval()
    val cutoff = minOf(now, run.cancelledAt ?: now) - run.startedRef
    val running = run.cancelledAt == null && now - run.startedRef < run.duration
    val cancelled = run.cancelledAt != null
    val text = run.lines.filter { it.at <= cutoff }.joinToString("\n") { it.text }
    return mutableMapOf(
        "runId" to run.runId,
        "project" to run.project,
        "label" to run.label,
        "startedAt" to run.startedAt,
        "text" to if (text.isEmpty()) text else text + "\n",
        "running" to running,
        "success" to (!cancelled && !running),
        "error" to if (cancelled) "cancelled" else ""
    )
}

private fun DemoServer.reapExpiredRuns() {
    val now = nowInterval()
    world.backgroundRuns.removeAll { run ->
        val end = run.cancelledAt ?: (run.startedRef + run.duration)
        val finished = run.cancelledAt != null || now - run.startedRef >= run.duration
        finished && now - end > 300
    }
}

private fun bgRunScript(
    cmd: String,
    project: String,
    values: Map<String, String>
): Pair<Double, List<BgRunLine>> {
    val c = cmd.lowercase()
    if ("go test" in c) {
        return 6.0 to listOf(
            BgRunLine(0.0, "$ $cmd"),
            BgRunLine(1.1, "ok  $project/internal/auth  0.31s"),
            BgRunLine(2.3, "ok  $project/internal/routes  0.58s"),
            BgRunLine(3.6, "ok  $project/internal/store  0.74s"),
            BgRunLine(4.8, "ok  $project/cmd/server  0.22s"),
            BgRunLine(5.7, "PASS")
        )
    }
    if ("release" in c) {
        return 5.0 to listOf(
            BgRunLine(0.0, "$ $cmd"),
            BgRunLine(0.8, "Tagging v2.4.2…"),
            BgRunLine(2.0, "Building linux/amd64, linux/arm64…"),
            BgRunLine(3.4, "Pushing ghcr.io/acme/$project:v2.4.2…"),
            BgRunLine(4.6, "Released v2.4.2.")
        )
    }
    if ("clean" in c) {
        return 5.5 to listOf(
            BgRunLine(0.0, "$ $cmd"),
            BgRunLine(0.9, "Removing node_modules/.cache…"),
            BgRunLine(2.2, "Removing .expo…"),
            BgRunLine(3.4, "Resetting the bundler cache…"),
            BgRunLine(5.2, "Caches cleared.")
        )
    }
    if ("new-post" in c) {
        val title = values["title"] ?: "untitled"
        return 4.5 to listOf(
            BgRunLine(0.0, "$ $cmd"),
            BgRunLine(1.0, "Creating a new draft…"),
            BgRunLine(2.4, "posts/${slug(title)}.md created"),
            BgRunLine(4.2, "Draft ready — happy writing!")
        )
    }
    return 5.0 to listOf(
        BgRunLine(0.0, "$ $cmd"),
        BgRunLine(1.2, "Running…"),
        BgRunLine(4.6, "Done.")
    )
}

internal fun commandOutput(cmd: String, project: String): String {
    val c = cmd.lowercase()
    val lines = when {
        "go test" in c -> listOf(
            "ok  $project/internal/auth  0.31s",
            "ok  $project/internal/routes  0.58s",
            "ok  $project/cmd/server  0.22s",
            "PASS"
        )

        "test" in c -> listOf(
            " RUN  v3.1.4 /Users/demo/Projects/$project",
            "",
            " ✓ lib/payments.test.ts (6 tests) 41ms",
            " ✓ components/CheckoutForm.test.tsx (9 tests) 187ms",
            " ✓ app/checkout/page.test.tsx (4 tests) 96ms",
            "",
            " Test Files  3 passed (3)",
            "      Tests  19 passed (19)",
            "   Duration  1.24s"
        )

        "lint" in c -> listOf(
            "> $project@1.4.2 lint",
            "> next lint",
            "",
            "✔ No ESLint warnings or errors"
        )

        "build" in c -> listOf(
            "▲ Next.js 15.3.2",
            "Creating an optimized production build…",
            "✓ Compiled successfully"
        )

        else -> listOf("Done.")
    }
    return lines.joinToString("\r\n")
}
