package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put

/** Automations (the Mac's scheduled jobs): listing, history, runs and editing. */
sealed interface WireAutomations {
    fun jobs(): String = frame("jobs")

    fun jobHistory(project: String, jobId: String): String = frame("jobHistory") {
        putJob(project, jobId)
    }

    fun jobLiveOutput(project: String, jobId: String): String = frame("jobLiveOutput") {
        putJob(project, jobId)
    }

    fun runJob(project: String, jobId: String): String = frame("runJob") { putJob(project, jobId) }

    fun stopJob(project: String, jobId: String): String = frame("stopJob") {
        putJob(project, jobId)
    }

    fun takeOverJob(project: String, jobId: String): String = frame("takeOverJob") {
        putJob(project, jobId)
    }

    fun setJobEnabled(project: String, jobId: String, enabled: Boolean): String =
        frame("setJobEnabled") {
            putJob(project, jobId)
            put("enabled", enabled)
        }

    /**
     * `at` reads the run the user opened and everything under it; without one, the
     * whole automation is read.
     */
    fun markJobSeen(project: String, jobId: String, at: Long?): String = frame("markJobSeen") {
        putJob(project, jobId)
        if (at != null) put("at", at)
    }

    fun markAllJobsSeen(): String = frame("markAllJobsSeen")

    fun sendJobFollowup(
        project: String,
        jobId: String,
        at: Long,
        message: String,
        agent: String,
        model: String,
        effort: String
    ): String = frame("sendJobFollowup") {
        putJob(project, jobId)
        put("at", at)
        put("message", message)
        put("agent", agent)
        put("model", model)
        put("effort", effort)
    }

    fun answerJobQuestion(
        project: String,
        jobId: String,
        askId: String,
        answers: JsonObject
    ): String = frame("answerJobQuestion") {
        putJob(project, jobId)
        put("askId", askId)
        put("answers", answers)
    }

    fun dismissJobQuestion(project: String, jobId: String, askId: String): String =
        frame("dismissJobQuestion") {
            putJob(project, jobId)
            put("askId", askId)
        }

    fun jobConfig(project: String, jobId: String, source: String): String = frame("jobConfig") {
        putJob(project, jobId)
        put("source", source)
    }

    fun saveJob(id: String, source: String, project: String, job: JsonObject): String =
        frame("saveJob") {
            put("id", id)
            put("source", source)
            put("project", project)
            put("job", job)
        }

    fun deleteJob(id: String, source: String, project: String, deleteCopies: Boolean): String =
        frame("deleteJob") {
            put("id", id)
            put("source", source)
            put("project", project)
            put("deleteCopies", deleteCopies)
        }
}

private fun JsonObjectBuilder.putJob(project: String, jobId: String) {
    put("project", project)
    put("jobId", jobId)
}
