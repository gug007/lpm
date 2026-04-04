#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

extern void dockMenuItemClicked(char *name);
extern void showMainWindow(void);
extern void quitApp(void);

static NSMutableArray<NSString *> *_projectNames = nil;
static NSMutableArray<NSNumber *> *_projectRunning = nil;
static BOOL _forceTerminate = NO;

@interface LPMDockMenuHandler : NSObject
+ (instancetype)shared;
- (void)projectSelected:(NSMenuItem *)sender;
@end

@implementation LPMDockMenuHandler
+ (instancetype)shared {
	static LPMDockMenuHandler *instance = nil;
	static dispatch_once_t onceToken;
	dispatch_once(&onceToken, ^{
		instance = [[LPMDockMenuHandler alloc] init];
	});
	return instance;
}

- (void)projectSelected:(NSMenuItem *)sender {
	dockMenuItemClicked((char *)[sender.representedObject UTF8String]);
}
@end

static NSApplicationTerminateReply lpm_applicationShouldTerminate(id self, SEL _cmd, NSApplication *sender) {
	if (_forceTerminate) {
		return NSTerminateNow;
	}
	quitApp();
	return NSTerminateCancel;
}

void forceTerminateApp(void) {
	_forceTerminate = YES;
	dispatch_async(dispatch_get_main_queue(), ^{
		[[NSApplication sharedApplication] terminate:nil];
	});
}

static BOOL lpm_applicationShouldHandleReopen(id self, SEL _cmd, NSApplication *sender, BOOL hasVisibleWindows) {
	if (!hasVisibleWindows) {
		showMainWindow();
	}
	return NO;
}

static NSMenu *lpm_applicationDockMenu(id self, SEL _cmd, NSApplication *sender) {
	if (!_projectNames || _projectNames.count == 0) return nil;

	NSMenu *dockMenu = [[NSMenu alloc] init];

	for (NSUInteger i = 0; i < _projectNames.count; i++) {
		NSString *name = _projectNames[i];
		BOOL running = (i < _projectRunning.count) ? _projectRunning[i].boolValue : NO;
		NSString *title = [NSString stringWithFormat:@"%@ %@", running ? @"●" : @"○", name];
		NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title
		                                             action:@selector(projectSelected:)
		                                      keyEquivalent:@""];
		[item setTarget:[LPMDockMenuHandler shared]];
		[item setRepresentedObject:name];
		[dockMenu addItem:item];
	}

	return dockMenu;
}

void setupDockMenu(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		id delegate = [[NSApplication sharedApplication] delegate];
		if (!delegate) return;

		Class cls = [delegate class];
		SEL sel = @selector(applicationDockMenu:);
		if (![delegate respondsToSelector:sel]) {
			class_addMethod(cls, sel, (IMP)lpm_applicationDockMenu, "@@:@");
		}

		SEL termSel = @selector(applicationShouldTerminate:);
		Method existing = class_getInstanceMethod(cls, termSel);
		if (existing) {
			method_setImplementation(existing, (IMP)lpm_applicationShouldTerminate);
		} else {
			class_addMethod(cls, termSel, (IMP)lpm_applicationShouldTerminate, "Q@:@");
		}

		SEL reopenSel = @selector(applicationShouldHandleReopen:hasVisibleWindows:);
		Method reopenMethod = class_getInstanceMethod(cls, reopenSel);
		if (reopenMethod) {
			method_setImplementation(reopenMethod, (IMP)lpm_applicationShouldHandleReopen);
		} else {
			class_addMethod(cls, reopenSel, (IMP)lpm_applicationShouldHandleReopen, "B@:@B");
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
