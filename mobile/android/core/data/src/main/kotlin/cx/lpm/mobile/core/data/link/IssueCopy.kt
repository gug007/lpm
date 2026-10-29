package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.mac.Farewell as MacFarewell
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** A button an issue offers. The screen decides how each is carried out. */
enum class IssueAction {
    Retry,
    PairAgain,
    CompareCode,
    TurnOnTailscale,
    SignInTailscale,
    TailscaleSettings,
    OpenAdmin,
    PhoneSettings,
    Details,
    EnterNewCode,
    Wake;

    fun label(issue: ConnectionIssue): String = when (this) {
        Retry -> if (issue is ConnectionIssue.Farewell) "Try now" else "Try again"
        PairAgain -> "Pair again"
        CompareCode -> "Compare code"
        TurnOnTailscale -> "Turn on"
        SignInTailscale -> "Sign in"
        TailscaleSettings -> "Set up"
        OpenAdmin -> "Open admin console"
        PhoneSettings -> "Open Settings"
        Details -> "Details"
        EnterNewCode -> "Enter a new code"
        Wake -> "Wake"
    }
}

/** `icon` is the iOS SF Symbol name; the screen maps it to its Material Symbol. */
data class IssueCopy(
    val title: String,
    val message: String,
    val icon: String,
    val tone: Tone,
    val actions: List<IssueAction>
) {
    enum class Tone { Waiting, Problem }
}

/**
 * The issue's words. `mac` names the machine in a sentence ("MacBook Pro", or "your
 * Mac" while its name is still an address); `device` is what this phone is called.
 */

fun ConnectionIssue.issueCopy(
    mac: String,
    device: String,
    zone: ZoneId = ZoneId.systemDefault()
): IssueCopy {
    val capMac = if (mac.startsWith("your ")) "Your " + mac.removePrefix("your ") else mac
    val waiting = IssueCopy.Tone.Waiting
    val problem = IssueCopy.Tone.Problem
    return when (this) {
        is ConnectionIssue.Connecting -> IssueCopy(
            "Connecting to $mac…",
            when (reason) {
                ReconnectReason.LeftWiFi -> "Left Wi-Fi. Reaching $mac away from home…"
                ReconnectReason.JoinedWiFi -> "Joined Wi-Fi. Looking for $mac on this network…"
                ReconnectReason.BackOnline -> "Back online. Reconnecting…"
                null -> "Checking its home and Tailscale addresses"
            },
            "arrow.triangle.2.circlepath",
            waiting,
            listOf(IssueAction.Details)
        )

        ConnectionIssue.PhoneOffline -> IssueCopy(
            "This $device is offline",
            "lpm reconnects when you're back online.",
            "wifi.slash",
            problem,
            listOf(IssueAction.PhoneSettings)
        )

        is ConnectionIssue.NotAnswering -> IssueCopy(
            "$capMac isn't answering",
            if (away) {
                "It may be asleep or off the internet. lpm keeps trying."
            } else {
                "It may be asleep, or lpm isn't open. lpm keeps trying."
            },
            "moon.zzz",
            problem,
            listOf(IssueAction.Retry, IssueAction.Wake, IssueAction.Details)
        )

        is ConnectionIssue.AwayNeedsTailscale -> awayCopy(setup, mac, capMac, device)

        ConnectionIssue.LpmNotRunning -> IssueCopy(
            "lpm isn't running on $mac",
            "Open lpm on the Mac, then try again.",
            "app.dashed",
            problem,
            listOf(IssueAction.Retry, IssueAction.Details)
        )

        ConnectionIssue.SecureFailed -> IssueCopy(
            "Couldn't connect securely",
            "Update lpm on $mac and lpm Link on this $device, then try again.",
            "lock.trianglebadge.exclamationmark",
            problem,
            listOf(IssueAction.Retry, IssueAction.PairAgain, IssueAction.Details)
        )

        ConnectionIssue.NotRecognized -> IssueCopy(
            "$capMac no longer recognizes this $device",
            "Pair again to keep using it here.",
            "macbook.and.iphone",
            problem,
            listOf(IssueAction.PairAgain)
        )

        ConnectionIssue.RemovedOnMac -> IssueCopy(
            "This $device was removed on $mac",
            "Pair it on that Mac itself to use it here again.",
            "iphone.slash",
            problem,
            listOf(IssueAction.PairAgain)
        )

        ConnectionIssue.IdentityChanged -> IssueCopy(
            "Check that it's $mac",
            "It has a new security identity. Compare a short code before connecting.",
            "exclamationmark.shield",
            problem,
            listOf(IssueAction.CompareCode)
        )

        ConnectionIssue.IdentityRejected -> IssueCopy(
            "Identity check failed",
            "lpm stopped connecting to $mac to keep this $device safe. " +
                "Pair again when you're next to it.",
            "xmark.shield",
            problem,
            listOf(IssueAction.PairAgain)
        )

        is ConnectionIssue.Farewell -> farewellCopy(farewell, mac, capMac, zone)

        is ConnectionIssue.PairUnreachable -> IssueCopy(
            "$capMac isn't answering",
            if (overTailscale) {
                "Check that lpm is open and Tailscale is connected on both devices."
            } else {
                "Check that lpm is open and you're on the same Wi-Fi."
            },
            "wifi.exclamationmark",
            problem,
            listOf(IssueAction.Retry, IssueAction.Details)
        )

        ConnectionIssue.CodeRejected -> IssueCopy(
            "That code didn't work",
            "Codes work once and expire after 10 minutes. " +
                "Get a new one in lpm: click + above your projects, then Phone.",
            "key.slash",
            problem,
            listOf(IssueAction.EnterNewCode)
        )

        ConnectionIssue.PairingUnavailable -> IssueCopy(
            "$capMac couldn't save this pairing",
            "lpm on the Mac shows what to fix under + above your projects → Phone. " +
                "Then pair again.",
            "exclamationmark.triangle",
            problem,
            listOf(IssueAction.Retry)
        )

        ConnectionIssue.QrMismatch -> IssueCopy(
            "This QR code doesn't match the Mac",
            "Show a fresh code in lpm (+ above your projects → Phone), then scan again.",
            "qrcode",
            problem,
            listOf(IssueAction.EnterNewCode)
        )

        is ConnectionIssue.RelayOffline -> IssueCopy(
            "$via isn't connected to $mac",
            "$capMac may be asleep, or lpm isn't open on it. lpm keeps trying.",
            "point.3.connected.trianglepath.dotted",
            problem,
            listOf(IssueAction.Retry, IssueAction.Details)
        )

        is ConnectionIssue.RelayUnsupported -> IssueCopy(
            "Update lpm on $mac",
            "It needs a newer lpm to open through $via.",
            "arrow.up.circle",
            problem,
            listOf(IssueAction.Retry)
        )
    }
}

private fun awayCopy(setup: AwaySetup, mac: String, capMac: String, device: String): IssueCopy {
    val problem = IssueCopy.Tone.Problem
    return when (setup) {
        AwaySetup.TurnOn -> IssueCopy(
            "Built-in Tailscale is off",
            "Turn it on to reach $mac away from home.",
            "network",
            problem,
            listOf(IssueAction.TurnOnTailscale, IssueAction.Details)
        )

        AwaySetup.SignIn -> IssueCopy(
            "Sign in to Built-in Tailscale",
            "Sign in once with your Tailscale account to reach $mac from here.",
            "network",
            problem,
            listOf(IssueAction.SignInTailscale, IssueAction.Details)
        )

        AwaySetup.WaitingApproval -> IssueCopy(
            "Waiting for Tailscale approval",
            "Your Tailscale network asks an admin to approve this $device first.",
            "network",
            IssueCopy.Tone.Waiting,
            listOf(IssueAction.OpenAdmin, IssueAction.Details)
        )

        AwaySetup.Broken -> IssueCopy(
            "Built-in Tailscale can't connect",
            "Open its settings to see what's wrong.",
            "network",
            problem,
            listOf(IssueAction.TailscaleSettings, IssueAction.Details)
        )

        AwaySetup.MacSetup -> IssueCopy(
            "$capMac only answers on its home network",
            "Set up Tailscale on the Mac and this $device to use lpm from anywhere.",
            "network",
            problem,
            listOf(IssueAction.TailscaleSettings, IssueAction.Details)
        )

        AwaySetup.App -> IssueCopy(
            "Can't reach $mac over Tailscale",
            "Check that the Tailscale app is connected on this $device and the Mac is awake.",
            "network",
            problem,
            listOf(IssueAction.Retry, IssueAction.Details)
        )
    }
}

private fun farewellCopy(
    farewell: MacFarewell,
    mac: String,
    capMac: String,
    zone: ZoneId
): IssueCopy {
    val time = DateTimeFormatter.ofLocalizedTime(
        FormatStyle.SHORT
    ).withZone(zone).format(farewell.at)
    val waiting = IssueCopy.Tone.Waiting
    return when (farewell.reason) {
        MacFarewell.Reason.Sleep -> IssueCopy(
            "$capMac is asleep",
            "Since $time. Wake it and lpm reconnects by itself.",
            "moon.fill",
            waiting,
            listOf(IssueAction.Wake, IssueAction.Retry)
        )

        MacFarewell.Reason.Quit -> IssueCopy(
            "lpm was closed on $mac",
            "Open lpm on the Mac to keep going.",
            "app.dashed",
            waiting,
            listOf(IssueAction.Retry)
        )

        MacFarewell.Reason.Off -> IssueCopy(
            "Remote control is off on $mac",
            "Turn it on in lpm: click + above your projects, then Phone.",
            "iphone.slash",
            waiting,
            listOf(IssueAction.Retry)
        )
    }
}

/** A clock time, with the day in front when it isn't today. */
fun Instant.clockStamp(now: Instant, zone: ZoneId = ZoneId.systemDefault()): String {
    val today = atZone(zone).toLocalDate() == now.atZone(zone).toLocalDate()
    val time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withZone(zone).format(this)
    if (today) return time
    return DateTimeFormatter.ofPattern("MMM d").withZone(zone).format(this) + ", " + time
}
