package cx.lpm.mobile.core.demo

private const val HOUR_SECONDS = 3_600.0
private const val DAY_SECONDS = 86_400.0

/**
 * Demo handlers for the Usage screen (agent plan-usage meters). A static snapshot, like
 * the Stats fixtures: nothing lives in [DemoWorld].
 */
internal fun DemoServer.registerLimitsHandlers() {
    register("limits") {
        pushAfter(0.5) { limitsPayload(t = "limits", ok = true) }
        // A scripted follow-up so the reader also sees a live meter update, not just the
        // first read.
        pushAfter(6.0) { limitsPayload(t = "limits-changed", ok = null, advanced = true) }
    }
    register("limitReminders") { pushReminders() }
    register("setLimitReminder") { o ->
        val limit = o.string("limit").orEmpty()
        val window = o.string("window").orEmpty()
        world.limitReminders.removeAll {
            it.string("limit") == limit &&
                it.string("window") == window
        }
        world.limitReminders += mapOf(
            "limit" to limit,
            "window" to window,
            "resetsAt" to (o.long("resetsAt") ?: 0L),
            "name" to o.string("name").orEmpty()
        )
        pushReminders()
    }
    register("clearLimitReminder") { o ->
        val limit = o.string("limit").orEmpty()
        val window = o.string("window").orEmpty()
        world.limitReminders.removeAll {
            it.string("limit") == limit &&
                it.string("window") == window
        }
        pushReminders()
    }
}

private fun DemoServer.pushReminders() {
    pushAfter(0.2) {
        mapOf("t" to "limitReminders", "ok" to true, "reminders" to world.limitReminders.toList())
    }
}

/**
 * Built at fire time so every window (and the sender's clock stamp, which here is the
 * same device's, leaving a zero offset) is measured against the clock the reader's
 * phone will render it with.
 */
private fun DemoServer.limitsPayload(t: String, ok: Boolean?, advanced: Boolean = false): Dict {
    val nowMs = nowMillis()
    val now = nowMs / 1000.0
    val payload = mutableMapOf<String, Any?>(
        "t" to t,
        "limits" to mapOf(
            "claude:default" to mapOf(
                "provider" to "claude",
                "accountId" to "default",
                "label" to "Sonnet 4.6",
                "fiveHour" to limitWindow(
                    used = if (advanced) 71.0 else 62.0,
                    resetsIn = 3 * HOUR_SECONDS,
                    now = now
                ),
                "weekly" to limitWindow(
                    used = if (advanced) 28.0 else 27.0,
                    resetsIn = 4 * DAY_SECONDS,
                    now = now
                ),
                "updatedAt" to if (advanced) nowMs else nowMs - 90_000
            ),
            // A second account, so the projects list shows one usage row per account with
            // its "in use" / "pool" tags.
            "claude:work" to mapOf(
                "provider" to "claude",
                "accountId" to "work",
                "label" to "Opus 4.6",
                "fiveHour" to limitWindow(
                    used = 34.0,
                    resetsIn = 2 * HOUR_SECONDS + 600,
                    now = now
                ),
                "weekly" to limitWindow(
                    used = 11.0,
                    resetsIn = 4 * DAY_SECONDS + 10 * HOUR_SECONDS,
                    now = now
                ),
                "updatedAt" to nowMs - 240_000
            ),
            // No accountId: the Mac omits it for Codex, so the phone's optional decode
            // gets exercised here too.
            "codex" to mapOf(
                "provider" to "codex",
                "label" to "pro",
                "fiveHour" to limitWindow(used = 19.0, resetsIn = 4 * HOUR_SECONDS, now = now),
                "weekly" to limitWindow(
                    used = if (advanced) 98.0 else 96.0,
                    resetsIn = 2 * DAY_SECONDS + 10 * HOUR_SECONDS,
                    now = now
                ),
                "updatedAt" to if (advanced) nowMs else nowMs - 90_000
            )
        ),
        "claudeEnabled" to true,
        "now" to nowMs
    )
    if (ok != null) payload["ok"] = ok
    return payload
}

/**
 * `resetsAt` is unix SECONDS while the card's `updatedAt` is millis: the units differ
 * inside one object, and a normalized `resetsAt` renders every meter as already expired.
 */
private fun limitWindow(used: Double, resetsIn: Double, now: Double): Dict =
    mapOf("usedPercent" to used, "resetsAt" to (now + resetsIn).toLong())
