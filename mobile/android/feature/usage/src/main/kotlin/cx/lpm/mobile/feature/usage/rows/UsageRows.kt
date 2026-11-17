package cx.lpm.mobile.feature.usage.rows

import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.CLAUDE_MAIN_LOGIN
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.LimitsSnapshot
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.core.model.UsageBreakdown
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.feature.usage.stats.formatTokenCount
import cx.lpm.mobile.feature.usage.usage.STALE_MS
import cx.lpm.mobile.feature.usage.usage.UsageReading
import kotlin.math.roundToLong

/**
 * One line of the usage rows under the projects list and a project's screen — the
 * desktop sidebar's `usageRows` (sidebarUsage.ts): one line per agent CLI, or per
 * Claude account once more than one is in play, with when its window comes back over
 * a bar of how much of it is gone.
 */
data class UsageRow(
    /** The account for a Claude row ("claude:<id>"), the tool otherwise. */
    val id: String,
    val provider: String,
    val label: String,
    /** The account's signed-in email, for the expanded card. */
    val subtitle: String?,
    /**
     * The bar is a window's, drawn in the calm limit tint; otherwise it's the day's
     * spend, drawn in the tool's own color.
     */
    val windowed: Boolean,
    val fraction: Double,
    /** How far through its window the clock is (0…1), where the pace tick sits. */
    val pace: Double?,
    /** When the window resets, today's spend without a window, or a dash. */
    val detail: String,
    val percentText: String,
    val windowLabel: String,
    /** "5h" beside the reset for the 5-hour window; empty for the weekly one. */
    val windowShort: String,
    /**
     * The other window, drawn as the thin lane under the row's own; null for a row that
     * only reports today's spend, or whose plan has no 5-hour window, and draws a single
     * bar.
     */
    val lane: UsageLane?,
    /** The other window's name and use, read out in place of its lane. */
    val laneText: String,
    val tokens: Long,
    val sessions: Int,
    val data: ProviderLimits?,
    val stale: Boolean
) {
    /** The Claude account this row is about, as its limits key; null for a tool row. */
    val account: String? get() = if (id.startsWith(
            CLAUDE_PREFIX
        )
    ) {
        id.removePrefix(CLAUDE_PREFIX)
    } else {
        null
    }

    /** "1.2M spent today · 3 sessions", or null when nothing was spent. */
    val spentLine: String?
        get() {
            if (tokens <= 0) return null
            val count = if (sessions == 1) "1 session" else "$sessions sessions"
            return "${formatTokenCount(tokens)} spent today · $count"
        }
}

/** One window as a lane of a usage row's track. */
data class UsageLane(val fraction: Double) {
    companion object {
        val Empty = UsageLane(0.0)
    }
}

private const val CLAUDE_PREFIX = "claude:"
private val UsageTools = listOf("claude", "codex")

private data class UsageIdentity(
    val id: String,
    val name: String,
    val subtitle: String? = null,
    val data: ProviderLimits? = null
)

private data class Candidate(
    val provider: String,
    val identity: UsageIdentity,
    val split: Boolean,
    val reading: UsageReading,
    val tokens: Long,
    val sessions: Int
)

/**
 * One row per agent CLI — or per Claude account, once more than one is in play — in
 * a fixed order so rows never swap places under a finger. A tool appears once it has a
 * usage window or has spent something today.
 *
 * [now] is the phone's clock, against which the tools' own `resetsAt` stamps are
 * judged; [macNow] is the Mac's, for the `updatedAt` it stamped.
 */
fun usageRows(
    snapshot: LimitsSnapshot?,
    today: AgentStats?,
    accounts: List<ClaudeAccountInfo>,
    now: Double,
    macNow: Double
): List<UsageRow> {
    val entries = snapshot?.entries?.values?.toList().orEmpty()
    val candidates = buildList {
        for (provider in UsageTools) {
            val identities = identitiesFor(provider, entries, accounts)
            val split = identities.size > 1
            // The day's spend is counted per tool, not per account, so it only stands in
            // for a tool that shows a single row.
            val spent: UsageBreakdown? =
                if (split) null else today?.providers?.firstOrNull { it.key == provider }
            for (identity in identities) {
                val data = identity.data
                val reading = UsageReading(
                    data?.weekly,
                    data?.fiveHour,
                    now,
                    data?.noFiveHour == true
                )
                val candidate = Candidate(
                    provider = provider,
                    identity = identity,
                    split = split,
                    reading = reading,
                    tokens = spent?.tokens?.totalTokens ?: 0,
                    sessions = spent?.sessions ?: 0
                )
                // An account row stays even with nothing to show — a row that vanished
                // when an account went idle would read as the account being gone.
                if (reading.hasWindow || candidate.tokens > 0 || split) add(candidate)
            }
        }
    }

    // Rows without a window are measured against each other: no plan publishes a token
    // budget to measure them against.
    val peak = candidates.filter { !it.reading.hasWindow }.maxOfOrNull { it.tokens } ?: 0
    return candidates.map { row(it, peak, macNow) }
}

private fun row(c: Candidate, peak: Long, macNow: Double): UsageRow {
    val reading = c.reading
    val windowed = reading.hasWindow
    val detail = when {
        windowed -> reading.reset
        c.tokens > 0 -> "${formatTokenCount(c.tokens)} today"
        else -> "—"
    }
    val data = c.identity.data
    return UsageRow(
        id = c.identity.id,
        provider = c.provider,
        label = if (c.split) c.identity.name else providerMeta(c.provider).short,
        subtitle = if (c.split) c.identity.subtitle else null,
        windowed = windowed,
        fraction = reading.fraction ?: if (peak > 0) c.tokens.toDouble() / peak else 0.0,
        pace = reading.pace,
        detail = detail,
        percentText = reading.percentText,
        windowLabel = if (windowed) reading.main.label else "",
        windowShort = if (windowed) reading.main.short else "",
        lane = if (windowed || c.tokens == 0L) reading.other?.let { laneFor(it.win) } else null,
        laneText = reading.other?.let { other ->
            reading.otherUsed?.let { "${other.label} ${it.roundToLong()}% used" }
        }.orEmpty(),
        tokens = c.tokens,
        sessions = c.sessions,
        data = data,
        stale = data?.let { macNow - it.updatedAt > STALE_MS } ?: false
    )
}

private fun identitiesFor(
    provider: String,
    entries: List<ProviderLimits>,
    accounts: List<ClaudeAccountInfo>
): List<UsageIdentity> {
    if (provider == "claude") return claudeIdentities(entries, accounts)
    val latest = entries.filter { it.provider == provider }.maxByOrNull { it.updatedAt }
    return listOf(UsageIdentity(id = provider, name = providerMeta(provider).short, data = latest))
}

/**
 * One identity per Claude account the person has: every account that reported, plus
 * the ones added on the Mac that have not run yet. Two accounts mean two rows — they
 * burn down separately.
 */
private fun claudeIdentities(
    entries: List<ProviderLimits>,
    accounts: List<ClaudeAccountInfo>
): List<UsageIdentity> {
    val registered = accounts.filter { it.id != CLAUDE_MAIN_LOGIN }
    val known = registered.map { it.id }.toSet()
    val reported = mutableMapOf<String, ProviderLimits>()
    for (entry in entries.filter { it.provider == "claude" }) {
        val id = entry.accountId?.ifEmpty { null } ?: CLAUDE_MAIN_LOGIN
        // An account no longer on the Mac can never report again; its last reading
        // would linger as a row named by a raw id.
        if (id != CLAUDE_MAIN_LOGIN && id !in known) continue
        val prev = reported[id]
        if (prev != null && prev.updatedAt >= entry.updatedAt) continue
        reported[id] = entry
    }
    if (reported.isEmpty()) {
        return listOf(UsageIdentity(id = "claude", name = providerMeta("claude").short))
    }
    val ids = registered.map { it.id } + listOfNotNull(CLAUDE_MAIN_LOGIN.takeIf { it in reported })
    return ids.map { id ->
        val account = registered.firstOrNull { it.id == id }
        UsageIdentity(
            id = CLAUDE_PREFIX + id,
            name = if (id ==
                CLAUDE_MAIN_LOGIN
            ) {
                providerMeta("claude").short
            } else {
                account?.name ?: id
            },
            subtitle = account?.email?.ifEmpty { null },
            data = reported[id]
        )
    }
}

private fun laneFor(win: LimitWindow?): UsageLane {
    win ?: return UsageLane.Empty
    val used = if (win.usedPercent.isFinite()) win.usedPercent else 0.0
    return UsageLane(used.coerceIn(0.0, 100.0) / 100)
}
