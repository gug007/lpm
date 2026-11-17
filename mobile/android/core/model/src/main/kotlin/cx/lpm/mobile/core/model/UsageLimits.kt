package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

// Wire mirror of the Mac's agent plan-usage snapshot (`limits` / `limits-changed`).
// Two units live inside one object: `resetsAt` is unix SECONDS while `updatedAt` is
// unix MILLIS. Optional fields are omitted from the payload, never null.

/**
 * One plan window. `usedPercent` is whatever the tool reported and is NOT clamped —
 * readings above 100 occur — so clamp it for a bar and nothing else. It reads as
 * NaN when the Mac sent no usable figure, which the pace math turns into an
 * "unknown" verdict rather than a fabricated 0%. `resetsAt` is 0 when the tool did
 * not say when the window turns over.
 */
data class LimitWindow(val usedPercent: Double, val resetsAt: Long) {
    companion object {
        fun parse(o: JsonObject): LimitWindow = LimitWindow(
            usedPercent = o.number("usedPercent") ?: Double.NaN,
            resetsAt = o.numberLong("resetsAt") ?: 0
        )
    }
}

/**
 * One tool's latest reading. `accountId` is Claude-only (its per-account config
 * directory, usually "default"); `label` is the Codex plan or the Claude model
 * display name. `updatedAt` is unix millis. `noFiveHour` marks a plan with a weekly
 * window and no 5-hour one, whose 5-hour meter is left out.
 */
data class ProviderLimits(
    val provider: String,
    val accountId: String?,
    val label: String?,
    val fiveHour: LimitWindow?,
    val weekly: LimitWindow?,
    val updatedAt: Long,
    val noFiveHour: Boolean = false
) {
    companion object {
        fun parse(o: JsonObject): ProviderLimits = ProviderLimits(
            provider = o.string("provider").orEmpty(),
            accountId = o.string("accountId"),
            label = o.string("label"),
            fiveHour = o.obj("fiveHour")?.let(LimitWindow::parse),
            weekly = o.obj("weekly")?.let(LimitWindow::parse),
            updatedAt = o.numberLong("updatedAt") ?: 0,
            noFiveHour = o.bool("noFiveHour") ?: false
        )
    }
}

/**
 * The whole snapshot: entries keyed "codex" or "claude:<accountId>", plus whether
 * Claude reporting is switched on for this Mac. Without the flag an empty map is
 * ambiguous — a Mac with Claude reporting off never reports Claude windows at all.
 */
data class LimitsSnapshot(
    val entries: Map<String, ProviderLimits>,
    val claudeEnabled: Boolean,
    /**
     * The Mac's own clock when it built this snapshot, unix MILLIS. It anchors
     * `updatedAt`; `resetsAt` comes from the tool's own servers and is not on this
     * clock. Null when the Mac didn't say (an older Mac) or when what it said isn't a
     * believable wall-clock reading.
     */
    val nowMs: Double?
) {
    companion object {
        /**
         * Millis from 2001 to 2100: anything outside is a zero, a seconds value sent
         * by mistake, or garbage.
         */
        private val plausibleNowMsRange = 1_000_000_000_000.0..4_102_444_800_000.0

        fun parse(o: JsonObject): LimitsSnapshot = LimitsSnapshot(
            entries = buildMap {
                for ((key, value) in o.obj("limits").orEmpty()) {
                    value.asObject()?.let { put(key, ProviderLimits.parse(it)) }
                }
            },
            claudeEnabled = o.bool("claudeEnabled") ?: false,
            nowMs = o.number("now")?.takeIf { it in plausibleNowMsRange }
        )
    }
}

/**
 * What the Usage screen says when nothing more specific is known — the wire decode,
 * the request timeout and the store's own fallback all reach for this one string.
 */
const val USAGE_GENERIC_ERROR = "Couldn't load usage. Pull to refresh."
