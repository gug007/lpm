package cx.lpm.mobile.core.demo

/*
 * Demo CI (iOS `DemoGitChecks`): storefront's open pull request with one failing test,
 * api-gateway's main passing, the rest without CI. Running the failed jobs again shows
 * them running for a few seconds, then passing, and the pull request ready to merge;
 * merging it leaves storefront without CI.
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
            val testState = since?.let { if (it < RERUN_MS) "pending" else "pass" } ?: "fail"
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
    return reply
}
