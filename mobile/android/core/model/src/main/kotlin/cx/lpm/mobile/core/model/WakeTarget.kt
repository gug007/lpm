package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** A network card a Mac can be woken through, as it said in `ready` (iOS `WakeTarget`). */
data class WakeTarget(val mac: String, val ip: String, val broadcast: String) {
    fun toJson(): JsonObject = buildJsonObject {
        put("mac", mac)
        put("ip", ip)
        put("broadcast", broadcast)
    }

    companion object {
        fun parse(o: JsonObject): WakeTarget? {
            val mac = o.string("mac") ?: return null
            val ip = o.string("ip") ?: return null
            if (hardwareAddress(mac) == null) return null
            return WakeTarget(mac, ip, o.string("broadcast") ?: "255.255.255.255")
        }

        fun hardwareAddress(text: String): ByteArray? {
            val bytes = text.split(':', '-').map { it.toIntOrNull(16) ?: return null }
            if (bytes.size != 6 || bytes.any { it !in 0..255 }) return null
            return ByteArray(6) { bytes[it].toByte() }
        }

        /** Six 0xFF bytes, then the hardware address sixteen times. */
        fun magicPacket(mac: ByteArray): ByteArray =
            ByteArray(6) { 0xff.toByte() } + (1..16).flatMap { mac.toList() }.toByteArray()
    }
}
