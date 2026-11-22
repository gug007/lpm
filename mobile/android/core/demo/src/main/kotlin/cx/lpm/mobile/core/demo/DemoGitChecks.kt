package cx.lpm.mobile.core.demo

/*
 * Demo CI (iOS `DemoGitChecks`): storefront's open pull request with one failing test,
 * api-gateway's main passing, the rest without CI. Running the failed jobs again shows
 * them running for a few seconds, then passing, and the pull request ready to merge;
 * merging it leaves storefront without CI. Keep fixing until green plays two rounds over
 * 28 seconds and ends with the checks passing.
 */

private const val RERUN_MS = 6_000L

internal fun DemoServer.registerGitChecksHandlers() {
    register("gitChecks") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(0.3) { demoChecksReply(project) }
    }
    register("gitChecksRerun") { o ->
        val project = o.string("project") ?: return@register
        world.ciRerunAt[project] = clock.millis()
        pushAfter(0.4) { mapOf("t" to "gitChecksRerun", "project" to project, "ok" to true) }
    }
    register("ciFixLoop") { o ->
        val project = o.string("project") ?: return@register
        if (o.bool("on") == true) {
            startDemoFixLoop(project, o.string("agent").orEmpty())
        } else {
            world.ciFixLoops[project]?.let { it.cancelledAt = clock.millis() }
            push(
                mapOf(
                    "t" to "ciFixLoop",
                    "project" to project,
                    "ok" to true,
                    "loop" to demoFixLoop(project)
                )
            )
        }
    }
    register("gitMergePr") { o ->
        val project = o.string("project") ?: return@register
        val number = o.int("number") ?: 0
        val deleteBranch = o.bool("deleteBranch") ?: false
        pushAfter(1.2) {
            world.ciMerged += project
            mapOf(
                "t" to "gitMergePr",
                "project" to project,
                "ok" to true,
                "number" to number,
                "deletedBranch" to deleteBranch
            )
        }
    }
}

private fun DemoServer.startDemoFixLoop(project: String, agent: String) {
    val id = world.ciFixLoopNextId++
    world.ciFixLoops[project] = DemoFixLoop(id, agent.ifEmpty { "The agent" }, clock.millis())
    DemoFixLoop.steps.forEachIndexed { index, step ->
        pushAfter(if (index == 0) 0.2 else step.at + 0.05) {
            val run = world.ciFixLoops[project]
            if (run == null || run.id != id || run.cancelledAt != null) return@pushAfter null
            mapOf(
                "t" to "ciFixLoop",
                "project" to project,
                "ok" to true,
                "loop" to demoFixLoop(project)
            )
        }
    }
}

/** The project's loop as the Mac would say it now, or null with none. */
private fun DemoServer.demoFixLoop(project: String): Dict? {
    val run = world.ciFixLoops[project] ?: return null
    val step = run.step(clock.millis())
    val detail = when (step.state) {
        "starting" -> "Opening the ${run.agent} tab…"
        "fixing" -> "${run.agent} is fixing ${step.sha}"
        "watching" -> "${run.agent} pushed ${step.sha} · watching the new run"
        "passed" -> "CI passed after 2 rounds"
        else -> "Stopped"
    }
    return mapOf(
        "project" to project,
        "agent" to run.agent,
        "branch" to world.git[project]?.branch.orEmpty(),
        "round" to step.round,
        "maxRounds" to 3,
        "state" to step.state,
        "sha" to step.sha,
        "detail" to detail,
        "progress" to step.progress
    )
}

private fun DemoServer.demoChecksReply(project: String): Dict {
    val reply = mutableMapOf<String, Any?>(
        "t" to "gitChecks",
        "project" to project,
        "ok" to true,
        "branch" to world.git[project]?.branch.orEmpty(),
        "pr" to null,
        "commit" to null
    )
    when {
        project == "storefront" && project !in world.ciMerged -> {
            val since = world.ciRerunAt[project]?.let { clock.millis() - it }
            val loop = world.ciFixLoops[project]?.step(clock.millis())?.state
            val testState = when (loop) {
                "passed" -> "pass"
                "watching" -> "pending"
                else -> since?.let { if (it < RERUN_MS) "pending" else "pass" } ?: "fail"
            }
            val checks = listOf(
                mapOf(
                    "name" to "test (ubuntu-latest)",
                    "workflow" to "CI",
                    "state" to testState,
                    "url" to "https://github.com/example/storefront/actions/runs/7001/job/1"
                ),
                mapOf(
                    "name" to "lint",
                    "workflow" to "CI",
                    "state" to "pass",
                    "url" to "https://github.com/example/storefront/actions/runs/7001/job/2"
                ),
                mapOf(
                    "name" to "build",
                    "workflow" to "CI",
                    "state" to "pass",
                    "url" to "https://github.com/example/storefront/actions/runs/7001/job/3"
                ),
                mapOf(
                    "name" to "Vercel",
                    "workflow" to "",
                    "state" to "pass",
                    "url" to "https://vercel.com/example/storefront"
                )
            )
            reply["pr"] = mapOf(
                "number" to 42,
                "url" to "https://github.com/example/storefront/pull/42",
                "title" to "Two-step checkout flow",
                "isDraft" to false,
                "checks" to checks,
                "merge" to mapOf(
                    "mergeable" to "MERGEABLE",
                    "state" to (if (testState == "pass") "CLEAN" else "UNSTABLE"),
                    "review" to "APPROVED",
                    "head" to "4b8e2f1c9d0a7e3b5f6c8d2a1e0b9c7f3d5a6e84",
                    "methods" to listOf("merge", "squash", "rebase"),
                    "deletesBranch" to false
                )
            )
            if (testState == "fail") {
                reply["fixPrompt"] = listOf(
                    "CI checks are failing on pull request #42 (https://github.com/example/storefront/pull/42):",
                    "- test (ubuntu-latest) — https://github.com/example/storefront/actions/runs/7001/job/1",
                    "",
                    "Find out why with `gh pr checks 42` and `gh run view 7001 --log-failed`, " +
                        "fix the cause, and run the same checks locally where you can to confirm " +
                        "the fix."
                ).joinToString("\n")
                reply["fixLoopPrompt"] = reply["fixPrompt"] as String + "\n\nWhen it's fixed, " +
                    "commit and push. lpm is watching CI on this branch and will send you any " +
                    "check that still fails (round 1 of 3)."
            }
        }

        project == "api-gateway" -> reply["commit"] = mapOf(
            "sha" to "9e7d031b4c2a8f6e1d0c3b5a7f9e2d4c6b8a0f13",
            "title" to "Rate limit the token endpoint",
            "url" to
                "https://github.com/example/api-gateway/commit/9e7d031b4c2a8f6e1d0c3b5a7f9e2d4c6b8a0f13",
            "checks" to listOf(
                mapOf(
                    "name" to "test",
                    "workflow" to "CI",
                    "state" to "pass",
                    "url" to "https://github.com/example/api-gateway/actions/runs/8120/job/1"
                ),
                mapOf(
                    "name" to "deploy-preview",
                    "workflow" to "Deploy",
                    "state" to "pass",
                    "url" to "https://github.com/example/api-gateway/actions/runs/8121/job/1",
                    "commit" to "4f1c2ab"
                )
            )
        )
    }
    demoFixLoop(project)?.let { reply["fixLoop"] = it }
    return reply
}

/** A demo Keep fixing until green run (iOS `DemoFixLoop`): two rounds, then green. */
internal class DemoFixLoop(val id: Int, val agent: String, val startedAt: Long) {
    var cancelledAt: Long? = null

    data class Step(
        val at: Double,
        val state: String,
        val round: Int,
        val sha: String,
        val progress: Double
    )

    fun step(now: Long): Step {
        val elapsed = ((cancelledAt ?: now) - startedAt) / 1000.0
        val reached = steps.lastOrNull { it.at <= elapsed } ?: steps.first()
        if (cancelledAt == null || reached.state == "passed") return reached
        return Step(elapsed, "cancelled", reached.round, reached.sha, 1.0)
    }

    companion object {
        val steps = listOf(
            Step(0.0, "starting", 1, "4b8e2f1", 0.0),
            Step(2.0, "fixing", 1, "4b8e2f1", 1.0 / 9),
            Step(9.0, "watching", 1, "7c41e2a", 2.0 / 9),
            Step(18.0, "fixing", 2, "7c41e2a", 4.0 / 9),
            Step(22.0, "watching", 2, "9a3d0be", 5.0 / 9),
            Step(28.0, "passed", 2, "9a3d0be", 1.0)
        )
    }
}
