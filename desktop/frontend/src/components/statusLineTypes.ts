export type SegmentId =
  | "folder"
  | "path"
  | "model"
  | "branch"
  | "ctx"
  | "five"
  | "seven"
  | "cost"
  | "text";

export type SegColor =
  | "default"
  | "dim"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "claude";

export interface Segment {
  id: SegmentId;
  color: SegColor;
  text: string;
  label?: string;
  icon?: string;
}

export type MeterStyle =
  | "bar"
  | "blocks"
  | "shade"
  | "segments"
  | "dots"
  | "squares"
  | "braille"
  | "percent";

export interface CustomSpec {
  segments: Segment[];
  separator: string;
  meterStyle: MeterStyle;
  meterWidth: number;
  icons: boolean;
  gitStatus: boolean;
}
