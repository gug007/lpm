export function EventsOn(eventName: string, callback: (...data: any) => void): () => void;
export function EventsEmit(eventName: string, ...data: any): void;

export function BrowserOpenURL(url: string): void;

export function WindowGetSize(): Promise<{ w: number; h: number }>;

export function OnFileDrop(
  callback: (x: number, y: number, paths: string[]) => void,
  useDropTarget?: boolean,
): void;
export function OnFileDropOff(): void;
