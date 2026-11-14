package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore

/**
 * The terminals' composers as other features reach them, such as a file preview's
 * Mention putting `@path` in the prompt of the tab it was opened from.
 */
interface ComposerPrompts : SessionStore {
    /** Add [text] at the end of the prompt typed for terminal [termId], if it has one. */
    fun append(termId: String, text: String)
}

/** The session's composers; null where no feature provides them (a test's session). */
fun MacSession.composerPrompts(): ComposerPrompts? =
    stores.filterIsInstance<ComposerPrompts>().firstOrNull()
