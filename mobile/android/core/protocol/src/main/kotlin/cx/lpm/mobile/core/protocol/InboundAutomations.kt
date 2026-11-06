package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AutomationHistoryEntry
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.model.AutomationLiveOutput
import cx.lpm.mobile.core.model.AutomationMachine
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.obj

internal val automationParsers = parsers {
    put("jobs") { o ->
        Inbound.Jobs(
            jobs = if (o.ok) o.list("jobs", AutomationJob::parse) else emptyList(),
            error = o.failure("Couldn't load automations."),
            machines = o.list("machines", AutomationMachine::parse)
        )
    }
    put("jobHistory") { o ->
        Inbound.JobHistory(
            project = o.str("project"),
            jobId = o.str("jobId"),
            entries = if (o.ok) o.list("entries", AutomationHistoryEntry::parse) else emptyList(),
            error = o.failure("Couldn't load run history.")
        )
    }
    put("jobLiveOutput") { o ->
        Inbound.JobLiveOutput(
            project = o.str("project"),
            jobId = o.str("jobId"),
            live = if (o.ok) AutomationLiveOutput.parse(o.obj("live")) else null,
            error = o.failure("Couldn't load live output.")
        )
    }
    for (t in listOf("runJob", "stopJob", "takeOverJob", "setJobEnabled")) {
        put(t) { o ->
            Inbound.AutomationMutation(
                project = o.str("project"),
                jobId = o.str("jobId"),
                error = o.failure("Couldn't update the automation.")
            )
        }
    }
    put("sendJobFollowup") { o ->
        Inbound.AutomationFollowup(
            project = o.str("project"),
            jobId = o.str("jobId"),
            error = o.failure("Couldn't send the message.")
        )
    }
    for (t in listOf("answerJobQuestion", "dismissJobQuestion")) {
        put(t) { o ->
            Inbound.AutomationAnswer(
                project = o.str("project"),
                jobId = o.str("jobId"),
                error = o.failure("Couldn't send the answer.")
            )
        }
    }
    put("jobConfig") { o ->
        Inbound.JobConfig(
            project = o.str("project"),
            jobId = o.str("jobId"),
            job = if (o.ok) o.obj("job") else null,
            error = o.failure("Couldn't load the automation.")
        )
    }
    put("saveJob") { o ->
        Inbound.JobSaved(id = o.str("id"), error = o.failure("Couldn't save the automation."))
    }
    put("deleteJob") { o ->
        Inbound.JobDeleted(id = o.str("id"), error = o.failure("Couldn't delete the automation."))
    }
    put("jobs-changed") { Inbound.JobsChanged }
}
