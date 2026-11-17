package cx.lpm.mobile.feature.memory.create

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.feature.memory.demoSession
import cx.lpm.mobile.feature.memory.memory
import cx.lpm.mobile.feature.memory.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MemoryCreateSheetTest {
    @get:Rule(order = 0)
    val main = MainDispatcherRule()

    @get:Rule(order = 1)
    val compose = createComposeRule()

    @Test
    fun theFooterPreviewsTheNameAndWhatCreateDoes() = runTest {
        val t = demoSession()
        t.memory.load("storefront")
        t.settle()
        val vm = MemoryCreateViewModel("storefront", SessionKey.Live, t.sessions)
        val opened = mutableListOf<String>()
        compose.setContent {
            LpmTheme {
                MemoryCreateContent(
                    project = "storefront",
                    ownerLabel = "storefront",
                    session = SessionKey.Live,
                    onOpen = { opened += it },
                    onDismiss = {},
                    viewModel = vm
                )
            }
        }
        compose.onNodeWithText("New Memory Session").assertExists()
        compose.onNodeWithText("Title").assertExists()
        compose.onNodeWithText(
            "Agents pick a session up by its short name, so give it a few plain words."
        ).assertExists()
        compose.onNodeWithText("Create").assertIsNotEnabled()

        compose.onNodeWithText("What is this session about?").performTextInput("Checkout redesign")
        compose.onNodeWithText("checkout-redesign").assertExists()
        compose.onNodeWithText(
            "storefront already has a session with that name — Create opens it."
        ).assertExists()
        compose.onNodeWithText("Create").assertIsEnabled().performClick()
        compose.waitUntil { opened.isNotEmpty() }
        assertEquals(listOf("checkout-redesign"), opened)
    }
}
