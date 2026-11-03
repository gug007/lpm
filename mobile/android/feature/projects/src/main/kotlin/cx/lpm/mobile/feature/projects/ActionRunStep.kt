package cx.lpm.mobile.feature.projects

import cx.lpm.mobile.core.model.Action

/** Where running a picked action stands: its inputs, then its confirmation. */
sealed interface ActionRunStep {
    data class Inputs(val action: Action) : ActionRunStep

    data class Confirm(val action: Action, val values: Map<String, String>) : ActionRunStep
}
