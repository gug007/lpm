// Shim: restores the v2 wailsjs/runtime surface on top of @wailsio/runtime.
// Events.On's callback now receives {name, data}; this wrapper re-exposes the
// v2 shape so source files don't have to change.
import { Events, Browser, Window as V3Window } from "@wailsio/runtime";

type UnsubscribeFn = () => void;

export function EventsOn<T = any>(
  eventName: string,
  callback: (data: T) => void,
): UnsubscribeFn {
  return Events.On(eventName, (ev: { data: T }) => callback(ev.data));
}

export function EventsOff(
  eventName: string,
  ...additionalEventNames: string[]
): void {
  Events.Off(eventName, ...additionalEventNames);
}

export function EventsOnce<T = any>(
  eventName: string,
  callback: (data: T) => void,
): UnsubscribeFn {
  return Events.Once(eventName, (ev: { data: T }) => callback(ev.data));
}

export function EventsEmit(eventName: string, ...data: any[]): void {
  if (data.length === 0) {
    void Events.Emit(eventName);
  } else if (data.length === 1) {
    void Events.Emit(eventName, data[0]);
  } else {
    void Events.Emit(eventName, data);
  }
}

export function BrowserOpenURL(url: string): void {
  void Browser.OpenURL(url);
}

export function WindowGetSize(): Promise<{ w: number; h: number }> {
  return V3Window.Size().then((s) => ({ w: s.width, h: s.height }));
}

type FileDropPayload = { files: string[]; x?: number; y?: number };

let fileDropUnsubscribe: UnsubscribeFn | null = null;

export function OnFileDrop(
  callback: (x: number, y: number, paths: string[]) => void,
): void {
  OnFileDropOff();
  fileDropUnsubscribe = Events.On(
    "file-drop",
    (ev: { data: FileDropPayload }) => {
      const { x = 0, y = 0, files = [] } = ev.data ?? ({} as FileDropPayload);
      callback(x, y, files);
    },
  );
}

export function OnFileDropOff(): void {
  fileDropUnsubscribe?.();
  fileDropUnsubscribe = null;
}
