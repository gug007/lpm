package cx.lpm.mobile.core.demo

/*
 * Demo answers for the review's extras (iOS `DemoGitExtras`): a clean look for
 * secrets, storefront's branch with the two commits it made since main, the review on
 * its pull request, the failing test's log, and saving an edit into the demo's files.
 */

private const val REVIEW_URL = "https://github.com/example/storefront/pull/42"
private const val TEST_JOB_URL = "https://github.com/example/storefront/actions/runs/7001/job/1"

internal fun DemoServer.registerGitExtrasHandlers() {
    register("gitScanSecrets") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(
            0.6,
            mapOf(
                "t" to "gitScanSecrets",
                "project" to project,
                "ok" to true,
                "findings" to emptyList<Any>()
            )
        )
    }
    register("gitBranchFiles") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(0.3) { demoBranchFiles(project) }
    }
    register("gitBranchDiffs") { o ->
        val project = o.string("project") ?: return@register
        val paths = o.strings("paths").orEmpty()
        pushAfter(0.2) {
            val files = demoBranchCommits(project).files
            val entries = paths.map { path ->
                val file = files.firstOrNull { it.path == path }
                    ?: return@map mapOf("path" to path, "error" to "$path isn't on this branch.")
                mapOf(
                    "path" to path,
                    "diff" to demoPatch(file),
                    "binary" to false,
                    "truncated" to false
                )
            }
            mapOf("t" to "gitBranchDiffs", "project" to project, "ok" to true, "files" to entries)
        }
    }
    register("gitPrDiscussion") { o ->
        val project = o.string("project") ?: return@register
        val open = project == "storefront" && project !in world.ciMerged
        pushAfter(
            0.4,
            mapOf(
                "t" to "gitPrDiscussion",
                "project" to project,
                "ok" to true,
                "discussion" to if (open) demoDiscussion else null
            ) + if (open) mapOf("prompt" to DEMO_REVIEW_PROMPT) else emptyMap()
        )
    }
    register("gitCheckLog") { o ->
        val project = o.string("project") ?: return@register
        val url = o.string("url").orEmpty()
        val result = if (url == TEST_JOB_URL) {
            mapOf("ok" to true, "step" to "Run tests", "lines" to demoTestLog, "more" to false)
        } else {
            mapOf(
                "ok" to false,
                "error" to "This check's log isn't on GitHub Actions. Open it to see what failed."
            )
        }
        pushAfter(0.5, mapOf("t" to "gitCheckLog", "project" to project, "url" to url) + result)
    }
    register("writeFile") { o ->
        val project = o.string("project") ?: return@register
        val path = o.string("path") ?: return@register
        val content = o.string("content").orEmpty()
        val current = demoFileText(project, path).toByteArray()
        val reply = mapOf(
            "t" to "writeFile",
            "project" to project,
            "path" to path,
            "reqId" to o["reqId"]
        )
        val result = if (sha256(current) == o.string("base")) {
            world.fileEdits["$project\n$path"] = content
            val saved = content.toByteArray()
            mapOf("ok" to true, "size" to saved.size, "mtime" to 2, "sha256" to sha256(saved))
        } else {
            mapOf(
                "ok" to false,
                "changed" to true,
                "error" to
                    "${path.substringAfterLast('/')} changed on your Mac since you opened it. " +
                    "Open it again to see the new version."
            )
        }
        pushAfter(0.3, reply + result)
    }
}

private class BranchCommits(
    val base: String,
    val range: String,
    val commits: Int,
    val files: List<DemoCommitFile>
)

/**
 * The commits a project's branch made on its own, and the files they changed:
 * storefront's feature branch since main, any other branch's unpushed ones.
 */
private fun DemoServer.demoBranchCommits(project: String): BranchCommits {
    val none = BranchCommits("", "", 0, emptyList())
    val repo = world.git[project] ?: return none
    val since = repo.branch != repo.defaultBranch
    val log = if (project == "storefront") storefrontLog else otherLog
    val count = if (since) (if (repo.branch == "feat/checkout-redesign") 2 else 0) else repo.ahead
    if (!since && !repo.hasUpstream) return none
    val files = mutableListOf<DemoCommitFile>()
    for (commit in log.take(count).reversed()) {
        for (file in commit.files) {
            files.removeAll { it.path == file.path }
            files += file
        }
    }
    files.sortBy { it.path }
    return BranchCommits(
        base = if (since) repo.defaultBranch else "origin/${repo.branch}",
        range = if (since) "since" else "unpushed",
        commits = count,
        files = files
    )
}

private fun DemoServer.demoBranchFiles(project: String): Dict {
    val branch = demoBranchCommits(project)
    return mapOf(
        "t" to "gitBranchFiles",
        "project" to project,
        "ok" to true,
        "base" to branch.base,
        "range" to branch.range,
        "commits" to branch.commits,
        "files" to
            branch.files.map { mapOf("path" to it.path, "status" to it.status, "staged" to false) }
    )
}

private fun note(
    kind: String,
    body: String,
    state: String,
    path: String,
    line: Int?,
    createdAt: String,
    author: String = "samlee"
) = mapOf(
    "kind" to kind,
    "author" to author,
    "body" to body,
    "state" to state,
    "path" to path,
    "line" to line,
    "createdAt" to createdAt
)

private val demoNotes = listOf(
    note(
        "review",
        "A couple of things before this goes in.",
        "COMMENTED",
        "",
        null,
        "2026-11-18T09:12:00Z"
    ),
    note(
        "line",
        "Disable the button while the payment intent is being created, or a double tap charges twice.",
        "",
        "components/CheckoutForm.tsx",
        42,
        "2026-11-18T09:12:01Z"
    ),
    note(
        "line",
        "This swallows the error. Return it so the form can show it.",
        "",
        "lib/payments.ts",
        18,
        "2026-11-18T09:12:02Z"
    ),
    note(
        "comment",
        "Can the old one-page flow stay behind a flag for a week?",
        "",
        "",
        null,
        "2026-11-18T10:40:00Z",
        author = "priyan"
    ),
    note("review", "", "APPROVED", "", null, "2026-11-18T11:05:00Z")
)

private val demoDiscussion = mapOf(
    "number" to 42,
    "title" to "Two-step checkout flow",
    "url" to REVIEW_URL,
    "body" to "Splits checkout into an address step and a payment step.",
    "notes" to demoNotes
)

private val DEMO_REVIEW_PROMPT = """
    Address the review on pull request #42 ($REVIEW_URL).

    Pull request #42:
    ```
    #42 Two-step checkout flow
    $REVIEW_URL

    Splits checkout into an address step and a payment step.

    Discussion:
    - samlee commented: A couple of things before this goes in.
    - samlee on components/CheckoutForm.tsx:42: Disable the button while the payment intent is being created, or a double tap charges twice.
    - samlee on lib/payments.ts:18: This swallows the error. Return it so the form can show it.
    - priyan: Can the old one-page flow stay behind a flag for a week?
    - samlee approved
    ```

    Make the changes the reviewers asked for, run the tests, then commit and push.
""".trimIndent()

private val demoTestLog = listOf(
    "> storefront@0.1.0 test",
    "> vitest run",
    "",
    " ✓ lib/payments.test.ts (12 tests) 271ms",
    " ✗ components/CheckoutForm.test.tsx (8 tests | 1 failed) 460ms",
    "   → expected discount total to equal 41.98, got 45.98",
    " ✓ app/checkout/page.test.tsx (5 tests) 655ms",
    "",
    " FAIL  components/CheckoutForm.test.tsx > applies the discount at the payment step",
    "AssertionError: expected 45.98 to be 41.98",
    " ❯ components/CheckoutForm.test.tsx:64:31",
    "",
    " Test Files  1 failed | 2 passed (3)",
    "      Tests  1 failed | 24 passed (25)",
    "   Duration  7.2s",
    "Error: Process completed with exit code 1."
)
