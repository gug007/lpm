package cx.lpm.mobile.core.data.mac

/**
 * The device lpm Link runs on: the name it pairs under, what copy calls it ("phone"
 * where iOS says "iPhone"/"iPad", an allowed platform difference), and lpm Link's
 * version ("1.74 (88)").
 */
data class ThisDevice(val name: String, val noun: String = "phone", val appVersion: String = "")
