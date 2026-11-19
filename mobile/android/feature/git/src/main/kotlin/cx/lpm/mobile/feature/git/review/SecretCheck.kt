package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.model.SecretFinding
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore

/**
 * The commit sheet's answers to the look for secrets (the desktop's
 * SecretFindingsPanel): a file left out also leaves the selection.
 */
class SecretCheck internal constructor(
    private val project: String,
    private val extras: GitExtrasStore?,
    private val drafts: ReviewDraftsStore?
) {
    fun leaveOut(path: String) {
        drafts?.updateDraft(project) { it.copy(deselected = it.deselected + path) }
        extras?.leaveOut(project, path)
    }

    fun ignore(finding: SecretFinding) {
        extras?.ignore(project, finding)
    }

    /** The flagged files out of the selection, and the rest committed as asked. */
    fun leaveOutAndCommit() {
        val flagged = extras?.state?.value?.flaggedFiles(project).orEmpty()
        drafts?.updateDraft(project) { it.copy(deselected = it.deselected + flagged) }
        extras?.leaveOutAndCommit(project)
    }

    fun commitAnyway() {
        extras?.commitAnyway(project)
    }

    fun dismiss() {
        extras?.dismissFindings(project)
    }

    /** The commit sheet closed: what was waved through is forgotten with it. */
    fun closed() {
        extras?.forgetSecrets(project)
    }
}
