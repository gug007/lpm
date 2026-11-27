package cx.lpm.mobile.feature.git

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo

/** The parts of the Git screens other features own; the app fills them in. */
@Immutable
class GitSlots(
    /**
     * The CI sheet's Fix with … rows (`:feature:projects`), in the commit sheet's hook
     * panel: each opens a new tab whose agent's first prompt is `prompt`'s, saying
     * `detail` under a row when it's the only one. `onStart` runs as the tab is asked
     * for, after any action inputs; `onSpawnedTerminal` opens the tab.
     */
    val fixRows: @Composable (
        session: SessionKey,
        project: String,
        detail: Int,
        prompt: () -> String?,
        onStart: () -> Unit,
        onSpawnedTerminal: (TerminalInfo) -> Unit
    ) -> Unit = { _, _, _, _, _, _ -> }
)
