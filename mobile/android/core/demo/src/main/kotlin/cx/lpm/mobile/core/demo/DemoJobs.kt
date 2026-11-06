package cx.lpm.mobile.core.demo

/**
 * Demo handlers for automations: the jobs list, run history, live output, running and
 * toggling, and the authoring editor (config read, save/delete, follow-up).
 */
internal fun DemoServer.registerJobsHandlers() {
    register("jobs") {
        refreshNextFires()
        push(world.jobsPayload())
    }
    register("jobHistory") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        val j = job(project, jobId)
        val seenAt = j?.seenAt ?: 0
        val entries = (j?.history ?: emptyList()).map { jobRunDict(it, seenAt) }
        push(
            mapOf(
                "t" to "jobHistory",
                "project" to project,
                "jobId" to jobId,
                "ok" to true,
                "entries" to entries
            )
        )
    }
    // Reading a run moves the watermark to it, never backwards, so opening an older
    // run can't un-read the newer ones above it.
    register("markJobSeen") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        job(project, jobId)?.let { j ->
            val at = o.long("at") ?: nowSeconds()
            j.seenAt = maxOf(j.seenAt, at)
        }
        push(mapOf("t" to "markJobSeen", "project" to project, "jobId" to jobId, "ok" to true))
        push(mapOf("t" to "jobs-changed"))
    }
    register("markAllJobsSeen") {
        val now = nowSeconds()
        for (j in world.jobs) j.seenAt = now
        push(mapOf("t" to "markAllJobsSeen", "ok" to true))
        push(mapOf("t" to "jobs-changed"))
    }
    register("jobLiveOutput") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        val reply = mutableMapOf<String, Any?>(
            "t" to "jobLiveOutput",
            "project" to project,
            "jobId" to jobId,
            "ok" to true
        )
        val j = job(project, jobId)
        val startedAt = j?.liveStartedAt
        reply["live"] = if (j != null && startedAt != null) {
            mapOf("startedAt" to startedAt, "text" to j.liveText)
        } else {
            null
        }
        push(reply)
    }
    register("runJob") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        val j = job(project, jobId)
        if (j == null) {
            push(jobReply("runJob", project, jobId, error = "No such automation."))
            return@register
        }
        push(jobReply("runJob", project, jobId))
        if (!j.running) {
            startRun(project, jobId)
            push(mapOf("t" to "jobs-changed"))
        }
    }
    for (verb in listOf("stopJob", "takeOverJob")) {
        register(verb) { o ->
            val project = o.string("project") ?: return@register
            val jobId = o.string("jobId") ?: return@register
            val j = job(project, jobId)
            if (j != null && j.running) {
                j.runSeq += 1
                val done = nowSeconds()
                val started = j.liveStartedAt ?: done
                val run = DemoWorld.JobRun(
                    at = done,
                    result = "canceled",
                    output = j.liveText,
                    durationSecs = maxOf(1L, done - started).toInt()
                )
                j.running = false
                j.runningSince = null
                j.liveStartedAt = null
                j.liveText = ""
                j.lastRunAt = done
                j.lastResult = "canceled"
                j.history += run
            }
            push(jobReply(verb, project, jobId))
            push(mapOf("t" to "jobs-changed"))
        }
    }
    register("setJobEnabled") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        job(project, jobId)?.let { j ->
            val enabled = o.bool("enabled") ?: false
            j.enabled = enabled
            j.nextFireAt = if (enabled) nextFire(j) else null
        }
        push(jobReply("setJobEnabled", project, jobId))
        push(mapOf("t" to "jobs-changed"))
    }
    registerJobEditorHandlers()
}

private fun DemoServer.registerJobEditorHandlers() {
    register("jobConfig") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        val j = job(project, jobId)
        if (j == null) {
            push(jobReply("jobConfig", project, jobId, error = "Couldn't load the automation."))
            return@register
        }
        val body = j.body.ifEmpty { derivedBody(j) }
        push(
            mapOf(
                "t" to "jobConfig",
                "project" to project,
                "jobId" to jobId,
                "ok" to true,
                "job" to body
            )
        )
    }
    register("saveJob") { o ->
        val id = o.string("id") ?: ""
        if (id.isEmpty()) {
            push(
                mapOf(
                    "t" to "saveJob",
                    "ok" to false,
                    "id" to id,
                    "error" to "The job needs an id."
                )
            )
            return@register
        }
        val source = o.string("source") ?: "global"
        val project = o.string("project") ?: ""
        val body = o.dict("job") ?: emptyMap()
        val existing = world.jobs.firstOrNull {
            it.id == id && it.source == source && (source == "global" || it.project == project)
        }
        if (existing != null) {
            applyBody(body, existing)
        } else {
            val owner = if (source == "global") "" else project
            val j = DemoWorld.Job(id = id, project = owner, label = "")
            j.source = source
            applyBody(body, j)
            j.nextFireAt = nextFire(j)
            world.jobs.add(j)
        }
        push(mapOf("t" to "saveJob", "ok" to true, "id" to id))
        push(mapOf("t" to "jobs-changed"))
    }
    register("deleteJob") { o ->
        val id = o.string("id") ?: ""
        val source = o.string("source") ?: "global"
        val project = o.string("project") ?: ""
        world.jobs.removeAll {
            it.id == id && it.source == source && (source == "global" || it.project == project)
        }
        push(mapOf("t" to "deleteJob", "ok" to true, "id" to id))
        push(mapOf("t" to "jobs-changed"))
    }
    register("sendJobFollowup") { o ->
        val project = o.string("project") ?: return@register
        val jobId = o.string("jobId") ?: return@register
        val j = job(project, jobId)
        if (j == null || j.running) {
            push(
                jobReply(
                    "sendJobFollowup",
                    project,
                    jobId,
                    error = "The automation is already running."
                )
            )
            return@register
        }
        val at = o.long("at") ?: 0
        val message = o.string("message") ?: ""
        val parent = j.history.firstOrNull { it.at == at } ?: j.history.lastOrNull()
        push(jobReply("sendJobFollowup", project, jobId))
        startRun(
            project,
            jobId,
            question = message,
            follows = parent?.at ?: at,
            resumed = parent?.session ?: ""
        )
        push(mapOf("t" to "jobs-changed"))
    }
    register("answerJobQuestion") { o -> settleAsk(o, o.dict("answers") ?: emptyMap()) }
    register("dismissJobQuestion") { o -> settleAsk(o, null) }
}

/**
 * Answer (or, without answers, dismiss) the job's open question; an answer resumes the
 * run that asked, as the Mac does.
 */
private fun DemoServer.settleAsk(o: Dict, answers: Dict?) {
    val t = if (answers == null) "dismissJobQuestion" else "answerJobQuestion"
    val project = o.string("project") ?: ""
    val jobId = o.string("jobId") ?: ""
    val askId = o.string("askId") ?: ""
    val j = job(project, jobId)
    val r = j?.history?.indexOfFirst { run -> run.asks.any { it.string("id") == askId } } ?: -1
    val asking = if (r >= 0) j?.history?.get(r) else null
    val a = asking?.asks?.indexOfFirst { it.string("id") == askId } ?: -1
    if (j == null || asking == null || a < 0 || asking.asks[a].string("status") != "open") {
        push(
            jobReply(
                t,
                project,
                jobId,
                error = "That question isn't waiting for an answer anymore."
            )
        )
        return
    }
    val ask = asking.asks[a].toMutableMap()
    ask["status"] = if (answers == null) "dismissed" else "answered"
    ask["answeredAt"] = nowSeconds()
    if (answers != null) ask["answers"] = answers
    j.history = j.history.toMutableList().also {
        it[r] = asking.copy(asks = asking.asks.toMutableList().also { list -> list[a] = ask })
    }
    push(jobReply(t, project, jobId))
    if (answers != null) {
        startRun(
            project,
            jobId,
            question = demoAnswerText(ask, answers),
            follows = asking.at,
            resumed = asking.session,
            answerTo = askId,
            answers = answers
        )
    }
    push(mapOf("t" to "jobs-changed"))
}

/** The message the Mac resumes an agent with: each question and its answer, by label. */
private fun demoAnswerText(ask: Dict, answers: Dict): String {
    val lines = ask.dicts("questions").orEmpty().map { q ->
        val value = answers[q.string("id") ?: ""]
        val bool = value.asBool()
        val answer = when {
            bool != null -> if (bool) q.string("yes") ?: "Yes" else q.string("no") ?: "No"
            value.asStringList() != null -> value.asStringList().orEmpty().joinToString(", ")
            value is String -> value
            else -> "(no answer)"
        }
        "- ${q.string("text") ?: ""} → $answer"
    }
    return "The user answered your question:\n" + lines.joinToString("\n")
}

private fun jobReply(t: String, project: String, jobId: String, error: String? = null): Dict {
    val reply = mutableMapOf<String, Any?>(
        "t" to t,
        "project" to project,
        "jobId" to jobId,
        "ok" to (error == null)
    )
    if (error != null) reply["error"] = error
    return reply
}

// run simulation

private fun DemoServer.startRun(
    project: String,
    jobId: String,
    question: String? = null,
    follows: Long? = null,
    resumed: String = "",
    answerTo: String = "",
    answers: Dict? = null
) {
    val target = job(project, jobId) ?: return
    val startedAt = nowSeconds()
    target.running = true
    target.runningSince = startedAt
    target.liveStartedAt = startedAt
    target.liveText = ""
    target.runSeq += 1
    val seq = target.runSeq
    val script = runScript(target, question, answers)

    // A live run: the job is still the one that started it, and it wasn't stopped.
    fun liveJob(): DemoWorld.Job? = job(project, jobId)?.takeIf { it.runSeq == seq && it.running }

    for ((at, chunk) in script.steps) {
        pushAfter(at) {
            liveJob()?.let { it.liveText += chunk }
            null
        }
    }
    pushAfter(script.duration) {
        val j = liveJob() ?: return@pushAfter null
        val done = nowSeconds()
        j.running = false
        j.runningSince = null
        j.liveStartedAt = null
        j.liveText = ""
        j.lastRunAt = done
        j.lastResult = script.result
        j.nextFireAt = if (j.enabled) nextFire(j) else null
        j.history += DemoWorld.JobRun(
            at = done,
            result = script.result,
            output = script.output,
            durationSecs = maxOf(1L, done - startedAt).toInt(),
            costUsd = script.costUsd,
            question = question ?: "",
            session = script.session,
            resumed = resumed,
            follows = if (question == null) null else follows,
            answerTo = answerTo
        )
        mapOf("t" to "jobs-changed")
    }
}

internal fun DemoServer.job(project: String, jobId: String): DemoWorld.Job? =
    world.jobs.firstOrNull { it.project == project && it.id == jobId }
