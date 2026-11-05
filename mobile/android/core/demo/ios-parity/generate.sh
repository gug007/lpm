#!/bin/sh
# Regenerates src/test/resources/ios-parity/{script,expected}.jsonl: the frames in
# script.py, answered by the iOS DemoServer (mobile/ios/Sources/LpmMobile/Demo*.swift)
# compiled for macOS with virtual time (patch.py). IosParityTest then checks that the
# Android port answers the same script the same way. Run it after changing the iOS demo.
# Needs swiftc (Xcode) and python3. The clock and zone match DemoHarness.kt.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
ios=${IOS_SOURCES:-"$here/../../../../ios/Sources/LpmMobile"}
out="$here/../src/test/resources/ios-parity"
png="$here/../../../../shared/demo/summary-card.png"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp "$ios"/Demo*.swift "$ios/WorkStatusModel.swift" "$ios/ActionInputDrafts.swift" "$ios/AgentCommand.swift" \
    "$ios/AgentDialog.swift" "$work/"
# Demo Mode's dictation engine stands in for the microphone, not the Mac: no frame reaches it.
rm "$work/DemoDictation.swift"
python3 "$here/patch.py" "$work"
cp "$here/Stubs.swift" "$work/Stubs.swift"
cp "$here/Harness.swift" "$work/main.swift"
swiftc -O "$work"/*.swift -o "$work/demo-harness"

mkdir -p "$out"
python3 "$here/script.py" "$png" > "$out/script.jsonl"
TZ=America/New_York DEMO_BASE_MS=1792089000123 DEMO_PNG="$png" \
    "$work/demo-harness" "$out/script.jsonl" > "$out/expected.jsonl"
echo "$(wc -l < "$out/expected.jsonl") iOS replies in $out/expected.jsonl"
