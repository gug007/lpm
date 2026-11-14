package cx.lpm.mobile.feature.files.preview

import cx.lpm.mobile.core.model.GitSnapshot

/**
 * The path the project knows the file by, as the Mac [named] it ("" outside the
 * project); null outside it. From a Mac that doesn't say, only a relative [fetched]
 * path counts.
 */
internal fun projectPath(fetched: String, named: String?): String? =
    if (named != null) named.ifEmpty { null } else relativeProjectPath(fetched)

/**
 * A tapped path read as the project's: a relative one, without its `./`. Null for an
 * absolute, `~/…` or `../…` path, which may name a file anywhere.
 */
internal fun relativeProjectPath(path: String): String? {
    if (path.isEmpty() || path.startsWith("/") || path.startsWith("~")) return null
    val rel = path.removePrefix("./")
    return rel.takeUnless { it == ".." || it.startsWith("../") }
}

/** The file as git lists it, when it has changes. */
internal fun changedPath(projectPath: String?, snapshot: GitSnapshot?): String? =
    projectPath?.takeIf { path -> snapshot?.files?.any { it.path == path } == true }

/** The folder a path is in, as `NSString.deletingLastPathComponent` reads it: "" for none. */
internal fun parentPath(path: String): String {
    val trimmed = path.trimEnd('/')
    if (trimmed.isEmpty()) return if (path.isEmpty()) "" else "/"
    val slash = trimmed.lastIndexOf('/')
    return when {
        slash < 0 -> ""
        slash == 0 -> "/"
        else -> trimmed.substring(0, slash)
    }
}
