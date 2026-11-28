package cx.lpm.mobile.core.demo

/*
 * Demo answers for the Talk button (iOS `DemoTalk`): a plan read off the sentence's own
 * words, with no AI behind it, and a run that makes the copy and opens the agent's tab
 * the way `duplicate` and `newTerminal` do.
 */

internal fun DemoServer.registerTalkHandlers() {
    register("talkPlan") { o ->
        val text = o.string("text").orEmpty().trimmingWhitespacesAndNewlines()
        val words = text.lowercase()
        var reply = mapOf(
            "t" to "talkPlan",
            "reqId" to o["reqId"],
            "ok" to false,
            "unsupported" to false
        )
        if (text.isEmpty()) {
            reply = reply + ("error" to "Say or type what to do first.")
        } else if (words.contains("delete")) {
            reply = reply + mapOf(
                "unsupported" to true,
                "error" to
                    "A plan can only duplicate a project, start an agent and send it a prompt."
            )
        } else {
            val place = when {
                words.contains("worktree") -> "worktree"
                words.contains("duplicate") || words.contains("copy") -> "copy"
                else -> "here"
            }
            val agent = when {
                words.contains("codex") -> "codex"
                words.contains("gemini") -> "gemini"
                else -> "claude"
            }
            val project = world.projects
                .firstOrNull { words.contains(it.name.lowercase()) }?.name.orEmpty()
            val originals = world.projects.filter { it.parentName.isEmpty() }.map { it.name }
            reply = mapOf(
                "t" to "talkPlan",
                "reqId" to o["reqId"],
                "ok" to true,
                "plan" to mapOf(
                    "project" to project,
                    "where" to place,
                    "agent" to agent,
                    "prompt" to text,
                    "label" to if (place == "here") "" else "talk"
                ),
                "candidates" to if (project.isEmpty()) originals.take(2) else emptyList()
            )
        }
        pushAfter(1.2, reply)
    }
    register("talkRun") { o ->
        val plan = o.dict("plan") ?: emptyMap()
        val project = plan.string("project").orEmpty()
        val place = plan.string("where").orEmpty()
        val tab = mapOf(
            "agent" to plan.string("agent").orEmpty(),
            "prompt" to plan.string("prompt").orEmpty().trimmingWhitespacesAndNewlines()
        )
        val reply = mapOf("t" to "talkRun", "reqId" to o["reqId"])
        val refusal = talkRefusal(project, tab)
        if (refusal != null) {
            push(reply + mapOf("ok" to false, "error" to refusal))
            return@register
        }
        push(reply + ("ok" to true))
        if (place != "copy" && place != "worktree") {
            openTalkTab(tab, project)
            return@register
        }
        val label = plan.string("label").orEmpty().trimmingWhitespacesAndNewlines()
        after(0.7) {
            val copy = duplicateName(project, label)
            createDuplicate(
                source = project,
                copyName = copy,
                label = label,
                excludeUncommitted = world.duplicateExcludeUncommitted,
                pullLatest = world.duplicatePullLatest,
                groupName = null,
                runCmd = ""
            )
            val index = world.projectIndex(copy) ?: return@after
            world.projects[index].worktree = place == "worktree"
            push(mapOf("t" to "projects-changed"))
            openTalkTab(tab, copy)
        }
    }
}

/** Why the demo Mac won't run a plan, null when it will. */
private fun DemoServer.talkRefusal(project: String, tab: Dict): String? {
    if (world.project(project) == null) return "That project isn't available."
    if (tab.string("prompt") == "") return "There's no prompt to send."
    val offered = demoAgentOptions.any { it.string("id") == tab.string("agent") }
    return if (offered) null else "That agent isn't available on this Mac."
}

private fun DemoServer.openTalkTab(tab: Dict, project: String) {
    demoOpenTab(tab, project)
    push(world.terminalsPayload(project))
}
