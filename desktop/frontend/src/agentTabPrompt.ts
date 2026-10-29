import { newTabAgent, startPromptInNewTab } from "./sendToNewTab";

/** Starts Claude in a new tab of `projectName`, behind what the project shows,
 *  with `prompt` as its first message. */
export function askClaudeInNewTab(projectName: string, prompt: string): void {
  startPromptInNewTab(projectName, newTabAgent("claude").launch, prompt, {});
}
