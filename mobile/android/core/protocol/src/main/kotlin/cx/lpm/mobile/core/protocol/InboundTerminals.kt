package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ActionBgOutput
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.AgentSessionsPage
import cx.lpm.mobile.core.model.BackgroundRunSummary
import cx.lpm.mobile.core.model.ControlOwner
import cx.lpm.mobile.core.model.DictationEvent
import cx.lpm.mobile.core.model.FileChunk
import cx.lpm.mobile.core.model.ProjectDirContents
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.UploadStep
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.reqIdString
import cx.lpm.mobile.core.model.string

internal val terminalParsers = parsers {
    put("terminals") { o ->
        Inbound.Terminals(
            project = o.str("project"),
            terminals = o.list("terminals", TerminalInfo::parse)
        )
    }
    put("seed") { o ->
        val draft = o.obj("draft")
        Inbound.Seed(
            id = o.str("id"),
            cols = o.int("cols") ?: 80,
            rows = o.int("rows") ?: 24,
            data = o.str("data"),
            owner = ControlOwner.parse(o["owner"]),
            draftText = draft?.string("text"),
            draftRev = draft?.int("rev") ?: 0,
            off = o.long("off"),
            reset = o.bool("reset") ?: true
        )
    }
    put("control") { o ->
        Inbound.Control(id = o.str("id"), owner = ControlOwner.parse(o["owner"]))
    }
    put("o") { o -> Inbound.Output(id = o.str("id"), data = o.str("d"), off = o.long("off")) }
    put("exit") { o ->
        Inbound.Exit(id = o.str("id"), code = o.int("code") ?: 0, gone = o.bool("gone") ?: false)
    }
    // Success acks carry nothing anything acts on, so they parse to null.
    for (t in listOf("runAction", "newTerminal", "resumeSession")) {
        put(t) { o ->
            if (o.bool("ok") ?: true) {
                null
            } else {
                Inbound.ActionFailed(
                    project = o.str("project"),
                    error = o.string("error") ?: "Couldn't reach the lpm app on your Mac."
                )
            }
        }
    }
    put("agentOptions") { o -> Inbound.AgentOptions(o.list("agents", AgentOption::parse)) }
    put("agentSessions") { o -> Inbound.AgentSessions(AgentSessionsPage.parse(o)) }
    put("listDir") { o -> Inbound.ListDir(ProjectDirContents.parse(o)) }
    put("actionBgOutput") { o ->
        val found = o.bool("found") ?: false
        Inbound.ActionBgOutput(
            runId = o.str("runId"),
            snapshot = if (found) ActionBgOutput.parse(o) else null
        )
    }
    put("runActionBackground") { o ->
        if (o.bool("ok") ?: true) {
            null
        } else {
            Inbound.ActionBgStartFailed(
                runId = o.str("runId"),
                error = o.string("error") ?: "Couldn't start the action."
            )
        }
    }
    put("backgroundRuns") { o ->
        Inbound.BackgroundRuns(
            project = o.str("project"),
            runs = o.list("runs", BackgroundRunSummary::parse)
        )
    }
    put("upload") { o ->
        Inbound.Upload(
            id = o.str("id"),
            reqId = o["reqId"].reqIdString(),
            path = if (o.ok) o.str("path") else ""
        )
    }
    for (t in listOf("uploadBegin", "uploadChunk", "uploadDone")) {
        put(t) { o -> Inbound.UploadStep(UploadStep.parse(o)) }
    }
    put("dictation") { o -> Inbound.Dictation(DictationEvent.parse(o)) }
    put("fileChunk") { o -> Inbound.FileChunk(FileChunk.parse(o)) }
}
