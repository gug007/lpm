export const VIDEO_SKILL = "explaincast";

const ALREADY_A_CALL = new RegExp(`^\\s*[/$]${VIDEO_SKILL}(\\s|$)`);

// The prompt as the agent receives it. Claude Code runs a skill as "/name";
// every other agent takes the "$name" skill mention, the way lpm's own skills
// are sent. A prompt that already calls the skill goes through untouched, so a
// re-sent or restored one is never wrapped twice.
export function buildVideoRequest(cli: string | null, prompt: string): string {
  if (ALREADY_A_CALL.test(prompt)) return prompt;
  return `${cli === "claude" ? "/" : "$"}${VIDEO_SKILL} ${prompt.trim()}`;
}
