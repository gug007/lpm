package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * One entry of a project folder (the `listDir` reply). `status` is the file's git
 * status word, null when unchanged; `changed` counts the changed files anywhere below
 * a folder.
 */
data class ProjectFileEntry(
    val name: String,
    val dir: Boolean,
    val ignored: Boolean,
    val status: String?,
    val changed: Int
) {
    val id: String get() = name

    companion object {
        fun parse(o: JsonObject): ProjectFileEntry = ProjectFileEntry(
            name = o.string("name").orEmpty(),
            dir = o.bool("dir") ?: false,
            ignored = o.bool("ignored") ?: false,
            status = o.string("status")?.ifEmpty { null },
            changed = o.int("changed") ?: 0
        )
    }
}

/**
 * One `listDir` reply: a folder of a project, `entries` null on a failure. `root` is
 * the project's absolute folder, when the Mac says.
 */
data class ProjectDirContents(
    val project: String,
    val dir: String,
    val entries: List<ProjectFileEntry>?,
    val error: String?,
    val root: String?
) {
    companion object {
        fun parse(o: JsonObject): ProjectDirContents {
            val ok = o.bool("ok") ?: false
            return ProjectDirContents(
                project = o.string("project").orEmpty(),
                dir = o.string("dir").orEmpty(),
                entries = if (ok) o.list("entries", ProjectFileEntry::parse) else null,
                error = if (ok) null else o.string("error") ?: "Couldn't open this folder.",
                root = o.string("root")?.ifEmpty { null }
            )
        }
    }
}

/** What a typed path turned out to be; [MISSING] covers what nothing can open. */
enum class LocatedKind { FILE, DIR, MISSING }

/** One `locatePath` reply: where a path typed into Go to File leads on the Mac. */
data class LocatedPath(
    val project: String,
    /** The path as it was typed. */
    val typed: String,
    /** Null when the Mac couldn't say. */
    val kind: LocatedKind?,
    /** Absolute on the Mac. */
    val path: String,
    /** Its place in the project, empty for the project's own folder; null outside it. */
    val rel: String?
) {
    companion object {
        fun parse(o: JsonObject): LocatedPath = LocatedPath(
            project = o.string("project").orEmpty(),
            typed = o.string("path").orEmpty(),
            kind = if (o.bool("ok") == true) kindOf(o.string("kind")) else null,
            path = o.string("at").orEmpty(),
            rel = o.string("rel")
        )

        private fun kindOf(name: String?): LocatedKind? = when (name) {
            "file" -> LocatedKind.FILE
            "dir" -> LocatedKind.DIR
            "missing" -> LocatedKind.MISSING
            else -> null
        }
    }
}

/** `dir` joined with `name`, `/`-separated. */
fun projectPath(dir: String, name: String): String =
    if (dir.isEmpty() || dir.endsWith('/')) dir + name else "$dir/$name"

/**
 * A folder by its place in the project, where it has one: a folder outside can hold the
 * project's own.
 */
fun projectDir(dir: String, root: String?): String =
    if (root == null) dir else dir.removePrefix("$root/")

/**
 * A folder outside the project goes by its absolute path on the machine: `/…`, or a
 * drive's or a share's on a Windows PC.
 */
fun isOutsideProject(dir: String): Boolean =
    dir.startsWith("/") || dir.startsWith("\\\\") || WINDOWS_DRIVE.containsMatchIn(dir)

private val WINDOWS_DRIVE = Regex("^[A-Za-z]:[\\\\/]")
