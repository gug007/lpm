// `lpm generate` as the desktop sees it (src-tauri/src/generate): the requests
// waiting for a yes, the models and voices Settings offers, and the record of
// how a file was made.
export const GENERATE_REQUEST_EVENT = "generate-request";

export type GenerateProvider = "gemini" | "openai";
export type GenerateApprovalMode = "each" | "project" | "always";
export type GenerateDecision = "deny" | "once" | "project";

export interface GenerateRequest {
  id: string;
  kind: "image" | "speech";
  agent: string;
  project: string;
  prompt: string;
  model: string;
  provider: string;
  details: string[];
  cost: string;
  out: string;
  needsKey: GenerateProvider | null;
  keyLabel: string;
  projectGrant: boolean;
  overLimit: boolean;
  today: string;
}

export interface GenerateChoice {
  id: string;
  label: string;
  provider: string;
}

export interface GenerateOptions {
  imageModels: GenerateChoice[];
  voices: string[];
  defaultImageModel: string;
  defaultVoice: string;
  defaultLimit: number;
}

export interface GenerateUsage {
  images: number;
  clips: number;
  cents: number;
  todayCents: number;
}

export interface GeneratedRecord {
  at: number;
  kind: "image" | "speech";
  model: string;
  label: string;
  prompt: string;
  path: string;
  project: string;
  agent: string;
  cents: number;
  bytes: number;
  width?: number;
  height?: number;
  voice?: string;
}

export type GenerateKeys = Record<GenerateProvider, boolean>;

export const GET_KEY_URL: Record<GenerateProvider, string> = {
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
};

export const DAILY_LIMITS = [1, 2, 5, 10, 0];

// "31¢", "$2.40".
export function money(cents: number): string {
  if (cents < 100) return `${Math.round(cents)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function limitLabel(dollars: number): string {
  return dollars > 0 ? `$${dollars} a day` : "No limit";
}

export function capitalized(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
