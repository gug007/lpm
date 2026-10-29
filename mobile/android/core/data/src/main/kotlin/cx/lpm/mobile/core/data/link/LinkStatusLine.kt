package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.mac.Farewell
import java.time.Instant
import java.time.ZoneId

/** The line under the Mac's name: how the phone is connected, or why it isn't. */
data class LinkStatusLine(val text: String, val tone: Tone, val pulse: Boolean = false) {
    enum class Tone { Live, Waiting, Problem }

    companion object {
        /**
         * `slow` is a connect that has gone on long enough to say so, `route` how the
         * phone expects to reach the Mac from its network, and `found` a Mac just
         * found at a new address on this network.
         */
        fun make(
            ready: Boolean,
            demo: Boolean,
            kind: AddressKind?,
            issue: ConnectionIssue?,
            device: String,
            now: Instant,
            slow: Boolean = false,
            route: AddressKind? = null,
            found: Boolean = false,
            via: String? = null,
            zone: ZoneId = ZoneId.systemDefault()
        ): LinkStatusLine {
            if (demo) return LinkStatusLine("Demo · sample projects", Tone.Live)
            if (ready && via != null) return LinkStatusLine("Connected · through $via", Tone.Live)
            if (ready) {
                val text = when (kind) {
                    AddressKind.Tailscale -> "Connected · over Tailscale"
                    AddressKind.Internet -> "Connected · over the internet"
                    else -> "Connected · on your network"
                }
                return LinkStatusLine(text, Tone.Live)
            }
            return when (issue) {
                is ConnectionIssue.Connecting, null -> when {
                    slow -> LinkStatusLine("Still connecting", Tone.Waiting, pulse = true)
                    found -> LinkStatusLine("Found it, reconnecting…", Tone.Waiting, pulse = true)
                    else -> LinkStatusLine(connecting(route), Tone.Waiting, pulse = true)
                }

                is ConnectionIssue.Farewell -> when (issue.farewell.reason) {
                    Farewell.Reason.Sleep ->
                        LinkStatusLine(
                            "Asleep since ${issue.farewell.at.clockStamp(now, zone)}",
                            Tone.Waiting
                        )

                    Farewell.Reason.Quit -> LinkStatusLine("lpm is closed", Tone.Waiting)

                    Farewell.Reason.Off -> LinkStatusLine("Remote control is off", Tone.Waiting)
                }

                is ConnectionIssue.NotAnswering, is ConnectionIssue.PairUnreachable ->
                    LinkStatusLine("Not answering", Tone.Problem)

                ConnectionIssue.LpmNotRunning -> LinkStatusLine("lpm isn't running", Tone.Problem)

                is ConnectionIssue.AwayNeedsTailscale -> if (issue.setup == AwaySetup.App) {
                    LinkStatusLine("Can't reach it over Tailscale", Tone.Problem)
                } else {
                    LinkStatusLine("Not connected", Tone.Problem)
                }

                ConnectionIssue.PhoneOffline ->
                    LinkStatusLine(
                        "${device.replaceFirstChar(Char::uppercase)} is offline",
                        Tone.Problem
                    )

                ConnectionIssue.NotRecognized, ConnectionIssue.IdentityRejected ->
                    LinkStatusLine("Not paired", Tone.Problem)

                ConnectionIssue.RemovedOnMac -> LinkStatusLine("Removed on that Mac", Tone.Problem)

                ConnectionIssue.IdentityChanged -> LinkStatusLine(
                    "Check its identity",
                    Tone.Problem
                )

                is ConnectionIssue.RelayOffline -> LinkStatusLine(
                    "Not connected to ${issue.via}",
                    Tone.Problem
                )

                is ConnectionIssue.RelayUnsupported -> LinkStatusLine(
                    "Needs an lpm update",
                    Tone.Problem
                )

                else -> LinkStatusLine("Not connected", Tone.Problem)
            }
        }

        private fun connecting(route: AddressKind?): String = when (route) {
            AddressKind.Tailscale -> "Connecting over Tailscale…"
            AddressKind.Internet -> "Connecting over the internet…"
            AddressKind.Home, AddressKind.LocalName -> "Connecting on your network…"
            else -> "Connecting…"
        }
    }
}

/**
 * The short code both screens show for a Mac's security identity: the start of its
 * certificate fingerprint, grouped for reading aloud. lpm on the Mac shows the same
 * code under + above your projects → Phone.
 */
object IdentityCode {
    fun of(fingerprint: String): String {
        val hex = fingerprint.filter {
            it in '0'..'9' || it.lowercaseChar() in 'a'..'f'
        }.uppercase()
        if (hex.length < 12) return hex
        return hex.take(12).chunked(4).joinToString(" · ")
    }
}
