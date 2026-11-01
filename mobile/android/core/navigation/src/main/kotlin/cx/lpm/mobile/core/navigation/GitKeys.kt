package cx.lpm.mobile.core.navigation

import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.serialization.Serializable

/** "Review Changes": the project's uncommitted changes. */
@Serializable
data class GitReviewKey(val project: String, val session: SessionKey = SessionKey.Live) : NavKey

/** "Switch Branch…". */
@Serializable
data class GitBranchKey(val project: String, val session: SessionKey = SessionKey.Live) : NavKey

/** "Create Pull Request…". */
@Serializable
data class GitPullRequestKey(val project: String, val session: SessionKey = SessionKey.Live) :
    NavKey

/** An AI git shortcut's progress; `start` is the run the menu asked for (a `GitAutoKind`). */
@Serializable
data class GitAutoKey(
    val project: String,
    val start: String,
    val session: SessionKey = SessionKey.Live
) : NavKey

/** "History": the current branch's commits, newest first. */
@Serializable
data class GitHistoryKey(val project: String, val session: SessionKey = SessionKey.Live) : NavKey

/** One commit of History: its message, who wrote it and the files it changed. */
@Serializable
data class GitCommitKey(
    val project: String,
    val commit: HistoryCommit,
    val session: SessionKey = SessionKey.Live
) : NavKey

/** One file's patch in a commit. */
@Serializable
data class GitCommitFileKey(
    val project: String,
    val hash: String,
    val file: CommitFile,
    val session: SessionKey = SessionKey.Live
) : NavKey
