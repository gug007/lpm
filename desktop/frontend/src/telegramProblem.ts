// Why lpm can't read a Telegram bot's messages, in the user's words, from the
// error the machine got back while it looked for the Start tap. Telegram hands
// a bot's messages to one reader only: a webhook, or one app polling at a time.
export function telegramProblem(error: string): string {
  if (/webhook/i.test(error)) {
    return "Another app gets this bot's messages, so lpm can't see you tap Start. Use a new bot just for lpm, or remove the webhook in that app.";
  }
  if (/terminated by other getUpdates/i.test(error)) {
    return "Another app or computer is reading this bot's messages, so lpm can't see you tap Start. Use a new bot just for lpm, or stop the other reader.";
  }
  if (/unauthorized|not found/i.test(error)) {
    return "Telegram no longer accepts this bot's token. Use a new bot.";
  }
  return `lpm can't read this bot's messages yet. It keeps trying.`;
}
