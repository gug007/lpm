#import <Cocoa/Cocoa.h>

@interface LPMDockTilePlugin : NSObject <NSDockTilePlugIn>
@end

@implementation LPMDockTilePlugin

- (void)setDockTile:(NSDockTile *)dockTile {
}

- (NSMenu *)dockMenu {
    NSArray<NSString *> *projects = [self loadProjectNames];
    if (projects.count == 0) return nil;

    NSMenu *menu = [[NSMenu alloc] init];
    for (NSString *name in projects) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:name
                                                      action:@selector(openApp:)
                                               keyEquivalent:@""];
        [item setTarget:self];
        [menu addItem:item];
    }
    return menu;
}

- (void)openApp:(NSMenuItem *)sender {
    // Walk from PlugIns/LPMDockTile.docktileplugin → the .app bundle.
    NSString *pluginPath = [[NSBundle bundleForClass:[self class]] bundlePath];
    NSString *appPath = [[pluginPath stringByDeletingLastPathComponent]
                          stringByDeletingLastPathComponent];

    NSURL *appURL = [NSURL fileURLWithPath:appPath];
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:appURL
                                          configuration:[NSWorkspaceOpenConfiguration configuration]
                                      completionHandler:nil];
}

- (NSArray<NSString *> *)loadProjectNames {
    NSString *home = NSHomeDirectory();

    // Prefer the explicit order from settings.json.
    NSString *settingsPath = [home stringByAppendingPathComponent:@".lpm/settings.json"];
    NSData *data = [NSData dataWithContentsOfFile:settingsPath];
    if (data) {
        NSDictionary *settings = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        NSArray *order = settings[@"projectOrder"];
        if ([order isKindOfClass:[NSArray class]] && order.count > 0) {
            return order;
        }
    }

    // Fallback: list project directories.
    NSString *projectsDir = [home stringByAppendingPathComponent:@".lpm/projects"];
    NSArray *contents = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:projectsDir error:nil];
    NSMutableArray *names = [NSMutableArray array];
    for (NSString *name in contents) {
        if (![name hasPrefix:@"."]) {
            [names addObject:name];
        }
    }
    [names sortUsingSelector:@selector(localizedCaseInsensitiveCompare:)];
    return names;
}

@end
