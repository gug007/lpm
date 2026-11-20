package cx.lpm.mobile.core.demo

// Demo handlers for `actionPopup` and `actionApp`: api-gateway's Stars action shows
// the repo's GitHub stars month by month, drawn by the sample page in
// mobile/shared/demo, which lays itself out larger as the app.

internal fun DemoServer.registerActionPopupHandlers() {
    registerActionPage("actionPopup", "popup")
    registerActionPage("actionApp", "app")
}

private fun DemoServer.registerActionPage(type: String, key: String) {
    register(type) { o ->
        val project = o.string("project").orEmpty()
        val name = o.string("action").orEmpty()
        val reply = mutableMapOf<String, Any?>(
            "t" to type,
            "project" to project,
            "action" to name
        )
        val idx = world.projectIndex(project)
        if (idx == null) {
            reply["ok"] = false
            reply["error"] = "Couldn't find the project."
            push(reply)
            return@register
        }
        val page = world.projects[idx].actions.firstOrNull {
            it.string("name") == name
        }?.dict(key)
        if (page == null) {
            reply["ok"] = false
            reply["error"] = "This action has no $key."
            push(reply)
            return@register
        }
        reply["ok"] = true
        reply[key] = mapOf(
            "refresh" to 0,
            "html" to demoPopupPage,
            "data" to demoStars,
            "updatedAt" to nowMillis(),
            "stale" to false
        )
        pushAfter(0.4, reply)
    }
}

private val demoStars: Dict = mapOf(
    "total" to 1396,
    "months" to listOf(
        mapOf("label" to "Jun", "stars" to 64),
        mapOf("label" to "Jul", "stars" to 98),
        mapOf("label" to "Aug", "stars" to 131),
        mapOf("label" to "Sep", "stars" to 156),
        mapOf("label" to "Oct", "stars" to 189),
        mapOf("label" to "Nov", "stars" to 212)
    )
)

/** The sample page, the same file the iOS demo bundles (mobile/shared/demo). */
private val demoPopupPage: String by lazy {
    DemoServer::class.java.getResourceAsStream("/popup-stars.html")
        ?.use { it.readBytes().toString(Charsets.UTF_8) }
        .orEmpty()
}
