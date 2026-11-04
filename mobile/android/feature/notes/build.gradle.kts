plugins {
    alias(libs.plugins.lpm.android.feature)
}

dependencies {
    implementation(projects.core.ui)
    implementation(libs.androidx.activity.compose)

    testImplementation(projects.core.testing)
}
