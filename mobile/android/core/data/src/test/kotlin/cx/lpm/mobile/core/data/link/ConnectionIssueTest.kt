package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.mac.Farewell
import java.time.Instant
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionIssueTest {
    private val failed = LpmClient.State.Failed(LpmClient.OFFLINE_HINT)

    @Test
    fun `a live link has no issue, and identity outranks everything`() {
        assertNull(ConnectionIssue.derive(LinkFacts(LpmClient.State.Ready)))
        assertEquals(
            ConnectionIssue.IdentityRejected,
            ConnectionIssue.derive(LinkFacts(failed, identityRejected = true, needsRepair = true))
        )
        assertEquals(
            ConnectionIssue.NotRecognized,
            ConnectionIssue.derive(LinkFacts(failed, needsRepair = true))
        )
        assertEquals(
            ConnectionIssue.PhoneOffline,
            ConnectionIssue.derive(LinkFacts(failed, online = false))
        )
    }

    @Test
    fun `a machine that removed this phone says so, named even in the bar`() {
        val revoked = LpmClient.State.Failed(LpmClient.REVOKED_ERROR)
        val issue = ConnectionIssue.derive(LinkFacts(revoked, needsRepair = true))
        assertEquals(ConnectionIssue.RemovedOnMac, issue)
        val copy = issue!!.issueCopy("Build Box", "phone")
        assertEquals("This phone was removed on Build Box", copy.title)
        assertEquals("Pair it on that Mac itself to use it here again.", copy.message)
        assertEquals(listOf(IssueAction.PairAgain), copy.actions)
        assertTrue(issue.needsYou)
        assertEquals(
            "Removed on that Mac",
            LinkStatusLine.make(
                ready = false,
                demo = false,
                kind = null,
                issue = issue,
                device = "phone",
                now = Instant.EPOCH
            ).text
        )
    }

    @Test
    fun `failures are named by cause`() {
        fun derive(message: String, pairing: Boolean = false) = ConnectionIssue.derive(
            LinkFacts(LpmClient.State.Failed(message), pairing = pairing, atHome = true)
        )
        assertEquals(ConnectionIssue.LpmNotRunning, derive(LpmClient.REFUSED_ERROR))
        assertEquals(
            ConnectionIssue.PairUnreachable(false),
            derive(LpmClient.REFUSED_ERROR, pairing = true)
        )
        assertEquals(ConnectionIssue.SecureFailed, derive(LpmClient.SECURE_FAILED_ERROR))
        assertEquals(ConnectionIssue.CodeRejected, derive(LpmClient.PAIRING_REJECTED_ERROR))
        assertEquals(ConnectionIssue.QrMismatch, derive(LpmClient.PAIR_MISMATCH_ERROR))
        assertEquals(ConnectionIssue.NotAnswering(away = false), derive(LpmClient.OFFLINE_HINT))
        assertEquals(
            ConnectionIssue.RelayOffline("your Mac"),
            derive(LpmClient.RELAY_OFFLINE_ERROR)
        )
    }

    @Test
    fun `away from home without a way in asks for Tailscale`() {
        val away = LinkFacts(failed, onCellular = true, hasAwayAddress = true)
        assertEquals(
            ConnectionIssue.AwayNeedsTailscale(AwaySetup.TurnOn),
            ConnectionIssue.derive(away)
        )
        assertEquals(
            ConnectionIssue.AwayNeedsTailscale(AwaySetup.App),
            ConnectionIssue.derive(away.copy(usesTailscaleApp = true))
        )
        assertEquals(
            ConnectionIssue.AwayNeedsTailscale(AwaySetup.MacSetup),
            ConnectionIssue.derive(away.copy(hasAwayAddress = false))
        )
        assertEquals(
            ConnectionIssue.NotAnswering(away = true),
            ConnectionIssue.derive(away.copy(tailscaleEnabled = true, tailscaleState = "running"))
        )
    }

    @Test
    fun `a goodbye explains the wait, and only some issues earn a bar`() {
        val at = Instant.parse("2026-10-15T09:41:00Z")
        val asleep = ConnectionIssue.derive(
            LinkFacts(
                LpmClient.State.Connecting,
                atHome = true,
                farewell = Farewell(Farewell.Reason.Sleep, at)
            )
        )
        assertEquals(ConnectionIssue.Farewell(Farewell(Farewell.Reason.Sleep, at)), asleep)
        val copy = asleep!!.issueCopy("Studio", "phone", ZoneOffset.UTC)
        assertEquals("Studio is asleep", copy.title)
        assertEquals("Try now", IssueAction.Retry.label(asleep))
        // Waking it is something this phone can do, so the notice earns a bar.
        assertEquals(listOf(IssueAction.Wake, IssueAction.Retry), copy.actions)
        assertEquals("Wake", IssueAction.Wake.label(asleep))
        assertTrue(asleep.needsYou)
        assertTrue(ConnectionIssue.NotRecognized.needsYou)
        assertEquals(
            "This phone is offline",
            ConnectionIssue.PhoneOffline.issueCopy("your Mac", "phone").title
        )
        assertEquals(
            "Your Mac no longer recognizes this phone",
            ConnectionIssue.NotRecognized.issueCopy("your Mac", "phone").title
        )
    }

    @Test
    fun `the status line says how the phone is connected`() {
        val now = Instant.parse("2026-10-15T12:00:00Z")
        fun line(issue: ConnectionIssue?, ready: Boolean = false, kind: AddressKind? = null) =
            LinkStatusLine.make(
                ready,
                demo = false,
                kind = kind,
                issue = issue,
                device = "phone",
                now = now
            ).text
        assertEquals(
            "Connected · over Tailscale",
            line(null, ready = true, kind = AddressKind.Tailscale)
        )
        assertEquals(
            "Connected · on your network",
            line(null, ready = true, kind = AddressKind.Home)
        )
        assertEquals("Connecting…", line(ConnectionIssue.Connecting(null)))
        assertEquals("Phone is offline", line(ConnectionIssue.PhoneOffline))
        assertEquals("lpm isn't running", line(ConnectionIssue.LpmNotRunning))
    }
}
