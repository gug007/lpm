package cx.lpm.mobile.core.demo

/*
 * Demo handlers for commit history: a fixed log per project, its newest `ahead`
 * commits not pushed yet, with each commit's files and their patches made up from
 * the line counts.
 */

private class DemoCommitFile(
    val path: String,
    val status: String,
    val added: Int?,
    val removed: Int?,
    val oldPath: String? = null
)

private class DemoCommit(
    val hash: String,
    val subject: String,
    val body: String,
    val author: String,
    val email: String,
    val minutesAgo: Int,
    val parents: Int,
    val coAuthors: List<String>,
    val files: List<DemoCommitFile>
)

private const val CLAUDE = "Claude Opus 5.5 <noreply@anthropic.com>"
private const val CODEX = "Codex <noreply@openai.com>"

private val storefrontLog = listOf(
    DemoCommit(
        "a1f3c9e5b2d84f6a9c0e1b7d3f5a8c2e4b6d9f01", "Two-step checkout flow",
        "Split the form into address and payment steps.\n\nCo-authored-by: $CLAUDE",
        "Alex Kim", "alex@example.com", 12, 1, listOf(CLAUDE),
        listOf(
            DemoCommitFile("components/CheckoutForm.tsx", "modified", 38, 5),
            DemoCommitFile("components/StepIndicator.tsx", "added", 14, 0)
        )
    ),
    DemoCommit(
        "7b20d14c8e3f5a6b9d2c1e0f4a7b8c3d5e6f9a12", "Add payment intent API",
        "Co-authored-by: $CLAUDE", "Alex Kim", "alex@example.com", 125, 1, listOf(CLAUDE),
        listOf(
            DemoCommitFile("lib/payments.ts", "added", 72, 0),
            DemoCommitFile("app/api/routes.ts", "modified", 14, 0)
        )
    ),
    DemoCommit(
        "3e91a07f2b6c4d8e1a5f9b3c7d0e2f4a6b8c1d23",
        "Merge pull request #408 from acme/fix/cart-badge",
        "Fix cart badge count", "Alex Kim", "alex@example.com", 300, 2, emptyList(),
        listOf(DemoCommitFile("components/CartBadge.tsx", "modified", 6, 2))
    ),
    DemoCommit(
        "9e04bb21d7f3a5c8e6b0d4f2a1c9e7b5d3f8a634", "Fix cart badge count",
        "Co-authored-by: $CODEX", "Sam Lee", "sam@example.com", 1_500, 1, listOf(CODEX),
        listOf(DemoCommitFile("components/CartBadge.tsx", "modified", 6, 2))
    ),
    DemoCommit(
        "51c7d3a8f0e2b4c6d9a1e3f5b7c0d2e4f6a8b945", "Bump next to 15.2",
        "", "dependabot[bot]", "bot@example.com", 1_720, 1, emptyList(),
        listOf(
            DemoCommitFile("package.json", "modified", 1, 1),
            DemoCommitFile("package-lock.json", "modified", 11, 11)
        )
    ),
    DemoCommit(
        "c02f6e84a9b1d3f5e7c0a2b4d6f8e1a3c5b7d056", "Rate-limit the cart API",
        "Co-authored-by: $CLAUDE", "Alex Kim", "alex@example.com", 2_900, 1, listOf(CLAUDE),
        listOf(
            DemoCommitFile("lib/rateLimit.ts", "added", 41, 0),
            DemoCommitFile("app/api/routes.ts", "modified", 7, 4),
            DemoCommitFile("public/cart-icon.png", "added", null, null)
        )
    ),
    DemoCommit(
        "e5a8b2c4d6f0a1b3c5d7e9f2a4b6c8d0e1f3a167", "Move the cart into its own page",
        "", "Sam Lee", "sam@example.com", 8_700, 1, emptyList(),
        listOf(DemoCommitFile("app/cart/page.tsx", "renamed", 3, 1, oldPath = "app/cart.tsx"))
    ),
    DemoCommit(
        "0d4f6a8c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d78", "Initial storefront",
        "", "Alex Kim", "alex@example.com", 20_160, 0, emptyList(),
        listOf(
            DemoCommitFile("README.md", "added", 9, 0),
            DemoCommitFile("package.json", "added", 18, 0)
        )
    )
)

private val otherLog = listOf(
    DemoCommit(
        "4f1c2ab9d3e5f7a0b2c4d6e8f1a3b5c7d9e0f289", "Update dependencies",
        "", "Alex Kim", "alex@example.com", 1_440, 1, emptyList(),
        listOf(DemoCommitFile("package.json", "modified", 3, 3))
    ),
    DemoCommit(
        "8a2c4e6f0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f90", "Initial commit",
        "", "Alex Kim", "alex@example.com", 10_080, 0, emptyList(),
        listOf(DemoCommitFile("README.md", "added", 6, 0))
    )
)

internal fun DemoServer.registerGitHistoryHandlers() {
    register("gitHistory") { o ->
        val project = o.string("project") ?: return@register
        val skip = o.int("skip") ?: 0
        val limit = maxOf(1, o.int("limit") ?: 100)
        pushAfter(0.3) {
            val log = demoLog(project) ?: return@pushAfter mapOf(
                "t" to "gitHistory",
                "project" to project,
                "skip" to skip,
                "ok" to false,
                "error" to "Not a git repository."
            )
            val ahead = world.git[project]?.ahead ?: 0
            val now = nowSeconds()
            val page = log.withIndex().drop(skip).take(limit).map { (index, c) ->
                mapOf(
                    "hash" to c.hash,
                    "short" to c.hash.take(7),
                    "subject" to c.subject,
                    "body" to c.body,
                    "author" to c.author,
                    "email" to c.email,
                    "time" to now - c.minutesAgo * 60,
                    "parents" to c.parents,
                    "coAuthors" to c.coAuthors,
                    "unpushed" to (index < ahead)
                )
            }
            mapOf(
                "t" to "gitHistory",
                "project" to project,
                "skip" to skip,
                "ok" to true,
                "commits" to page,
                "hasMore" to (skip + page.size < log.size)
            )
        }
    }
    register("gitCommitFiles") { o ->
        val project = o.string("project") ?: return@register
        val hash = o.string("hash") ?: return@register
        pushAfter(0.2) {
            val commit = demoCommit(project, hash) ?: return@pushAfter mapOf(
                "t" to "gitCommitFiles",
                "project" to project,
                "hash" to hash,
                "ok" to false,
                "error" to "$hash is not a commit"
            )
            val files = commit.files.map {
                mapOf(
                    "path" to it.path,
                    "oldPath" to it.oldPath,
                    "status" to it.status,
                    "added" to it.added,
                    "removed" to it.removed
                )
            }
            mapOf(
                "t" to "gitCommitFiles",
                "project" to project,
                "hash" to hash,
                "ok" to true,
                "files" to files
            )
        }
    }
    register("gitCommitPatch") { o ->
        val project = o.string("project") ?: return@register
        val hash = o.string("hash") ?: return@register
        val path = o.string("path") ?: return@register
        pushAfter(0.2) {
            val file = demoCommit(project, hash)?.files?.firstOrNull { it.path == path }
                ?: return@pushAfter mapOf(
                    "t" to "gitCommitPatch",
                    "project" to project,
                    "hash" to hash,
                    "path" to path,
                    "ok" to false,
                    "error" to "$hash is not a commit"
                )
            mapOf(
                "t" to "gitCommitPatch",
                "project" to project,
                "hash" to hash,
                "path" to path,
                "ok" to true,
                "diff" to demoPatch(file),
                "truncated" to false
            )
        }
    }
}

private fun DemoServer.demoLog(project: String): List<DemoCommit>? {
    if (world.git[project] == null) return null
    return if (project == "storefront") storefrontLog else otherLog
}

private fun DemoServer.demoCommit(project: String, hash: String): DemoCommit? =
    demoLog(project)?.firstOrNull { it.hash == hash }

/** A patch with the file's line counts: its removed lines, then its added ones. */
private fun demoPatch(f: DemoCommitFile): String {
    val from = if (f.status == "added") "/dev/null" else "a/${f.oldPath ?: f.path}"
    val to = if (f.status == "deleted") "/dev/null" else "b/${f.path}"
    val removed = f.removed ?: 0
    val added = f.added ?: 0
    val start = if (f.status == "added") 0 else 1
    val lines = mutableListOf(
        "diff --git a/${f.oldPath ?: f.path} b/${f.path}",
        "--- $from",
        "+++ $to",
        "@@ -$start,$removed +${if (start == 0) 1 else start},$added @@"
    )
    lines += (0 until removed).map { "-" + demoLine(it, f.path, old = true) }
    lines += (0 until added).map { "+" + demoLine(it, f.path, old = false) }
    return lines.joinToString("\n") + "\n"
}

private fun demoLine(i: Int, path: String, old: Boolean): String {
    val file = path.substringAfterLast('/')
    val dot = file.lastIndexOf('.')
    val name = if (dot > 0) file.substring(0, dot) else file
    val code = listOf(
        "import { useState } from \"react\";",
        "",
        "export function $name() {",
        "  const [step, setStep] = useState(${if (old) 0 else 1});",
        "  if (!step) return null;",
        "  return <section className=\"${name.lowercase()}\">{step}</section>;",
        "}"
    )
    return code[i % code.size]
}
