package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static CGFloat _tlX = 0;
static CGFloat _tlY = 0;

static void repositionTrafficLights(NSWindow *window) {
    NSButton *close = [window standardWindowButton:NSWindowCloseButton];
    NSButton *mini  = [window standardWindowButton:NSWindowMiniaturizeButton];
    NSButton *zoom  = [window standardWindowButton:NSWindowZoomButton];
    if (!close || !mini || !zoom) return;

    NSView *container = [close superview];
    if (!container) return;

    CGFloat containerHeight = container.frame.size.height;
    CGFloat buttonHeight    = close.frame.size.height;
    CGFloat spacing         = mini.frame.origin.x - close.frame.origin.x;
    if (spacing <= 0) spacing = 20.0;

    // Convert top-left origin (y from top) to macOS bottom-left origin
    CGFloat originY = containerHeight - _tlY - buttonHeight;

    [close setFrameOrigin:NSMakePoint(_tlX, originY)];
    [mini  setFrameOrigin:NSMakePoint(_tlX + spacing, originY)];
    [zoom  setFrameOrigin:NSMakePoint(_tlX + spacing * 2, originY)];
}

void setTrafficLightPosition(CGFloat x, CGFloat y) {
    _tlX = x;
    _tlY = y;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.2 * NSEC_PER_SEC)),
        dispatch_get_main_queue(), ^{
        NSWindow *w = [[NSApplication sharedApplication] mainWindow];
        if (!w) return;

        repositionTrafficLights(w);

        NSNotificationCenter *nc = [NSNotificationCenter defaultCenter];
        [nc addObserverForName:NSWindowDidResizeNotification object:w
            queue:[NSOperationQueue mainQueue]
            usingBlock:^(NSNotification *n) { repositionTrafficLights(w); }];
        [nc addObserverForName:NSWindowDidExitFullScreenNotification object:w
            queue:[NSOperationQueue mainQueue]
            usingBlock:^(NSNotification *n) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
                    dispatch_get_main_queue(), ^{ repositionTrafficLights(w); });
            }];
    });
}
*/
import "C"

// SetTrafficLightPosition sets the macOS window control buttons (close,
// minimize, zoom) to the given x/y offset measured from the top-left
// corner of the window.
func SetTrafficLightPosition(x, y float64) {
	C.setTrafficLightPosition(C.CGFloat(x), C.CGFloat(y))
}
