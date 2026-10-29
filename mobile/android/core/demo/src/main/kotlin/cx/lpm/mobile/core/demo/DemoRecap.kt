package cx.lpm.mobile.core.demo

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

// The desktop demo's sample week (desktop/frontend/src/demo/seed/sample/recap.ts):
// agent minutes, prompts and millions of tokens per day, Monday first, Sunday off.
private val RecapMinutes = listOf(352L, 418L, 296L, 389L, 241L, 184L, 0L)
private val RecapPrompts = listOf(38L, 41L, 33L, 36L, 29L, 37L, 0L)
private val RecapTokens = listOf(61L, 74L, 52L, 68L, 43L, 32L, 0L)
private val RecapProjects = listOf(
    "saas-app" to 0.41,
    "auth-service" to 0.24,
    "docs-site" to 0.16,
    "ml-pipeline" to 0.12,
    "mobile-app" to 0.07
)
private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 60 * MINUTE_MS

/**
 * Demo handler for the Weekly recap screen: the same sample week, last week or this one,
 * and a month as the sample week on repeat, each day by its weekday.
 */
internal fun DemoServer.registerRecapHandlers() {
    register("weeklyRecap") { o ->
        val week = if (o.string("week") == "this") "this" else "last"
        val period = if (o.string("period") == "month") "month" else "week"
        pushAfter(0.6) {
            mapOf(
                "t" to "weeklyRecap",
                "ok" to true,
                "week" to week,
                "period" to period,
                "recap" to recapPayload(week, period)
            )
        }
    }
}

/**
 * The week starts on the Monday of last week or this one, the month on its 1st; this
 * week or month leaves the days to come empty.
 */
private fun DemoServer.recapPayload(week: String, period: String): Dict {
    val today = LocalDate.now(clock)
    val month = period == "month"
    val current = if (month) {
        today.withDayOfMonth(1)
    } else {
        today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
    }
    val first = when {
        week == "this" -> current
        month -> current.minusMonths(1)
        else -> current.minusWeeks(1)
    }
    val dates = (0 until if (month) first.lengthOfMonth() else 7).map {
        first.plusDays(it.toLong())
    }
    val days = dates.map { date ->
        val i = date.dayOfWeek.value - 1
        val counts = !date.isAfter(today)
        mapOf(
            "date" to date.toString(),
            "agentMs" to if (counts) RecapMinutes[i] * MINUTE_MS else 0L,
            "prompts" to if (counts) RecapPrompts[i] else 0L,
            "tokens" to if (counts) RecapTokens[i] * 1_000_000 else 0L
        )
    }
    val total = dates.sumOf { RecapMinutes[it.dayOfWeek.value - 1] } * MINUTE_MS
    val weeks = dates.size / 7.0
    return mapOf(
        "week" to first.toString(),
        "period" to period,
        "days" to days,
        "previousAgentMs" to total - 7 * HOUR_MS,
        "sessions" to Math.round(58 * weeks),
        "projects" to RecapProjects.map { (name, share) ->
            mapOf("name" to name, "agentMs" to Math.round(total * share))
        },
        "agents" to listOf(
            mapOf("name" to "claude", "agentMs" to Math.round(total * 0.64)),
            mapOf("name" to "codex", "agentMs" to Math.round(total * 0.36))
        ),
        "workedRepos" to listOf("auth-service", "ml-pipeline", "mobile-app", "saas-app")
            .map { "github.com/acme/$it" },
        "linesAdded" to Math.round(6_120 * weeks),
        "linesRemoved" to Math.round(2_407 * weeks)
    )
}
