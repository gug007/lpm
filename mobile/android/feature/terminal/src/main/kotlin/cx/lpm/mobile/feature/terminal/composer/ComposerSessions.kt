package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestComposerActions
import cx.lpm.mobile.core.data.client.runTransform
import cx.lpm.mobile.core.data.client.sendComposerDraft
import cx.lpm.mobile.core.data.client.uploadAbort
import cx.lpm.mobile.core.data.client.uploadBegin
import cx.lpm.mobile.core.data.client.uploadBlob
import cx.lpm.mobile.core.data.client.uploadChunk
import cx.lpm.mobile.core.data.client.uploadDone
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.terminals.ComposerPrompts
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.TerminalInfo
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The session's composers (iOS AppModel's composer area): one [ComposerStore] per
 * terminal, created on first use and kept until the terminal closes or the session
 * starts over, plus the Mac's AI rewrite actions and how many variants each asks
 * for this session.
 */
class ComposerSessions(
    private val session: MacSession,
    private val media: ComposerMedia,
    private val io: CoroutineDispatcher,
    private val deviceNoun: String,
    private val now: () -> Long = System::currentTimeMillis
) : ComposerPrompts {
    private val stores = mutableMapOf<String, ComposerStore>()

    // reqId → terminal id, routing each rewrite reply to its composer.
    private val transformRoutes = mutableMapOf<String, String>()

    private val actions = MutableStateFlow<List<ComposerAction>>(emptyList())

    /** The Mac's enabled composer actions, for "Rewrite with AI". */
    val composerActions: StateFlow<List<ComposerAction>> = actions.asStateFlow()

    private val counts = MutableStateFlow<Map<String, Int>>(emptyMap())

    /** Variants per rewrite action (1–5), remembered for the session. */
    val variantCounts: StateFlow<Map<String, Int>> = counts.asStateFlow()

    private var closedWatch: Job? = null
    private val link = SessionLink()

    /** The composer for a terminal, made on first use. */
    fun store(termId: String, project: String, label: String): ComposerStore =
        stores.getOrPut(termId) {
            ComposerStore(termId, project, label, link, media, session.scope, io, now)
        }

    override fun append(termId: String, text: String) {
        stores[termId]?.appendText(text)
    }

    /** Hand what was typed for a tab to the tab lpm reopened in its place. */
    fun carryDraft(from: String, to: TerminalInfo) {
        val draft = stores.remove(from) ?: return
        store(to.id, to.project, to.label).adoptDraft(draft)
        draft.dispose()
    }

    fun setVariantCount(key: String, count: Int) =
        counts.update { it + (key to count.coerceIn(1, MAX_VARIANTS)) }

    fun loadComposerActions() {
        session.client?.requestComposerActions()
    }

    override fun wire(client: LpmClient) {
        if (closedWatch == null) {
            // A terminal closed from this phone takes its drafts with it.
            closedWatch = session.scope.launch {
                session.store<TerminalsStore>().closedTerminals.collect { id ->
                    stores.remove(id)?.dispose()
                }
            }
        }
        client.onUpload = { id, reqId, path -> stores[id]?.resolveUpload(reqId, path) }
        client.onUploadStep = { step -> stores[step.termId]?.applyUploadStep(step) }
        client.onComposerActions = { actions.value = it }
        client.onTransformVariant = { reqId, idx, text, error ->
            transformRoutes[reqId]?.let {
                stores[it]?.receiveTransformVariant(reqId, idx, text, error)
            }
        }
        client.onTransformDone = { reqId, ok ->
            transformRoutes.remove(reqId)?.let { stores[it]?.finishTransform(reqId, ok) }
        }
        client.onComposerDraft = { id, text, rev, origin, isSeed ->
            stores[id]?.applyRemoteDraft(text, rev, origin, isSeed)
        }
    }

    override fun reset() {
        stores.values.forEach { it.dispose() }
        stores.clear()
        transformRoutes.clear()
        actions.value = emptyList()
        counts.value = emptyMap()
    }

    /** A lost reply can't leave a chip uploading and Send blocked. */
    override fun onConnectionReset() = stores.values.forEach { it.failInFlightUploads() }

    private inner class SessionLink : ComposerLink {
        private val client: LpmClient? get() = session.client

        override val selfDeviceId: String? get() = client?.deviceId
        override val isReady: Boolean get() = session.state.value.isReady && client != null
        override val takesFilesInPieces: Boolean
            get() = client?.hostFeatures?.contains(LpmClient.FILE_UPLOAD_FEATURE) == true
        override val deviceNoun: String get() = this@ComposerSessions.deviceNoun

        override fun sendDraft(termId: String, text: String) {
            client?.sendComposerDraft(termId, text)
        }

        override fun sendUpload(
            termId: String,
            b64: String,
            mime: String,
            name: String?,
            reqId: String
        ) {
            client?.uploadBlob(termId, b64, mime, name, reqId)
        }

        override fun runTransform(
            termId: String,
            project: String,
            instruction: String,
            text: String,
            variants: Int
        ): String {
            val reqId = UUID.randomUUID().toString()
            transformRoutes[reqId] = termId
            client?.runTransform(reqId, project, instruction, text, variants)
            return reqId
        }

        override fun clearTransformRoute(reqId: String?) {
            if (reqId != null) transformRoutes.remove(reqId)
        }

        override fun uploadBegin(termId: String, name: String, bytes: Long, reqId: String) {
            client?.uploadBegin(termId, name, bytes, reqId)
        }

        override fun uploadChunk(
            termId: String,
            uploadId: String,
            offset: Long,
            b64: String,
            reqId: String
        ) {
            client?.uploadChunk(termId, uploadId, offset, b64, reqId)
        }

        override fun uploadDone(termId: String, uploadId: String, reqId: String) {
            client?.uploadDone(termId, uploadId, reqId)
        }

        override fun uploadAbort(termId: String, uploadId: String) {
            client?.uploadAbort(termId, uploadId)
        }
    }

    private companion object {
        const val MAX_VARIANTS = 5
    }
}
