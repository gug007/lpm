#import <Cocoa/Cocoa.h>

extern void checkForUpdatesClicked(void);

@interface LPMAppMenuHandler : NSObject
+ (instancetype)shared;
- (void)checkForUpdates:(NSMenuItem *)sender;
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
@end

static void insertCheckForUpdatesItem(void) {
    NSMenu *mainMenu = [[NSApplication sharedApplication] mainMenu];
    if (!mainMenu || mainMenu.numberOfItems == 0) return;

    NSMenuItem *appMenuItem = [mainMenu itemAtIndex:0];
    NSMenu *appSubmenu = appMenuItem.submenu;
    if (!appSubmenu) return;

    // Idempotent: skip if already present
    for (NSMenuItem *item in appSubmenu.itemArray) {
        if (item.action == @selector(checkForUpdates:)) return;
    }

    // Anchor after the "About …" item; fall back to top of menu
    NSInteger insertIndex = 0;
    for (NSInteger i = 0; i < appSubmenu.numberOfItems; i++) {
        NSMenuItem *item = [appSubmenu itemAtIndex:i];
        if ([item.title hasPrefix:@"About "]) {
            insertIndex = i + 1;
            break;
        }
    }

    [appSubmenu insertItem:[NSMenuItem separatorItem] atIndex:insertIndex];
    NSMenuItem *checkItem = [[NSMenuItem alloc] initWithTitle:@"Check for Updates…"
                                                       action:@selector(checkForUpdates:)
                                                keyEquivalent:@""];
    [checkItem setTarget:[LPMAppMenuHandler shared]];
    [appSubmenu insertItem:checkItem atIndex:insertIndex + 1];
}

static void installWithRetry(int remaining) {
    NSMenu *mainMenu = [[NSApplication sharedApplication] mainMenu];
    if (mainMenu && mainMenu.numberOfItems > 0) {
        insertCheckForUpdatesItem();
        return;
    }
    if (remaining <= 0) return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{ installWithRetry(remaining - 1); });
}

void installCheckForUpdatesMenuItem(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ installWithRetry(20); });
}
