package cx.lpm.mobile.feature.projects

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/**
 * The parts of the projects screens other features own. The app fills each in as
 * its feature is ported; until then they stay empty.
 */
@Immutable
class ProjectsSlots(
    /**
     * The bar over a list for a connection problem this phone can fix, about the
     * screen's own session (`:feature:connection`).
     */
    val connectionStatusBar: @Composable (session: SessionKey) -> Unit = {},
    /** The card an empty projects list shows instead when the Mac can't be reached. */
    val issueCard: @Composable (ConnectionIssue) -> Unit = {},
    /** The USAGE section under the projects list (`:feature:usage`). */
    val usage: @Composable () -> Unit = {},
    /** The USAGE section under a project's tabs and services. */
    val projectUsage: @Composable (session: SessionKey, project: String) -> Unit = { _, _ -> },
    /** A project's "Background runs" section (`:feature:actions`). */
    val backgroundRuns: @Composable (session: SessionKey, project: String) -> Unit = { _, _ -> },
    /**
     * Runs what the ⚡ sheet picks, on the screen under it: the action's inputs, its
     * confirmation, a background run's output (`:feature:actions`).
     * `onSpawnedTerminal` opens a terminal the run starts.
     */
    val actionRunner: @Composable (
        session: SessionKey,
        project: String,
        onSpawnedTerminal: (TerminalInfo) -> Unit
    ) -> Unit = { _, _, _ -> },
    /** The inputs a New Tab sheet's agent action asks for before it runs (`:feature:actions`). */
    val actionInputs: ActionInputsSlot = { _, _, _ -> },
    /** "Claude Account ▸" in a project's menu, when the Mac has accounts (`:feature:claudeaccount`). */
    val claudeAccountMenu: @Composable ColumnScope.(session: SessionKey, project: Project) -> Unit =
        { _, _ -> },
    /**
     * "Claude Account ▸" in a Claude tab's long press, to continue its conversation on
     * another account (`:feature:claudeaccount`); `working` while its turn runs.
     */
    val tabClaudeAccountMenu: @Composable ColumnScope.(
        session: SessionKey,
        terminal: TerminalInfo,
        working: Boolean
    ) -> Unit = { _, _, _ -> },
    /**
     * Beside a project's menu: asks before accounts the Claude Account menu adds to a
     * list take turns, since picking one closes the menu.
     */
    val claudeConsentPrompt: @Composable (session: SessionKey, project: String) -> Unit =
        { _, _ -> },
    /** "Check for lpm Updates…" in the projects "…" menu (`:feature:mac`, as the rows below). */
    val macUpdateMenuItem: @Composable ColumnScope.() -> Unit = {},
    /** "Pair Directly with …" rows at the end of the projects "…" menu. */
    val pairDirectlyMenuItems: @Composable ColumnScope.() -> Unit = {},
    /** Machines still being added through the live Mac, in the Mac switcher. */
    val pendingMachines: @Composable ColumnScope.() -> Unit = {},
    /** Keep Awake in the Mac switcher (`:feature:mac`). */
    val keepAwakeMenu: @Composable ColumnScope.() -> Unit = {},
    /** The cup beside the live Mac's name while it is kept awake (`:feature:mac`). */
    val keepAwakeIndicator: @Composable () -> Unit = {},
    /** "Terminal Settings": the phone's terminal font and theme (`:feature:terminal`). */
    val terminalSettingsSheet: @Composable (onDismiss: () -> Unit) -> Unit = {},
    /** The bar along the bottom of the projects list (the lpm update bar, `:feature:mac`). */
    val bottomBar: @Composable () -> Unit = {}
)
