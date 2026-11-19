package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** What the Mac's look for secrets found in a line a commit adds (`gitScanSecrets`). */
data class SecretFinding(
    val path: String,
    /** 1-based line in the new file; 0 for a finding about the whole file. */
    val line: Int,
    /** What it looks like: "Stripe secret key", "Environment file". */
    val rule: String,
    /** Only the key's kind and last characters: sk_live_••••Qx. */
    val masked: String
) {
    val id: String get() = "$path\u0000$line\u0000$rule"

    /** "lib/stripe.ts:12", or the path alone for a whole-file finding. */
    val place: String get() = if (line > 0) "$path:$line" else path

    companion object {
        fun parse(o: JsonObject): SecretFinding? {
            val path = o.string("path").orEmpty()
            if (path.isEmpty()) return null
            return SecretFinding(
                path = path,
                line = o.int("line") ?: 0,
                rule = o.string("rule").orEmpty(),
                masked = o.string("masked").orEmpty()
            )
        }
    }
}

/** The branch's own changes since it left its base (`gitBranchFiles`). */
data class BranchScope(
    val base: String,
    val range: Range,
    val commits: Int,
    val files: List<GitFile>
) {
    enum class Range(val wire: String) { SINCE("since"), UNPUSHED("unpushed") }

    /** "3 commits since main", "2 commits not pushed". */
    val heading: String
        get() {
            val count = if (commits == 1) "1 commit" else "$commits commits"
            return if (range == Range.SINCE) "$count since $base" else "$count not pushed"
        }

    companion object {
        /** Null when there's nothing to compare with. */
        fun parse(o: JsonObject): BranchScope? {
            val base = o.string("base").orEmpty()
            if (base.isEmpty()) return null
            return BranchScope(
                base = base,
                range = Range.entries.firstOrNull { it.wire == o.string("range") } ?: Range.SINCE,
                commits = o.int("commits") ?: 0,
                files = o.objects("files").orEmpty().map(GitFile::parse)
            )
        }
    }
}

/** The review on a branch's pull request (`gitPrDiscussion`). */
data class PrDiscussion(
    val number: Int,
    val title: String,
    val url: String,
    val notes: List<Note>,
    /** What an agent is told to address it. */
    val prompt: String
) {
    data class Note(
        val kind: Kind,
        val author: String,
        val body: String,
        val state: String,
        val path: String,
        val line: Int?,
        val createdAt: String
    ) {
        enum class Kind(val wire: String) { REVIEW("review"), LINE("line"), COMMENT("comment") }

        /** "lib/payments.ts:18" for a line comment. */
        val place: String?
            get() = when {
                kind != Kind.LINE || path.isEmpty() -> null
                line != null -> "$path:$line"
                else -> path
            }

        companion object {
            fun parse(o: JsonObject): Note? {
                val kind = Kind.entries.firstOrNull { it.wire == o.string("kind") } ?: return null
                return Note(
                    kind = kind,
                    author = o.string("author").orEmpty(),
                    body = o.string("body").orEmpty(),
                    state = o.string("state").orEmpty(),
                    path = o.string("path").orEmpty(),
                    line = o.int("line"),
                    createdAt = o.string("createdAt").orEmpty()
                )
            }
        }
    }

    /** Everything a reviewer wrote, a bare approval left out. */
    val comments: List<Note>
        get() = notes.filter { it.body.isNotEmpty() || it.state == "CHANGES_REQUESTED" }

    /** Whether a reviewer's newest verdict asks for changes. */
    val changesRequested: Boolean
        get() {
            val latest = mutableMapOf<String, String>()
            for (note in notes) {
                if (note.kind == Note.Kind.REVIEW && note.state != "COMMENTED") {
                    latest[note.author] = note.state
                }
            }
            return latest.values.contains("CHANGES_REQUESTED")
        }

    companion object {
        fun parse(o: JsonObject, prompt: String): PrDiscussion? {
            val number = o.int("number") ?: return null
            return PrDiscussion(
                number = number,
                title = o.string("title").orEmpty(),
                url = o.string("url").orEmpty(),
                notes = o.objects("notes").orEmpty().mapNotNull(Note::parse),
                prompt = prompt
            )
        }
    }
}

/** The end of a failed check's log (`gitCheckLog`). */
data class CheckLog(val step: String, val lines: List<String>, val more: Boolean) {
    val text: String get() = (if (more) "…\n" else "") + lines.joinToString("\n")
}

/** How a save from the file preview went (`writeFile`). */
data class FileWriteResult(
    val reqId: String,
    val sha256: String?,
    /** The file changed on the Mac since it was opened, so nothing was written. */
    val changed: Boolean,
    val error: String?
)
