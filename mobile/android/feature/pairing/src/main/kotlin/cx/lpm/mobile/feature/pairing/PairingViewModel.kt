package cx.lpm.mobile.feature.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.MacBrowser
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.DEFAULT_MAC_PORT
import cx.lpm.mobile.core.tailnet.BuiltInTailscale
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Pairing a Mac: the first one, another from "Add a machine" ([adding]), or a saved
 * Mac again. Tailscale comes first so the pairing works from anywhere; then the Macs
 * found on this Wi-Fi (tap, then approve on the Mac), then the QR code and the
 * typed code. The demo stays one tap away for people without a Mac.
 */
@HiltViewModel(assistedFactory = PairingViewModel.Factory::class)
class PairingViewModel @AssistedInject constructor(
    @Assisted private val adding: Boolean,
    private val session: MacSession,
    private val tailscale: BuiltInTailscale,
    private val browser: MacBrowser
) : ViewModel() {
    private val local = MutableStateFlow(PairingUiState(adding = adding))
    private var lastScan: PairPayload? = null
    private var approvalHost = ""
    private var approvalPort = DEFAULT_MAC_PORT

    private val sessionPart =
        combine(session.state, session.link.state, session.link.views) { s, link, view ->
            val repair = link.repairMacId?.let { id -> s.macs.firstOrNull { it.localId == id } }
            PairingUiState(
                repair = repair,
                repairReason = link.repairReason,
                pairedServerIds =
                    s.macs.mapNotNull { it.serverId }.toSet() - setOfNotNull(repair?.serverId),
                issue = view.issue?.takeIf { link.pairing && !it.isConnecting },
                checks = link.checks,
                approval = s.approvalPairing
            )
        }

    private val tailscalePart =
        combine(tailscale.enabled, tailscale.status, session.preferences.data) { on, status, _ ->
            Triple(on, status, session.preferences.bool(PreferenceKeys.USES_TAILSCALE_APP) ?: false)
        }

    init {
        viewModelScope.launch {
            session.state
                .map { it.pairLink != null && if (adding) it.addingMac else it.macs.isEmpty() }
                .distinctUntilChanged()
                .collect { onShow -> if (onShow) receivePairLink() }
        }
    }

    val uiState: StateFlow<PairingUiState> =
        combine(sessionPart, tailscalePart, browser.browse, local) {
                s,
                (on, status, usesApp),
                browse,
                l
            ->
            l.copy(
                repair = s.repair,
                repairReason = s.repairReason,
                pairedServerIds = s.pairedServerIds,
                issue = s.issue,
                checks = s.checks,
                approval = s.approval,
                tailscaleEnabled = on,
                tailscale = status,
                usesTailscaleApp = usesApp,
                browse = browse
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), local.value)

    fun startDiscovery() = browser.start()

    fun stopDiscovery() = browser.stop()

    fun enterDemo() = session.enterDemo()

    /** "Cancel" on "Add a machine": back to the projects list and the Mac it showed. */
    fun cancelAdding() = session.cancelAddMac()

    // MARK: away from home

    fun setUpTailscale() = session.link.update { it.copy(tailscaleSettingsOpen = true) }

    fun useTailscaleApp() = session.preferences.setBool(PreferenceKeys.USES_TAILSCALE_APP, true)

    fun useBuiltInInstead() {
        session.preferences.setBool(PreferenceKeys.USES_TAILSCALE_APP, false)
        setUpTailscale()
    }

    fun pairLocalOnly() = local.update { it.copy(localOnly = true) }

    // MARK: QR

    fun startScan() = local.update { it.copy(scanning = true) }

    fun scanClosed() = local.update { it.copy(scanning = false) }

    /** A code that only works on this Wi-Fi waits for the user to say that's fine. */
    fun scanned(payload: PairPayload) {
        if (uiState.value.wifiOnly(payload)) {
            local.update { it.copy(heldScan = payload) }
        } else {
            pair(payload)
        }
    }

    // MARK: the Camera's code

    /**
     * Takes the Camera's code once this is the pairing screen on show, closing what
     * covers it first so the question isn't asked behind a sheet.
     */
    private fun receivePairLink() {
        val payload = session.takePairLink()?.let(PairPayload::parse) ?: return
        if (session.state.value.approvalPairing != null) session.cancelApprovalPairing()
        local.update {
            it.copy(
                scanning = false,
                heldScan = null,
                unreachable = null,
                linkToConfirm = payload
            )
        }
    }

    /**
     * Pairs the code the user said yes to. Without Tailscale on this phone that's
     * over the Wi-Fi, which the screen then says, with the ways to pair showing.
     */
    fun pairLink() {
        val payload = local.value.linkToConfirm ?: return
        val choose = !uiState.value.showsWaysToPair
        local.update { it.copy(linkToConfirm = null, localOnly = it.localOnly || choose) }
        pair(payload)
    }

    fun dropLink() = local.update { it.copy(linkToConfirm = null) }

    fun pairHeldScan() {
        local.value.heldScan?.let(::pair)
        local.update { it.copy(heldScan = null) }
    }

    fun dropHeldScan() = local.update { it.copy(heldScan = null) }

    private fun pair(payload: PairPayload) {
        lastScan = payload
        local.update { it.copy(showDetails = false) }
        session.pair(payload.hosts, payload.port, payload.code, payload.fingerprint)
    }

    // MARK: nearby Macs

    /**
     * Tap a nearby Mac: resolve its address and start approve-on-Mac pairing. A
     * machine that can't show the approval dialog (a headless host) goes straight to
     * the typed code with its address filled in.
     */
    fun selectNearby(mac: MacBrowser.DiscoveredMac) {
        local.update { it.copy(resolvingId = mac.id, unreachable = null) }
        viewModelScope.launch {
            val resolved = browser.resolve(mac)
            local.update { it.copy(resolvingId = null) }
            if (resolved == null) {
                local.update { it.copy(unreachable = mac) }
                return@launch
            }
            approvalHost = resolved.host
            approvalPort = resolved.port
            local.update { it.copy(approvalMacName = mac.displayName) }
            if (mac.requestPair) {
                session.pairViaApproval(resolved.host, resolved.port)
            } else {
                local.update { it.copy(codeTarget = CodeTarget(resolved.host, resolved.port)) }
            }
        }
    }

    fun dismissUnreachable() = local.update { it.copy(unreachable = null) }

    fun enterCode(target: CodeTarget = CodeTarget()) = local.update { it.copy(codeTarget = target) }

    fun codeTargetShown() = local.update { it.copy(codeTarget = null) }

    // MARK: approve on the Mac

    fun cancelApproval() = session.cancelApprovalPairing()

    fun retryApproval() {
        if (approvalHost.isEmpty()) return
        session.pairViaApproval(approvalHost, approvalPort)
    }

    fun enterCodeInstead() {
        session.cancelApprovalPairing()
        enterCode(CodeTarget(approvalHost, approvalPort))
    }

    // MARK: the issue card

    /** The pairing screen's own answers to an issue's buttons; false leaves it to the card. */
    fun handle(action: IssueAction): Boolean {
        when (action) {
            IssueAction.Retry -> lastScan?.let(::pair) ?: startScan()
            IssueAction.EnterNewCode -> startScan()
            IssueAction.Details -> local.update { it.copy(showDetails = !it.showDetails) }
            else -> return false
        }
        return true
    }

    override fun onCleared() = browser.stop()

    @AssistedFactory
    interface Factory {
        fun create(adding: Boolean): PairingViewModel
    }
}
