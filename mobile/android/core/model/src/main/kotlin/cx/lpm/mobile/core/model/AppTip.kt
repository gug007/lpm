package cx.lpm.mobile.core.model

/** A tip shown once, where the feature it points at first becomes useful. */
enum class AppTip(val id: String) {
    ProjectMenu("projectMenu"),
    TabMenu("tabMenu"),
    Actions("actions"),
    Review("review")
}
