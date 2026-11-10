package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** One automation (the Mac's JobInfo). Timestamps are unix seconds. */
data class AutomationJob(
    val id: String,
    val project: String,
    val valid: Boolean,
    val source: String,
    val error: String,
    val label: String,
    val emoji: String,
    val enabled: Boolean,
    val duplicate: Boolean,
    val runKind: String,
    /** What the job runs, in one piece: the prompt, the command, or the action's name. */
    val summary: String,
    val scheduleMode: String,
    // The five-field line of a `cron` schedule, as written; empty otherwise.
    val cron: String,
    val everySecs: Int,
    val atMinutes: Int,
    val days: List<String>,
    // Randomized timing, absent on a schedule that fires at a fixed point:
    // `everyMaxSecs` and `untilMinutes` open the schedule into a range the run
    // time is drawn from, `times` puts several runs in that window, and
    // `pickDays` uses only some of `days` each week.
    val everyMaxSecs: Int,
    val untilMinutes: Int?,
    val times: Int,
    val pickDays: Int,
    // Further fixed times, and days that aren't weekdays: dates of the month
    // (with each month's last day), a position in the month ("first" "mon"),
    // or one-off calendar dates. An interval held to some hours carries
    // `fromMinutes`..`untilMinutes` and its `days`. Older servers omit them all.
    val alsoAtMinutes: List<Int>,
    val monthDays: List<Int>,
    val lastDay: Boolean,
    val shortMonths: String,
    val nth: String,
    val nthOf: String,
    val onDates: List<String>,
    val fromMinutes: Int?,
    val lastRunAt: Long?,
    val lastResult: String,
    /**
     * What the last run said about itself: a failed run's reason or the head of its
     * output. Older Macs omit it, as they do [lastDurationSecs].
     */
    val lastNote: String = "",
    val lastDurationSecs: Int? = null,
    val nextFireAt: Long?,
    val running: Boolean,
    val runningSince: Long?,
    /**
     * What a run is doing before its own work starts ("check" or "copy"), the copy it
     * works in, and the project to carry it on in a terminal from. Older Macs omit them.
     */
    val runningStep: String = "",
    val runningInName: String = "",
    val takeOverIn: String = "",
    val agent: String,
    val model: String,
    val effort: String,
    // Which projects the job runs in. A project- or repo-layer job carries its one
    // owning project; a global-layer job collapses to a single row whose `targets`
    // are every project it covers ([] when it is standalone).
    val targets: List<String>,
    val targetCount: Int,
    val runningCount: Int,
    val standalone: Boolean,
    /** Runs that landed since this automation was last read, folded across its projects. */
    val unread: Int,
    /**
     * The question the automation is waiting on the user to answer: the one
     * holding it up, or else the first asked under a key.
     */
    val ask: AutomationAsk? = null,
    /** Every question it waits on. Older Macs send only [ask]. */
    val asks: List<AutomationAsk> = listOfNotNull(ask),
    /**
     * The computers that may run it, best first; the first one that's on runs it.
     * Empty on a job every computer that has it runs.
     */
    val machines: List<AutomationMachine> = emptyList(),
    /** After [machines], any other computer that has it and is on. */
    val anyMachine: Boolean = false
) {
    val key: String get() = runProject + "\n" + id
    val displayName: String get() = label.ifEmpty { id }

    /** A question without a key is waiting, so the next run holds back. */
    val held: Boolean get() = asks.any { it.holdsJob }

    /**
     * The projects this job runs in — none when it is standalone. Older servers
     * omit `targets`, in which case the job's own project stands for it.
     */
    val runsIn: List<String>
        get() = when {
            standalone -> emptyList()
            targets.isNotEmpty() -> targets
            else -> if (project.isEmpty()) emptyList() else listOf(project)
        }

    /**
     * Every folder the job runs in, keyed the way the Mac keys run state: a
     * standalone job's is the sentinel "" (the home folder).
     */
    val runTargets: List<String> get() = if (standalone) listOf("") else runsIn

    /**
     * The one project to address this job by — a global-layer row carries only its
     * `targets`, never a `project` of its own.
     */
    val runProject: String get() = runTargets.firstOrNull().orEmpty()

    companion object {
        fun parse(o: JsonObject): AutomationJob {
            val schedule = o.obj("schedule") ?: JsonObject(emptyMap())
            val ask = AutomationAsk.parse(o["ask"])?.takeIf { it.isOpen }
            return AutomationJob(
                id = o.string("id").orEmpty(),
                project = o.string("project").orEmpty(),
                valid = o.bool("valid") ?: false,
                source = o.string("source").orEmpty(),
                error = o.string("error").orEmpty(),
                label = o.string("label").orEmpty(),
                emoji = o.string("emoji").orEmpty(),
                enabled = o.bool("enabled") ?: false,
                duplicate = o.bool("duplicate") ?: false,
                runKind = o.string("runKind").orEmpty(),
                summary = o.string("description").orEmpty(),
                scheduleMode = schedule.string("mode").orEmpty(),
                cron = schedule.string("cron").orEmpty(),
                everySecs = schedule.int("everySecs") ?: 0,
                atMinutes = schedule.int("atMinutes") ?: 0,
                days = schedule.strings("days").orEmpty(),
                everyMaxSecs = schedule.int("everyMaxSecs") ?: 0,
                untilMinutes = schedule.int("untilMinutes"),
                times = schedule.int("times") ?: 1,
                pickDays = schedule.int("pickDays") ?: 0,
                alsoAtMinutes = schedule.ints("alsoAtMinutes").orEmpty(),
                monthDays = schedule.ints("monthDays").orEmpty(),
                lastDay = schedule.bool("lastDay") ?: false,
                shortMonths = schedule.string("shortMonths").orEmpty(),
                nth = schedule.string("nth").orEmpty(),
                nthOf = schedule.string("nthOf").orEmpty(),
                onDates = schedule.strings("onDates").orEmpty(),
                fromMinutes = schedule.int("fromMinutes"),
                lastRunAt = o.long("lastRunAt"),
                lastResult = o.string("lastResult").orEmpty(),
                lastNote = o.string("lastNote").orEmpty(),
                lastDurationSecs = o.int("lastDurationSecs"),
                nextFireAt = o.long("nextFireAt"),
                running = o.bool("running") ?: false,
                runningSince = o.long("runningSince"),
                runningStep = o.string("runningStep").orEmpty(),
                runningInName = o.string("runningInName").orEmpty(),
                takeOverIn = o.string("takeOverIn").orEmpty(),
                agent = o.string("agent").orEmpty(),
                model = o.string("model").orEmpty(),
                effort = o.string("effort").orEmpty(),
                targets = o.strings("targets").orEmpty(),
                targetCount = o.int("targetCount") ?: 0,
                runningCount = o.int("runningCount") ?: 0,
                standalone = o.bool("standalone") ?: false,
                unread = o.int("unread") ?: 0,
                ask = ask,
                asks =
                    (o["asks"] as? JsonArray)?.mapNotNull(AutomationAsk::parse)?.filter {
                        it.isOpen
                    }
                        ?: listOfNotNull(ask),
                machines = o.list("machines", AutomationMachine::parse),
                anyMachine = o.bool("anyMachine") ?: false
            )
        }
    }
}

/** A computer an automation runs on, named as the Mac knows it. */
data class AutomationMachine(val id: String, val name: String, val here: Boolean) {
    companion object {
        fun parse(o: JsonObject): AutomationMachine = AutomationMachine(
            id = o.string("id").orEmpty(),
            name = o.string("name").orEmpty(),
            here = o.bool("here") ?: false
        )
    }
}

/** One run of an automation (the Mac's JobHistoryEntry). Timestamps are unix seconds. */
data class AutomationHistoryEntry(
    val at: Long,
    val result: String,
    val count: Int,
    val copy: String,
    val output: String,
    val durationSecs: Int?,
    val costUsd: Double?,
    val question: String,
    val session: String,
    val resumed: String,
    val follows: Long?,
    val compacted: Boolean,
    /**
     * Whether the job's after-the-run check passed. null means the job declares no
     * check, or there was no live run to check — unverified, not failed.
     */
    val verified: Boolean?,
    /** The run landed after this automation was last read. */
    val unread: Boolean,
    /** What the run asked the user, with how each question ended. */
    val asks: List<AutomationAsk> = emptyList(),
    /**
     * The question this entry's message answered — the entry that asked shows the
     * answer, so it isn't repeated as a message.
     */
    val answerTo: String = "",
    /** The computer that made this run when it wasn't this Mac. */
    val ranOn: String = "",
    /** The automation's onAnswer command, run for the keyed question in [asks]. */
    val onAnswer: Boolean = false
) {
    val id: Long get() = at

    /** The entry asked the user something that's still unanswered. */
    val waiting: Boolean get() = asks.any { it.isOpen }

    companion object {
        fun parse(o: JsonObject): AutomationHistoryEntry = AutomationHistoryEntry(
            at = o.long("at") ?: 0,
            result = o.string("result").orEmpty(),
            count = o.int("count") ?: 1,
            copy = o.string("copy").orEmpty(),
            output = o.string("output").orEmpty(),
            durationSecs = o.int("durationSecs"),
            costUsd = o.number("costUsd"),
            question = o.string("question").orEmpty(),
            session = o.string("session").orEmpty(),
            resumed = o.string("resumed").orEmpty(),
            follows = o.long("follows"),
            compacted = o.bool("compacted") ?: false,
            verified = o.bool("verified"),
            unread = o.bool("unread") ?: false,
            asks = (o["asks"] as? JsonArray).orEmpty().mapNotNull(AutomationAsk::parse),
            answerTo = o.string("answerTo").orEmpty(),
            ranOn = o.string("ranOn").orEmpty(),
            onAnswer = o.bool("onAnswer") ?: false
        )
    }
}

data class AutomationLiveOutput(val startedAt: Long, val text: String) {
    companion object {
        fun parse(o: JsonObject?): AutomationLiveOutput? = o?.let {
            AutomationLiveOutput(
                startedAt = it.long("startedAt") ?: 0,
                text = it.string("text").orEmpty()
            )
        }
    }
}
