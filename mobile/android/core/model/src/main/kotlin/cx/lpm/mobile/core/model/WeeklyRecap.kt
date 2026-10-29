package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

// Wire mirror of the desktop `WeeklyRecap` (src-tauri/weekly_recap.rs, camelCase JSON).
// Every field may be missing on an older Mac and reads as 0, [] or null.

/** Which week a recap covers: the one before this, or this one so far. */
enum class RecapWeek(val wire: String) {
    Last("last"),
    This("this");

    companion object {
        fun of(wire: String?): RecapWeek? = entries.firstOrNull { it.wire == wire }
    }
}

/** What a recap covers: a week, Monday to Sunday, or a calendar month. */
enum class RecapPeriod(val wire: String) {
    Week("week"),
    Month("month");

    companion object {
        fun of(wire: String?): RecapPeriod? = entries.firstOrNull { it.wire == wire }
    }
}

/** One recap the screen can show: last or this week or month. */
data class RecapPick(val week: RecapWeek, val period: RecapPeriod)

/** One day of the week: its agent time, the prompts sent and the tokens read and written. */
data class RecapDay(val date: String, val agentMs: Long, val prompts: Long, val tokens: Long = 0) {
    companion object {
        fun parse(o: JsonObject): RecapDay = RecapDay(
            date = o.string("date").orEmpty(),
            agentMs = o.numberLong("agentMs") ?: 0,
            prompts = o.numberLong("prompts") ?: 0,
            tokens = o.numberLong("tokens") ?: 0
        )
    }
}

/** Agent time on one project, or by one agent. */
data class RecapTime(val name: String, val agentMs: Long) {
    companion object {
        fun parse(o: JsonObject): RecapTime = RecapTime(
            name = o.string("name").orEmpty(),
            agentMs = o.numberLong("agentMs") ?: 0
        )
    }
}

/**
 * One week of agent work on the Mac and every computer it connects to, Monday first, or
 * one month from its 1st. [missing] names the paired computers that couldn't add theirs.
 */
data class WeeklyRecap(
    val week: String,
    val days: List<RecapDay>,
    val previousAgentMs: Long,
    val sessions: Long,
    val projects: List<RecapTime>,
    val agents: List<RecapTime>,
    val workedRepos: List<String>,
    val linesAdded: Long,
    val linesRemoved: Long,
    val missing: List<String> = emptyList(),
    val period: RecapPeriod = RecapPeriod.Week
) {
    companion object {
        fun parse(o: JsonObject): WeeklyRecap = WeeklyRecap(
            week = o.string("week").orEmpty(),
            period = RecapPeriod.of(o.string("period")) ?: RecapPeriod.Week,
            days = o.list("days", RecapDay::parse),
            previousAgentMs = o.numberLong("previousAgentMs") ?: 0,
            sessions = o.numberLong("sessions") ?: 0,
            projects = o.list("projects", RecapTime::parse),
            agents = o.list("agents", RecapTime::parse),
            workedRepos = o.strings("workedRepos").orEmpty(),
            linesAdded = o.numberLong("linesAdded") ?: 0,
            linesRemoved = o.numberLong("linesRemoved") ?: 0,
            missing = o.strings("missing").orEmpty()
        )
    }
}
