"""Puts copies of the iOS Demo*.swift files on virtual time, for macOS.

Date() reads demoNow() and main-queue timers go through demoAfter(), both defined in
Harness.swift. The notes image, which the app loads from its bundle (mobile/shared/demo),
is read from DEMO_PNG instead, and the popup page from the same folder.
"""
import glob
import os
import re
import sys

for path in glob.glob(os.path.join(sys.argv[1], 'Demo*.swift')):
    s = open(path).read()
    s = re.sub(r'DispatchQueue\.main\.asyncAfter\(deadline: \.now\(\) \+ (.*?)\) \{', r'demoAfter(\1) {', s)
    s = re.sub(r'Date\(timeIntervalSinceNow: (.*?)\)\)',
               r'Date(timeIntervalSince1970: demoNow().timeIntervalSince1970 + (\1)))', s)
    s = s.replace('Date()', 'demoNow()')
    if path.endswith('DemoNotes.swift'):
        s = s.replace('import UIKit\n', '')
        s = s[:s.index('/// The attached "screenshot"')] + (
            'private func demoSummaryCardPNG() -> Data {\n'
            '    try! Data(contentsOf: URL(fileURLWithPath: ProcessInfo.processInfo.environment["DEMO_PNG"]!))\n'
            '}\n')
    if path.endswith('DemoActionPopup.swift'):
        s = s[:s.index('/// The sample page')] + (
            'private func demoPopupPage() -> String {\n'
            '    let png = URL(fileURLWithPath: ProcessInfo.processInfo.environment["DEMO_PNG"]!)\n'
            '    return try! String(contentsOf: png.deletingLastPathComponent()\n'
            '        .appendingPathComponent("popup-stars.html"), encoding: .utf8)\n'
            '}\n')
    open(path, 'w').write(s)
