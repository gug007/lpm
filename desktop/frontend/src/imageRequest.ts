// Kept word for word in step with lpm Link's ImageRequest (iOS and Android),
// so a prompt reads the same whichever screen sent it.
const ASK = "Make an image with `lpm generate image`";

// The prompt as the agent receives it: an ask to make the image with the keys
// saved in lpm, which then asks the person before it spends anything. A prompt
// that already asks goes through untouched, so a re-sent one isn't wrapped twice.
export function buildImageRequest(prompt: string): string {
  if (prompt.trimStart().startsWith(ASK)) return prompt;
  return `${ASK}: ${prompt.trim()}`;
}
