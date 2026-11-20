package cx.lpm.mobile.core.demo

// Demo handlers for `actionPopup` and `actionApp`: api-gateway's Stars action shows
// the repo's GitHub stars month by month, and its Releases action the latest
// releases with a button that runs Release (`lpm.run`), each drawn by its sample page
// in mobile/shared/demo, which lays itself out larger as the app.

internal fun DemoServer.registerActionPopupHandlers() {
    registerActionPage("actionPopup", "popup", "popup")
    registerActionPage("actionApp", "app", "mini app")
}

private fun DemoServer.registerActionPage(type: String, key: String, noun: String) {
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
            reply["error"] = "This action has no $noun."
            push(reply)
            return@register
        }
        val releases = name == "releases"
        reply["ok"] = true
        reply[key] = mapOf(
            "refresh" to 0,
            "html" to if (releases) demoReleasesPage else demoStarsPage,
            "data" to if (releases) demoReleases else demoStars,
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

private val demoReleases: Dict = mapOf(
    "next" to "v2.4.2",
    "releases" to listOf(
        mapOf("tag" to "v2.4.1", "notes" to "Rate limits per route", "age" to "3d ago"),
        mapOf("tag" to "v2.4.0", "notes" to "gRPC upstreams", "age" to "2w ago"),
        mapOf("tag" to "v2.3.2", "notes" to "Fix header casing on retries", "age" to "1mo ago")
    )
)

private val demoStarsPage: String by lazy { demoPage("popup-stars") }
private val demoReleasesPage: String by lazy { demoPage("popup-releases") }

/** A sample page, the same file the iOS demo bundles (mobile/shared/demo). */
private fun demoPage(name: String): String =
    DemoServer::class.java.getResourceAsStream("/$name.html")
        ?.use { it.readBytes().toString(Charsets.UTF_8) }
        .orEmpty()
