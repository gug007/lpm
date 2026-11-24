package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.TerminalViewChoice
import java.time.Instant

/**
 * What other features draw on the terminal screen, wired by the app (features
 * don't depend on each other). A missing sheet leaves its menu item out.
 */
class TerminalSlots(
    /**
     * The project's ⚡ actions and "…" menu at the bar's trailing edge, its Rename naming
     * `terminal`. `view` is what an agent tab shows, null when there's only its
     * terminal. `onFind` finds in the terminal, null while it isn't live here.
     * `onSpawnedTerminal` opens a terminal an action started, claimed for this phone.
     */
    val projectMenu: @Composable RowScope.(
        project: Project,
        terminal: TerminalInfo,
        session: SessionKey,
        view: TerminalViewChoice?,
        onFind: (() -> Unit)?,
        onSpawnedTerminal: (TerminalInfo) -> Unit
    ) -> Unit = { _, _, _, _, _, _ -> },
    /**
     * The Mac's Claude accounts a tab can continue its conversation on, for the limit
     * bar's Other account menu; picking one moves the tab.
     */
    val tabAccountChoices: (
        @Composable ColumnScope.(session: SessionKey, term: TerminalInfo) -> Unit
    )? = null,
    /** The connection banner over the terminal while the session's link isn't ready. */
    val connectionBanner: @Composable (session: SessionKey, lastSeen: Instant?) -> Unit =
        { _, _ -> },
    /** The composer's session-memory picker; `onInvocation` parks its pick in the field. */
    val memorySheet: (
        @Composable (
            project: String,
            cli: String,
            onInvocation: (String) -> Unit,
            onDismiss: () -> Unit
        ) -> Unit
    )? = null,
    /**
     * The duplicate options for "Run in duplicates", seeded with the prompt and the
     * number of new copies; `onDuplicated` runs the prompt here, the first copy.
     */
    val duplicateSheet: (
        @Composable (
            project: Project,
            prompt: String,
            copies: Int,
            onDuplicated: () -> Unit,
            onDismiss: () -> Unit
        ) -> Unit
    )? = null
)
