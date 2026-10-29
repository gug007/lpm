package cx.lpm.mobile.feature.pairing

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.session.ApprovalPairingState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp")
class PairingScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val noCard: IssueCardSlot = { _, _ -> }

    @Test
    fun aFreshPhoneAsksAboutTailscaleFirst() {
        var taps = ""
        compose.setContent {
            LpmTheme {
                PairingScreen(
                    state = PairingUiState(),
                    actions = PairingActions(
                        onSetUpTailscale = { taps += "setup " },
                        onUseTailscaleApp = { taps += "app " },
                        onLocalOnly = { taps += "local " },
                        onTryDemo = { taps += "demo" }
                    ),
                    issueCard = noCard
                )
            }
        }
        compose.onNodeWithText("Connect to your Mac").assertExists()
        compose.onNodeWithText(
            "lpm reaches your Mac from anywhere over Tailscale. Set it up first, or pair for this Wi-Fi only."
        ).assertExists()
        compose.onNodeWithText("Use lpm anywhere").assertExists()
        compose.onNodeWithText("Scan QR code").assertDoesNotExist()
        compose.onNodeWithText("Set up Built-in Tailscale").performClick()
        compose.onNodeWithText("I use the Tailscale app").performClick()
        compose.onNodeWithText("Pair for this Wi-Fi only").performClick()
        compose.onNodeWithText("No Mac nearby? Try the demo").performClick()
        assertEquals("setup app local demo", taps)
    }

    @Test
    fun pairingForThisWiFiShowsTheWaysToPair() {
        var taps = ""
        compose.setContent {
            LpmTheme {
                PairingScreen(
                    state = PairingUiState(localOnly = true),
                    actions = PairingActions(onScan = { taps += "scan " }, onEnterCode = {
                        taps +=
                            "code"
                    }),
                    issueCard = noCard
                )
            }
        }
        compose.onNodeWithText(
            "Open lpm on your Mac. Pick it below, then approve on the Mac."
        ).assertExists()
        compose.onNodeWithText("Pairing for this Wi-Fi only").assertExists()
        compose.onNodeWithText("ON THIS WI-FI").assertExists()
        compose.onNodeWithText("Looking for Macs running lpm…").assertExists()
        compose.onNodeWithText("Scan QR code").performClick()
        compose.onNodeWithText("Enter a code").performClick()
        assertEquals("scan code", taps)
    }

    @Test
    fun addingAMachineHasNoDemoAndShowsTheIssue() {
        compose.setContent {
            LpmTheme {
                PairingScreen(
                    state = PairingUiState(
                        adding = true,
                        localOnly = true,
                        issue = ConnectionIssue.CodeRejected
                    ),
                    actions = PairingActions(),
                    issueCard = { issue, _ -> Text("card for $issue") }
                )
            }
        }
        compose.onNodeWithText("Add a machine").assertExists()
        compose.onNodeWithText("No Mac nearby? Try the demo").assertDoesNotExist()
        compose.onNodeWithText("card for CodeRejected").assertExists()
    }

    @Test
    fun pairIsReadyOnceTheCodeAndAddressAreIn() {
        var form by mutableStateOf(EnterCodeForm())
        var pairs = 0
        compose.setContent {
            LpmTheme {
                EnterCodeScreen(
                    form = form,
                    state = EnterCodeUiState(),
                    onFormChange = { form = it },
                    onPair = { pairs++ },
                    onIssueAction = { false },
                    onBack = {},
                    issueCard = noCard
                )
            }
        }
        compose.onNodeWithText("Enter a Code").assertExists()
        compose.onNodeWithText(
            "Shown under the code in lpm (+ above your projects → Phone)."
        ).assertExists()
        compose.onNodeWithText("Pair").assertIsNotEnabled()
        form = EnterCodeForm(code = "ab12cd34", host = "100.64.1.2")
        compose.onNodeWithText("Tailscale address — works from anywhere.").assertExists()
        compose.onNodeWithText("Pair").assertIsEnabled().performClick()
        assertEquals(1, pairs)
        form = form.copy(host = "192.168.1.20", port = "0")
        compose.onNodeWithText("Port must be a number from 1 to 65535.").assertExists()
        compose.onNodeWithText("Pair").assertIsNotEnabled()
        form = form.copy(port = "8765")
        compose.onNodeWithText("Home network address — works on this Wi-Fi only.").assertExists()
    }

    @Test
    fun theApprovalSheetShowsTheMatchCode() {
        var approval by mutableStateOf<ApprovalPairingState>(ApprovalPairingState.Requesting)
        var codeInstead = 0
        compose.setContent {
            LpmTheme {
                ApprovalPairingContent(approval, "Studio", onCancel = {
                }, onRetry = {}, onEnterCode = { codeInstead++ })
            }
        }
        compose.onNodeWithText("Contacting Studio…").assertExists()
        approval = ApprovalPairingState.Waiting("4815")
        compose.onNodeWithText("48 15").assertExists()
        compose.onNodeWithText(
            "Approve this phone in the lpm window on Studio, and check the code matches."
        )
            .assertExists()
        compose.onNodeWithText("Enter code instead").performClick()
        assertEquals(1, codeInstead)
        approval = ApprovalPairingState.Denied("busy", null)
        compose.onNodeWithText("Mac is busy").assertExists()
        approval = ApprovalPairingState.Denied("declined", "Not now, thanks.")
        compose.onNodeWithText("Not now, thanks.").assertExists()
        approval = ApprovalPairingState.TimedOut
        compose.onNodeWithText(
            "No answer from Studio. Make sure lpm is open on your Mac."
        ).assertExists()
    }

    @Test
    fun theScannerSaysWhereTheCodeIsAndWhenTheCameraIsOff() {
        var closes = 0
        var problem by mutableStateOf<CameraProblem?>(null)
        compose.setContent { LpmTheme { ScannerChrome(problem, onClose = { closes++ }) } }
        compose.onNodeWithText(
            "Scan the QR from lpm: + above your projects → Phone → Pair a device"
        ).assertExists()
        problem = CameraProblem.Denied
        compose.onNodeWithText(
            "Camera access is off. Enable it in Settings, or enter the code manually."
        )
            .assertExists()
        problem = CameraProblem.Unavailable
        compose.onNodeWithText("Camera unavailable").assertExists()
        compose.onNodeWithContentDescription("Close").performClick()
        assertEquals(1, closes)
    }
}
