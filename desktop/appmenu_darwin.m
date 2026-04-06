#import <Cocoa/Cocoa.h>

extern void checkForUpdatesClicked(void);
extern void openSettingsClicked(void);

static NSString *_aboutVersion = nil;

@interface LPMAppMenuHandler : NSObject
+ (instancetype)shared;
- (void)checkForUpdates:(NSMenuItem *)sender;
- (void)openSettings:(NSMenuItem *)sender;
- (void)showAbout:(NSMenuItem *)sender;
@end

@implementation LPMAppMenuHandler
+ (instancetype)shared {
    static LPMAppMenuHandler *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[LPMAppMenuHandler alloc] init];
    });
    return instance;
}

- (void)checkForUpdates:(NSMenuItem *)sender {
    checkForUpdatesClicked();
}

- (void)openSettings:(NSMenuItem *)sender {
    openSettingsClicked();
}

- (void)showAbout:(NSMenuItem *)sender {
    NSAlert *alert = [[NSAlert alloc] init];
    [alert setAlertStyle:NSAlertStyleInformational];
    [alert setMessageText:@"lpm — Local Project Manager"];

    // Load the app icon
    NSString *iconPath = [[NSBundle mainBundle] pathForResource:@"iconfile" ofType:@"icns"];
    if (iconPath) {
        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        if (icon) [alert setIcon:icon];
    }

    // Build the informative text with a clickable link
    NSString *version = _aboutVersion ?: @"dev";
    NSInteger year = [[NSCalendar currentCalendar]
        component:NSCalendarUnitYear fromDate:[NSDate date]];

    NSString *line1 = [NSString stringWithFormat:@"Version %@\n\n", version];
    NSString *line2 = @"Start, stop, and switch between dev projects. "
                       "Built-in terminals and AI, all in one app.\n\n";
    NSString *linkText = @"lpm.cx";
    NSString *line3 = [NSString stringWithFormat:@"\n© %ld", (long)year];

    NSMutableAttributedString *attr = [[NSMutableAttributedString alloc] init];

    NSDictionary *normalAttrs = @{
        NSFontAttributeName: [NSFont systemFontOfSize:13],
        NSForegroundColorAttributeName: [NSColor secondaryLabelColor],
    };

    [attr appendAttributedString:[[NSAttributedString alloc] initWithString:line1 attributes:normalAttrs]];
    [attr appendAttributedString:[[NSAttributedString alloc] initWithString:line2 attributes:normalAttrs]];

    // Clickable link
    NSDictionary *linkAttrs = @{
        NSFontAttributeName: [NSFont systemFontOfSize:13],
        NSLinkAttributeName: [NSURL URLWithString:@"https://lpm.cx"],
    };
    [attr appendAttributedString:[[NSAttributedString alloc] initWithString:linkText attributes:linkAttrs]];

    [attr appendAttributedString:[[NSAttributedString alloc] initWithString:line3 attributes:normalAttrs]];

    // Use an NSTextView as the accessory view so the link is clickable
    NSTextView *textView = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 280, 120)];
    [[textView textStorage] setAttributedString:attr];
    [textView setEditable:NO];
    [textView setSelectable:YES];
    [textView setDrawsBackground:NO];
    [textView setAlignment:NSTextAlignmentCenter];

    // Remove the text container inset so text aligns nicely
    [textView setTextContainerInset:NSMakeSize(0, 0)];

    [alert setAccessoryView:textView];
    [alert.window setLevel:NSFloatingWindowLevel];
    [alert runModal];
}
@end

static NSInteger indexAfterAbout(NSMenu *appSubmenu) {
    for (NSInteger i = 0; i < appSubmenu.numberOfItems; i++) {
        NSMenuItem *item = [appSubmenu itemAtIndex:i];
        if ([item.title hasPrefix:@"About "]) {
            return i + 1;
        }
    }
    return 0;
}

static void insertCheckForUpdatesItem(NSMenu *appSubmenu) {
    // Idempotent: skip if already present
    for (NSMenuItem *item in appSubmenu.itemArray) {
        if (item.action == @selector(checkForUpdates:)) return;
    }

    NSInteger insertIndex = indexAfterAbout(appSubmenu);

    [appSubmenu insertItem:[NSMenuItem separatorItem] atIndex:insertIndex];
    NSMenuItem *checkItem = [[NSMenuItem alloc] initWithTitle:@"Check for Updates…"
                                                       action:@selector(checkForUpdates:)
                                                keyEquivalent:@""];
    [checkItem setTarget:[LPMAppMenuHandler shared]];
    [appSubmenu insertItem:checkItem atIndex:insertIndex + 1];
}

static void insertSettingsItem(NSMenu *appSubmenu) {
    // Idempotent: skip if already present
    for (NSMenuItem *item in appSubmenu.itemArray) {
        if (item.action == @selector(openSettings:)) return;
    }

    NSInteger insertIndex = indexAfterAbout(appSubmenu);

    [appSubmenu insertItem:[NSMenuItem separatorItem] atIndex:insertIndex];
    NSMenuItem *settingsItem = [[NSMenuItem alloc] initWithTitle:@"Settings…"
                                                          action:@selector(openSettings:)
                                                   keyEquivalent:@","];
    [settingsItem setKeyEquivalentModifierMask:NSEventModifierFlagCommand];
    [settingsItem setTarget:[LPMAppMenuHandler shared]];
    [appSubmenu insertItem:settingsItem atIndex:insertIndex + 1];
}

static void overrideAboutItem(NSMenu *appSubmenu) {
    for (NSMenuItem *item in appSubmenu.itemArray) {
        if ([item.title hasPrefix:@"About "]) {
            [item setTarget:[LPMAppMenuHandler shared]];
            [item setAction:@selector(showAbout:)];
            return;
        }
    }
}

static void insertAppMenuItems(void) {
    NSMenu *mainMenu = [[NSApplication sharedApplication] mainMenu];
    if (!mainMenu || mainMenu.numberOfItems == 0) return;

    NSMenuItem *appMenuItem = [mainMenu itemAtIndex:0];
    NSMenu *appSubmenu = appMenuItem.submenu;
    if (!appSubmenu) return;

    overrideAboutItem(appSubmenu);

    // Insert Check for Updates first, then Settings — Settings lands
    // immediately after About, pushing Check for Updates below it.
    insertCheckForUpdatesItem(appSubmenu);
    insertSettingsItem(appSubmenu);
}

static void installWithRetry(int remaining) {
    NSMenu *mainMenu = [[NSApplication sharedApplication] mainMenu];
    if (mainMenu && mainMenu.numberOfItems > 0) {
        insertAppMenuItems();
        return;
    }
    if (remaining <= 0) return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{ installWithRetry(remaining - 1); });
}

void setAboutVersion(const char *version) {
    _aboutVersion = [NSString stringWithUTF8String:version];
}

void installCheckForUpdatesMenuItem(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ installWithRetry(20); });
}
