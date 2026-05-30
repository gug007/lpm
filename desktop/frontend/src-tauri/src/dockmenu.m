#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// Implemented in Rust (dockmenu.rs): focuses the main window and emits
// "dock-project-selected" for the chosen project.
extern void dockMenuItemClicked(const char *name);

static NSMutableArray<NSString *> *_projectNames = nil;
static NSMutableArray<NSNumber *> *_projectRunning = nil;

@interface LPMDockMenuHandler : NSObject
+ (instancetype)shared;
- (void)projectSelected:(NSMenuItem *)sender;
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
@end

static NSMenu *lpm_applicationDockMenu(id self, SEL _cmd, NSApplication *sender) {
    if (!_projectNames || _projectNames.count == 0) return nil;
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
