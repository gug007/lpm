package cx.lpm.mobile.core.protocol

/**
 * The Mac reads frames of up to 16 MiB and attachments ride as base64, a third
 * bigger, so one note carries at most this many bytes of files.
 */
const val NOTE_ATTACHMENT_BUDGET = 10 * 1024 * 1024

/**
 * [items] in order, in groups whose [bytes] each fit one note; one empty group for
 * none. One frame too big for the Mac drops the link, so what is past the budget
 * goes as further notes.
 */
fun <T> noteGroups(items: List<T>, bytes: (T) -> Int): List<List<T>> {
    val groups = mutableListOf<List<T>>()
    var current = mutableListOf<T>()
    var size = 0
    for (item in items) {
        val n = bytes(item)
        if (current.isNotEmpty() && size + n > NOTE_ATTACHMENT_BUDGET) {
            groups += current
            current = mutableListOf()
            size = 0
        }
        current += item
        size += n
    }
    groups += current
    return groups
}
