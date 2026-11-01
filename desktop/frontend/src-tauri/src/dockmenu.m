#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// Implemented in Rust (dockmenu.rs): focuses the main window and emits
// "dock-project-selected" for the chosen project.
extern void dockMenuItemClicked(const char *name);
// Implemented in Rust (dockmenu.rs): sets the Keep awake mode ("agents",
// "always", "off") or a set time in minutes ("60").
extern void dockKeepAwakeClicked(const char *choice);

static NSMutableArray<NSString *> *_projectNames = nil;
static NSMutableArray<NSNumber *> *_projectRunning = nil;
static NSString *_keepAwakeMode = nil;
static BOOL _keepAwakeSupported = NO;

@interface LPMDockMenuHandler : NSObject
+ (instancetype)shared;
- (void)projectSelected:(NSMenuItem *)sender;
- (void)keepAwakeSelected:(NSMenuItem *)sender;
@end

@implementation LPMDockMenuHandler
+ (instancetype)shared {
    static LPMDockMenuHandler *instance = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ instance = [[LPMDockMenuHandler alloc] init]; });
    return instance;
}
- (void)projectSelected:(NSMenuItem *)sender {
    dockMenuItemClicked([sender.representedObject UTF8String]);
}
- (void)keepAwakeSelected:(NSMenuItem *)sender {
    dockKeepAwakeClicked([sender.representedObject UTF8String]);
}
@end

static void addKeepAwakeChoice(NSMenu *menu, NSString *title, NSString *choice) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title
                                                  action:@selector(keepAwakeSelected:)
                                           keyEquivalent:@""];
    item.target = [LPMDockMenuHandler shared];
    item.representedObject = choice;
    item.state = [choice isEqualToString:_keepAwakeMode] ? NSControlStateValueOn : NSControlStateValueOff;
    [menu addItem:item];
}

static NSMenuItem *keepAwakeItem(void) {
    NSMenu *submenu = [[NSMenu alloc] initWithTitle:@"Keep Awake"];
    if ([_keepAwakeMode isEqualToString:@"timed"]) {
        NSMenuItem *timed = [[NSMenuItem alloc] initWithTitle:@"For a Set Time" action:nil keyEquivalent:@""];
        timed.state = NSControlStateValueOn;
        timed.enabled = NO;
        [submenu addItem:timed];
        [submenu addItem:[NSMenuItem separatorItem]];
    }
    addKeepAwakeChoice(submenu, @"While Agents Work", @"agents");
    addKeepAwakeChoice(submenu, @"For 1 Hour", @"60");
    addKeepAwakeChoice(submenu, @"For 2 Hours", @"120");
    addKeepAwakeChoice(submenu, @"For 4 Hours", @"240");
    addKeepAwakeChoice(submenu, @"Until Turned Off", @"always");
    [submenu addItem:[NSMenuItem separatorItem]];
    addKeepAwakeChoice(submenu, @"Off", @"off");
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:@"Keep Awake" action:nil keyEquivalent:@""];
    item.submenu = submenu;
    return item;
}

static NSMenu *lpm_applicationDockMenu(id self, SEL _cmd, NSApplication *sender) {
    BOOL hasProjects = _projectNames && _projectNames.count > 0;
    if (!hasProjects && !_keepAwakeSupported) return nil;
    NSMenu *menu = [[NSMenu alloc] init];
    for (NSUInteger i = 0; i < _projectNames.count; i++) {
        NSString *name = _projectNames[i];
        BOOL running = (i < _projectRunning.count) ? _projectRunning[i].boolValue : NO;
        NSString *title = [NSString stringWithFormat:@"%@ %@", running ? @"●" : @"○", name];
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title
                                                      action:@selector(projectSelected:)
                                               keyEquivalent:@""];
        item.target = [LPMDockMenuHandler shared];
        item.representedObject = name;
        [menu addItem:item];
    }
    if (_keepAwakeSupported) {
        if (hasProjects) [menu addItem:[NSMenuItem separatorItem]];
        [menu addItem:keepAwakeItem()];
    }
    return menu;
}

// Tauri owns the NSApplication delegate and does not implement
// applicationDockMenu:, so add it at runtime. Reopen/terminate stay with Tauri.
void setupDockMenu(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        id delegate = [[NSApplication sharedApplication] delegate];
        if (!delegate) return;
        SEL sel = @selector(applicationDockMenu:);
        if (![delegate respondsToSelector:sel]) {
            class_addMethod([delegate class], sel, (IMP)lpm_applicationDockMenu, "@@:@");
        }
    });
}

void updateDockMenuProjects(const char **names, const int *running, int count) {
    NSMutableArray *newNames = [NSMutableArray arrayWithCapacity:count];
    NSMutableArray *newRunning = [NSMutableArray arrayWithCapacity:count];
    for (int i = 0; i < count; i++) {
        [newNames addObject:[NSString stringWithUTF8String:names[i]]];
        [newRunning addObject:@(running[i])];
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        _projectNames = newNames;
        _projectRunning = newRunning;
    });
}

void updateDockMenuKeepAwake(const char *mode, int supported) {
    NSString *newMode = [NSString stringWithUTF8String:mode];
    dispatch_async(dispatch_get_main_queue(), ^{
        _keepAwakeMode = newMode;
        _keepAwakeSupported = supported != 0;
    });
}
