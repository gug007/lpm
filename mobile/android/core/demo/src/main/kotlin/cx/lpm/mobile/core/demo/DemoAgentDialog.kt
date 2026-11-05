package cx.lpm.mobile.core.demo

// Demo handlers for the dialog a waiting agent shows (`agentDialog`) and a pick from it
// (`answerAgent` with `action: "pick"`). The storefront Claude tab ends its sample run
// asking whether to update the cart badge; answered here, it replies in the terminal
// as it does to a typed prompt.

private const val DIALOG_TERMINAL = "demo-storefront-claude"

private data class DemoDialogOption(
    val key: String,
    val label: String,
    val description: String,
    val typed: Boolean
)

private data class DemoDialog(
    val id: String,
    val question: String,
    val details: List<String>,
    val options: List<DemoDialogOption>
)

private val cartBadge = DemoDialog(
    id = "demo-cart-badge",
    question = "Update the cart badge to match the new checkout flow?",
    details = emptyList(),
    options = listOf(
        DemoDialogOption("1", "Yes, update it", "Show the step count in the badge", typed = false),
        DemoDialogOption("2", "Not now", "", typed = false),
        DemoDialogOption("3", "Type something.", "", typed = true)
    )
)

internal fun DemoServer.registerAgentDialogHandlers() {
    register("agentDialog") { o ->
        val project = o.string("project").orEmpty()
        val terminal = o.string("terminalId").orEmpty()
        val reply = mutableMapOf<String, Any?>(
            "t" to "agentDialog",
            "project" to project,
            "terminalId" to terminal,
            "dialog" to null
        )
        waitingStatus(project, terminal)?.let { waiting ->
            reply["key"] = waiting.key
            reply["ts"] = waiting.timestamp
            demoDialog(terminal, waiting.key)?.let { reply["dialog"] = it.json() }
        }
        push(reply)
    }
}

internal fun DemoServer.answerDemoDialog(o: Dict) {
    val project = o.string("project").orEmpty()
    val terminal = o.string("terminalId").orEmpty()
    val option = o.string("option").orEmpty()
    val reply = mutableMapOf<String, Any?>("t" to "answerAgent", "ok" to true)
    o["reqId"]?.let { reply["reqId"] = it }
    val waiting = waitingStatus(project, terminal)
    val shown = waiting?.let { demoDialog(terminal, it.key) }
    val error = when {
        waiting?.key != o.string("key") || waiting?.timestamp != o.long("ts") || shown == null ->
            "This prompt was already answered."

        shown.id != o.string("dialog") -> "The question changed. Check it again before answering."

        shown.options.none { it.key == option } -> "That choice isn't one the question offers."

        else -> null
    }
    if (error != null) {
        reply["ok"] = false
        reply["error"] = error
    }
    pushAfter(0.3) {
        if (reply["ok"] == true) {
            world.answeredDialogs = world.answeredDialogs + terminal
            val typed = shown?.options?.firstOrNull { it.key == option }?.typed ?: false
            if (!typed) claudeRespond(terminal)
        }
        reply
    }
}

private fun DemoServer.waitingStatus(project: String, terminal: String): DemoWorld.Status? {
    val idx = world.projectIndex(project) ?: return null
    return world.projects[idx].status.firstOrNull { it.paneID == terminal && it.value == "Waiting" }
}

private fun DemoServer.demoDialog(terminal: String, key: String): DemoDialog? {
    if (terminal != DIALOG_TERMINAL || !key.startsWith("claude_code_")) return null
    if (terminal in world.answeredDialogs) return null
    return cartBadge
}

private fun DemoDialog.json(): Dict = mapOf(
    "id" to id,
    "question" to question,
    "details" to details,
    "options" to options.map {
        mapOf(
            "key" to it.key,
            "label" to it.label,
            "description" to it.description,
            "typed" to it.typed
        )
    }
)
