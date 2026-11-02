package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentLaunch
import kotlinx.serialization.json.put

/** Terminals, actions, background runs, uploads and file previews. */
sealed interface WireTerminals {
    fun terminals(project: String): String = frame("terminals") { put("project", project) }

    /**
     * Subscribe to a terminal's output. `from` is the byte-stream offset this phone
     * already applied: the Mac then replies with just the slice missed since
     * (keeping the screen as-is) instead of a full screen replay.
     */
    fun sub(id: String, from: Long? = null): String = frame("sub") {
        put("id", id)
        if (from != null) put("from", from)
    }

    fun unsub(id: String): String = frame("unsub") { put("id", id) }

    /** Take control of a terminal shown live elsewhere (the "Take control" button). */
    fun claim(id: String): String = frame("claim") { put("id", id) }

    fun input(id: String, data: String): String = frame("in") {
        put("id", id)
        put("d", data)
    }

    fun resize(id: String, cols: Int, rows: Int): String = frame("resize") {
        put("id", id)
        put("cols", cols)
        put("rows", rows)
    }

    /**
     * A launch with an agent only for a Mac whose `features` has "agentLaunch"; without
     * one it's the plain shell every Mac opens.
     */
    fun newTerminal(project: String, launch: AgentLaunch = AgentLaunch()): String =
        frame("newTerminal") {
            put("project", project)
            if (launch.agent.isNotEmpty()) {
                put("agent", launch.agent)
                putNonEmpty("model", launch.model)
                putNonEmpty("effort", launch.effort)
                putNonEmpty("prompt", launch.prompt)
            }
        }

    fun agentOptions(): String = frame("agentOptions")

    fun agentSessions(project: String, search: String, limit: Int): String =
        frame("agentSessions") {
            put("project", project)
            put("search", search)
            put("limit", limit)
        }

    fun resumeSession(project: String, provider: String, sessionId: String, title: String): String =
        frame("resumeSession") {
            put("project", project)
            put("provider", provider)
            put("sessionId", sessionId)
            put("title", title)
        }

    fun listDir(project: String, dir: String): String = frame("listDir") {
        put("project", project)
        put("dir", dir)
    }

    fun closeTerminal(project: String, id: String): String = frame("closeTerminal") {
        put("project", project)
        put("id", id)
    }

    fun renameTerminal(project: String, id: String, label: String): String =
        frame("renameTerminal") {
            put("project", project)
            put("id", id)
            put("label", label)
        }

    fun pinTerminal(project: String, id: String): String = frame("pinTerminal") {
        put("project", project)
        put("id", id)
    }

    /** Runs an ended terminal again in its tab. Only for a Mac whose `features` has "restartTerminal". */
    fun restartTerminal(project: String, id: String): String = frame("restartTerminal") {
        put("project", project)
        put("id", id)
    }

    /** The tab menu's fork / title / close-others. Only for a Mac whose `features` has "tabMenu". */
    fun forkTerminal(project: String, id: String): String = frame("forkTerminal") {
        put("project", project)
        put("id", id)
    }

    fun forkTerminalCopy(project: String, id: String): String = frame("forkTerminalCopy") {
        put("project", project)
        put("id", id)
    }

    fun titleTerminal(project: String, id: String): String = frame("titleTerminal") {
        put("project", project)
        put("id", id)
    }

    fun closeOtherTerminals(project: String, id: String): String = frame("closeOtherTerminals") {
        put("project", project)
        put("id", id)
    }

    /** Continue a Claude tab's conversation on another account; only when `features` has "tabAccount". */
    fun switchTerminalAccount(project: String, id: String, account: String): String =
        frame("switchTerminalAccount") {
            put("project", project)
            put("id", id)
            put("account", account)
        }

    fun reorderTerminals(project: String, order: List<String>): String = frame("reorderTerminals") {
        put("project", project)
        putStrings("order", order)
    }

    /** [prompt] only for a Mac with "actionPrompt": the first prompt for the agent the action opens. */
    fun runAction(
        project: String,
        action: String,
        inputValues: Map<String, String> = emptyMap(),
        confirmed: Boolean = false,
        prompt: String = ""
    ): String = frame("runAction") {
        put("project", project)
        put("action", action)
        putStringMap("inputValues", inputValues)
        put("confirmed", confirmed)
        putNonEmpty("prompt", prompt)
    }

    fun runActionBackground(
        project: String,
        action: String,
        inputValues: Map<String, String>,
        runId: String
    ): String = frame("runActionBackground") {
        put("project", project)
        put("action", action)
        putStringMap("inputValues", inputValues)
        put("runId", runId)
    }

    fun actionBgOutput(project: String, runId: String): String = frame("actionBgOutput") {
        put("project", project)
        put("runId", runId)
    }

    fun cancelActionBackground(runId: String): String = frame("cancelActionBackground") {
        put("runId", runId)
    }

    fun backgroundRuns(project: String): String = frame("backgroundRuns") {
        put("project", project)
    }

    /**
     * An upload carrying a per-upload `reqId` the server echoes back, so the phone
     * matches each reply to its chip independent of order. `name` saves the blob
     * under its original basename (files).
     */
    fun upload(id: String, data: String, mime: String, name: String?, reqId: String): String =
        frame("upload") {
            put("id", id)
            put("data", data)
            put("mime", mime)
            put("reqId", reqId)
            putNonEmpty("name", name)
        }

    /**
     * The chunked attach, for a Mac whose `features` has "fileUpload": begin with the
     * name and size, send each piece at its offset after the last one is
     * acknowledged, then `uploadDone` answers with the path to paste.
     */
    fun uploadBegin(id: String, name: String, bytes: Long, reqId: String): String =
        frame("uploadBegin") {
            put("id", id)
            put("name", name)
            put("bytes", bytes)
            put("reqId", reqId)
        }

    fun uploadChunk(
        id: String,
        uploadId: String,
        offset: Long,
        data: String,
        reqId: String
    ): String = frame("uploadChunk") {
        put("id", id)
        put("uploadId", uploadId)
        put("offset", offset)
        put("b64", data)
        put("reqId", reqId)
    }

    fun uploadDone(id: String, uploadId: String, reqId: String): String = frame("uploadDone") {
        put("id", id)
        put("uploadId", uploadId)
        put("reqId", reqId)
    }

    /** No `reqId`: the Mac answers an abort with nothing. */
    fun uploadAbort(id: String, uploadId: String): String = frame("uploadAbort") {
        put("id", id)
        put("uploadId", uploadId)
    }

    /**
     * One byte range of any file for the preview sheet. A relative `path` resolves
     * against `project`'s root; `reqId` routes the reply to its fetch.
     */
    fun fileChunk(
        reqId: String,
        project: String,
        path: String,
        offset: Long,
        length: Long
    ): String = frame("fileChunk") {
        put("reqId", reqId)
        put("project", project)
        put("path", path)
        put("offset", offset)
        put("length", length)
    }
}
