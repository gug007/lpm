#import <Cocoa/Cocoa.h>

extern void checkForUpdatesClicked(void);
extern void openSettingsClicked(void);

@interface LPMAppMenuHandler : NSObject
+ (instancetype)shared;
- (void)checkForUpdates:(NSMenuItem *)sender;
- (void)openSettings:(NSMenuItem *)sender;
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

static void insertAppMenuItems(void) {
    NSMenu *mainMenu = [[NSApplication sharedApplication] mainMenu];
    if (!mainMenu || mainMenu.numberOfItems == 0) return;

    NSMenuItem *appMenuItem = [mainMenu itemAtIndex:0];
    NSMenu *appSubmenu = appMenuItem.submenu;
    if (!appSubmenu) return;

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

void installCheckForUpdatesMenuItem(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ installWithRetry(20); });
}
