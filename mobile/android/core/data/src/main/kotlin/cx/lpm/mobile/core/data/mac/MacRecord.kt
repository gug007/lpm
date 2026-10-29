package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.model.WakeTarget
import cx.lpm.mobile.core.model.trimmingWhitespace
import java.time.Instant
import java.util.UUID

/**
 * One saved Mac the phone can connect to. The phone keeps several but talks to one
 * at a time (the active record). `localId` is the stable key the phone owns — it
 * names the per-Mac credential and survives before the Mac has told us its
 * `serverId`, the Mac's own identity used to recognize a re-paired Mac. `hosts` are
 * the addresses to race (LAN + Tailscale).
 */
data class MacRecord(
    val localId: String,
    val serverId: String? = null,
    /** The learned name — the Mac's server-provided name, or its first host until known. */
    val name: String,
    /** A name the user typed; wins over [name] and is never overwritten by learning. */
    val customName: String? = null,
    val hosts: List<String>,
    val port: Int,
    /** "macos"/"linux", learned on every connect; null until reported — treat as a Mac. */
    val platform: String? = null,
    val lastConnected: Instant? = null,
    val farewell: Farewell? = null,
    /** Set for a machine opened through another saved Mac instead of paired here. */
    val via: MacVia? = null,
    /** The network cards it can be woken through, as it last said in `ready`. */
    val wake: List<WakeTarget>? = null
) {
    val id: String get() = localId

    /** What the widgets file this Mac's rows under: its server id, or its local id for a Mac too old to send one. */
    val widgetId: String get() = serverId ?: localId

    val isLinuxHost: Boolean get() = platform == "linux"

    /** The user's custom name if set, otherwise the learned name (maybe an address). */
    val displayName: String get() = trimmedCustomName ?: name

    /**
     * True when the displayed name is really a network address — a migrated or
     * not-yet-identified Mac seeds `name` from its first host. A rename never is.
     */
    val isAddressName: Boolean
        get() {
            if (trimmedCustomName != null) return false
            val trimmed = name.trim(' ', '\t')
            if (trimmed in hosts) return true
            return looksLikeAddress(trimmed)
        }

    /** The address to show when [isAddressName], else the first host. */
    val displayAddress: String
        get() = if (isAddressName) name.trim(' ', '\t') else hosts.firstOrNull() ?: displayName

    private val trimmedCustomName: String?
        get() = customName?.trimmingWhitespace()?.ifEmpty { null }

    companion object {
        fun newLocalId(): String = UUID.randomUUID().toString().uppercase()

        private val ipv6Chars = "0123456789abcdefABCDEF:".toSet()

        internal fun looksLikeAddress(s: String): Boolean {
            if (s.isEmpty()) return false
            val octets = s.split(".")
            if (octets.size == 4 &&
                octets.all { it.toIntOrNull()?.let { n -> n in 0..255 } == true }
            ) {
                return true
            }
            if (':' in s) {
                val core = s.substringBefore('%')
                if (core.all { it in ipv6Chars }) return true
            }
            return false
        }
    }
}

/** Where a machine opened through another Mac is reached: that Mac and its slug there. */
data class MacVia(val macId: String, val slug: String)

/**
 * Why the Mac said it was going away, so the phone can say "asleep" instead of
 * guessing at network problems. Saved per Mac until it connects again.
 */
data class Farewell(val reason: Reason, val at: Instant) {
    enum class Reason(val rawValue: String) {
        Sleep("sleep"),
        Quit("quit"),
        Off("off");

        companion object {
            fun of(raw: String): Reason? = entries.firstOrNull { it.rawValue == raw }
        }
    }
}
