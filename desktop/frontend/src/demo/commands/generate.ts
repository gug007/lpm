import type { CommandMap } from "../backend";

// The sample Mac has an OpenAI key and no Gemini key, so Settings shows both
// states; nothing waits for an answer and nothing has been made yet.
const keys = { gemini: false, openai: true };
let allowed: string[] = [];

export const generateCommands: CommandMap = {
  generate_requests: () => [],
  generate_answer: () => null,
  generate_key_status: () => ({ ...keys }),
  set_generate_key: ({ provider }) => {
    if (provider === "gemini" || provider === "openai") keys[provider] = true;
    return null;
  },
  clear_generate_key: ({ provider }) => {
    if (provider === "gemini" || provider === "openai") keys[provider] = false;
    return null;
  },
  generate_options: () => ({
    imageModels: [
      { id: "nano-banana", label: "Nano Banana 2.1", provider: "Google", cost: "about 3¢" },
      { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "Google", cost: "about 13¢" },
      { id: "gpt-image", label: "GPT Image 2", provider: "OpenAI", cost: "about 5¢" },
    ],
    voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"],
    defaultImageModel: "nano-banana",
    defaultVoice: "marin",
    defaultLimit: 2,
  }),
  generate_usage: () => ({ images: 0, clips: 0, cents: 0, todayCents: 0 }),
  generated_file_record: () => null,
  generate_allowed_projects: () => [...allowed],
  generate_forget_projects: () => {
    allowed = [];
    return null;
  },
};
