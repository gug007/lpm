package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.GitChecks
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CiMenuItemTest {
    @get:Rule
    val compose = createComposeRule()

    private var opened = 0

    private fun checks(vararg states: CiCheck.State) = GitChecks(
        branch = "main",
        pr = null,
        commit = null,
        checks = states.mapIndexed { i, state -> CiCheck("check $i", "CI", state, "") },
        fixPrompt = null
    )

    private fun show(state: GitChecksUiState) = compose.setContent {
        LpmTheme {
            Box {
                ContextMenu(expanded = true, onDismissRequest = {}) {
                    CiMenuItem(state, onClick = { opened++ })
                }
            }
        }
    }

    @Test
    fun showsHowTheChecksStandAndOpensThem() {
        show(
            GitChecksUiState(
                available = true,
                checks = checks(CiCheck.State.FAIL, CiCheck.State.PASS)
            )
        )
        compose.onNodeWithText("1 failing").assertExists()
        compose.onNodeWithText("CI").performClick()
        assertEquals(1, opened)
    }

    @Test
    fun leftOutWhenOnlySkippedChecksRan() {
        show(GitChecksUiState(available = true, checks = checks(CiCheck.State.SKIPPED)))
        compose.onNodeWithText("CI").assertDoesNotExist()
    }

    @Test
    fun leftOutWhenTheMacCannotAnswer() {
        show(GitChecksUiState(available = false, checks = checks(CiCheck.State.PASS)))
        compose.onNodeWithText("CI").assertDoesNotExist()
    }
}
