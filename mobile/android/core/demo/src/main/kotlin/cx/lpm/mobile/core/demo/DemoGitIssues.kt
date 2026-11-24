package cx.lpm.mobile.core.demo

/*
 * Demo answers for the composer's @ menu (iOS `DemoGitIssues`): storefront's open
 * issues, and one of them with its comments.
 */

private class DemoIssue(
    val number: Int,
    val title: String,
    val author: String,
    val labels: List<String>,
    val branch: String,
    val body: String,
    val comments: List<Pair<String, String>> = emptyList()
) {
    private val url get() = "https://github.com/example/storefront/issues/$number"

    val row: Dict
        get() = mapOf(
            "number" to number,
            "title" to title,
            "url" to url,
            "author" to author,
            "labels" to labels,
            "branch" to branch
        )

    /** Laid out as issues.rs lays one out for the message and the prompt. */
    val text: Dict
        get() {
            val said = comments.joinToString("\n") { (author, body) -> "- $author: $body" }
            val thread = if (said.isEmpty()) body else "$body\n\nComments:\n$said"
            return mapOf(
                "number" to number,
                "title" to title,
                "url" to url,
                "mention" to
                    "Issue #$number:\n```\n#$number $title\n$url\n\n$thread\n```\n",
                "prompt" to "Work on issue #$number: $title\n$url\n\n$thread"
            )
        }
}

internal fun DemoServer.registerGitIssueHandlers() {
    register("gitIssues") { o ->
        val project = o.string("project") ?: return@register
        val issues = if (project == "storefront") demoIssues else emptyList()
        pushAfter(
            0.4,
            mapOf(
                "t" to "gitIssues",
                "project" to project,
                "ok" to true,
                "issues" to issues.map { it.row }
            )
        )
    }
    register("gitIssue") { o ->
        val project = o.string("project") ?: return@register
        val number = o.int("number") ?: 0
        val reply = mapOf(
            "t" to "gitIssue",
            "project" to project,
            "number" to number,
            "reqId" to o["reqId"]
        )
        val issue = demoIssues.firstOrNull { project == "storefront" && it.number == number }
        val result = if (issue != null) {
            mapOf("ok" to true, "issue" to issue.text)
        } else {
            mapOf("ok" to false, "error" to "There's no issue #$number in this repository.")
        }
        pushAfter(0.5, reply + result)
    }
}

private val demoIssues = listOf(
    DemoIssue(
        number = 45,
        title = "Cart badge keeps the old count after checkout",
        author = "priyan",
        labels = listOf("bug"),
        branch = "45-cart-badge-keeps-the-old-count-after-checkout",
        body = "Pay for an order, then go back to the shop. The badge still shows the items " +
            "that were bought until the page reloads.",
        comments = listOf(
            "samlee" to "The badge reads the cart once, in components/CartBadge.tsx."
        )
    ),
    DemoIssue(
        number = 38,
        title = "Split checkout into two steps",
        author = "samlee",
        labels = listOf("checkout"),
        branch = "38-split-checkout-into-two-steps",
        body = "One long form loses people. Ask for the address first, then the payment."
    ),
    DemoIssue(
        number = 31,
        title = "Show delivery dates on the product page",
        author = "priyan",
        labels = listOf("feature"),
        branch = "31-show-delivery-dates-on-the-product-page",
        body = "Support gets asked when an order will arrive. The product page can say it " +
            "before someone buys."
    )
)
