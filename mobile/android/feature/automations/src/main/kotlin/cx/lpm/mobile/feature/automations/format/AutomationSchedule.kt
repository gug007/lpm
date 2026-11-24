package cx.lpm.mobile.feature.automations.format

import cx.lpm.mobile.core.model.AutomationJob
import java.util.Locale

/** A job's schedule in words: "Every day at 03:00", "Mon at 06:00", "Every 6 hours". */
fun automationScheduleText(job: AutomationJob): String {
    when (job.scheduleMode) {
        "manual" -> return "Manual"
        "event" -> return eventText(job)
        "cron" -> return "Cron ${job.cron}"
        "interval" -> return intervalText(job)
    }
    val time = timePhrase(job)
    val rule = dateRulePhrase(job)
    if (rule != null) {
        return when {
            job.times > 1 -> "${job.times} times $rule $time"
            job.onDates.isNotEmpty() -> "Once, $rule $time"
            else -> "${rule.capitalized()} $time"
        }
    }
    val days = dayPhrase(job)
    if (job.times <= 1) return "${days.capitalized()} $time"
    return "${job.times} times ${if (days == "every day") "a day" else "on $days"} $time"
}

/** "09:00" from minutes past midnight. */
fun clockText(minutes: Int): String =
    String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60)

internal fun String.capitalized(): String = replaceFirstChar(Char::uppercaseChar)

/** "a, b and c". */
internal fun joinedWords(words: List<String>): String {
    if (words.size <= 1) return words.firstOrNull().orEmpty()
    return words.dropLast(1).joinToString(", ") + " and " + words.last()
}

/** "6 hours" / "30 minutes" / "2 days" — a gap sized to the unit it reads best in. */
private fun intervalParts(secs: Int): Pair<Int, String> = when {
    secs > 0 && secs % DAY_SECS == 0 -> secs / DAY_SECS to "day"
    secs in 1 until HOUR_SECS -> maxOf(1, secs / MINUTE_SECS) to "minute"
    else -> maxOf(1, secs / HOUR_SECS) to "hour"
}

private fun pluralized(value: Int, unit: String): String = if (value == 1) unit else "${unit}s"

private fun ordinalText(n: Int): String {
    val suffix = when {
        n % 100 in 11..13 -> "th"
        n % 10 == 1 -> "st"
        n % 10 == 2 -> "nd"
        n % 10 == 3 -> "rd"
        else -> "th"
    }
    return "$n$suffix"
}

/**
 * "When CI fails on main", "When api crashes", "When an agent finishes in docs-site,
 * once a day", "When a PR into main gets a review": what starts an event's job, worded
 * as the desktop words it.
 */
private fun eventText(job: AutomationJob): String {
    val text = when (job.eventOn) {
        "ciFailed" -> if (job.eventBranches.isEmpty()) {
            "When CI fails"
        } else {
            "When CI fails on ${orWords(job.eventBranches)}"
        }

        "serviceCrashed" -> if (job.eventServices.isEmpty()) {
            "When a service crashes"
        } else {
            "When ${orWords(job.eventServices)} crashes"
        }

        "prReviewed" -> "When ${pullRequestWords(job)} gets a review"

        "prOpened" -> "When ${pullRequestWords(job)} is opened"

        else -> if (job.eventFrom.isEmpty()) {
            "When an agent finishes"
        } else {
            "When an agent finishes in ${orWords(job.eventFrom)}"
        }
    }
    return if (job.eventAtMost == "day") "$text, once a day" else text
}

/** "a PR", or "a PR into main or release": the branches name what it merges into. */
private fun pullRequestWords(job: AutomationJob): String =
    if (job.eventBranches.isEmpty()) "a PR" else "a PR into ${orWords(job.eventBranches)}"

/** "a, b or c". */
private fun orWords(words: List<String>): String {
    if (words.size <= 1) return words.firstOrNull().orEmpty()
    return words.dropLast(1).joinToString(", ") + " or " + words.last()
}

private fun intervalText(job: AutomationJob): String {
    val (lo, loUnit) = intervalParts(job.everySecs)
    var text = if (job.everyMaxSecs > job.everySecs) {
        val (hi, hiUnit) = intervalParts(job.everyMaxSecs)
        if (loUnit == hiUnit) {
            "Every $lo–$hi ${pluralized(hi, hiUnit)}"
        } else {
            "Every $lo ${pluralized(lo, loUnit)} to $hi ${pluralized(hi, hiUnit)}"
        }
    } else if (lo == 1) {
        "Every $loUnit"
    } else {
        "Every $lo ${pluralized(lo, loUnit)}"
    }
    val from = job.fromMinutes
    val until = job.untilMinutes
    if (from != null && until != null) text += " between ${clockText(from)} and ${clockText(until)}"
    if (job.days.isNotEmpty()) text += " on " + job.days.joinToString(", ") { it.capitalized() }
    return text
}

/**
 * Days that aren't weekdays: "on the 1st and last day of every month", "on the first
 * Mon of every month", "on 2026-10-20". Null for a weekday schedule.
 */
private fun dateRulePhrase(job: AutomationJob): String? {
    if (job.onDates.isNotEmpty()) return "on " + joinedWords(job.onDates)
    if (job.nth.isNotEmpty()) {
        val of = if (job.nthOf.length == 3) job.nthOf.capitalized() else job.nthOf
        return "on the ${job.nth} $of of every month"
    }
    if (job.monthDays.isEmpty() && !job.lastDay) return null
    val words =
        job.monthDays.map(::ordinalText) + if (job.lastDay) listOf("last day") else emptyList()
    return "on the ${joinedWords(words)} of every month"
}

/** Which days the job runs on: "every day", "Mon, Thu", "2 random weekdays a week". */
private fun dayPhrase(job: AutomationJob): String {
    if (job.pickDays <= 0) {
        if (job.days.isEmpty()) return "every day"
        return job.days.joinToString(", ") { it.capitalized() }
    }
    return randomDaysPhrase(job.pickDays, job.days.toSet())
}

/** "2 random weekdays a week", "1 random weekend day a week", "3 random days a week". */
internal fun randomDaysPhrase(pick: Int, days: Set<String>): String {
    val s = if (pick == 1) "" else "s"
    val noun = when (days) {
        WEEKDAY_SET -> "weekday$s"
        WEEKEND_SET -> "weekend day$s"
        else -> "day$s"
    }
    return "$pick random $noun a week"
}

/** "at 09:00", "at 09:00 and 17:30", or the window a random time is drawn from. */
private fun timePhrase(job: AutomationJob): String {
    val until = job.untilMinutes
        ?: return "at " + joinedWords((listOf(job.atMinutes) + job.alsoAtMinutes).map(::clockText))
    return "between ${clockText(job.atMinutes)} and ${clockText(until)}"
}

private val WEEKDAY_SET = setOf("mon", "tue", "wed", "thu", "fri")
private val WEEKEND_SET = setOf("sat", "sun")
private const val MINUTE_SECS = 60
private const val HOUR_SECS = 3600
private const val DAY_SECS = 86400
