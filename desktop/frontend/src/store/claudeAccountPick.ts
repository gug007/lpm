import { create } from "zustand";
import { TerminalClaudeAccount } from "../../bridge/commands";
import { MAIN_LOGIN } from "../claudePoolText";
import type { ClaudeAccountChoice } from "../types";
import { setClaudeAccountChoice } from "./claudeAccountPin";
import { requestClaudeTabMoves } from "./claudeTabMoves";
import { useProjectClaudeTabs } from "./projectClaudeTabs";

export interface ClaudeTabOnAccount {
  id: string;
  // The account it runs on; null when unknown.
  from: string | null;
}

export interface TabAccountQuestion {
  projectName: string;
  choice: ClaudeAccountChoice;
  // The account picked, and the project's Claude tabs in tab-strip order.
  account: string;
  tabs: ClaudeTabOnAccount[];
  selected: string | null;
}

interface TabAccountQuestionState {
  question: TabAccountQuestion | null;
}

export const useTabAccountQuestion = create<TabAccountQuestionState>(() => ({ question: null }));

/** Picks the account a project's new Claude sessions use. Picking one account
 *  while some of the project's Claude tabs run on another first asks which of
 *  them move too. */
export async function pickClaudeAccount(projectName: string, choice: ClaudeAccountChoice): Promise<void> {
  const open = useProjectClaudeTabs.getState().byProject[projectName];
  if (choice.kind === "pin" && open?.ids.length) {
    const account = choice.id || MAIN_LOGIN;
    const froms = await Promise.all(
      open.ids.map((id) => TerminalClaudeAccount(id).then((a) => a || null, () => null)),
    );
    const tabs = open.ids.map((id, i) => ({ id, from: froms[i] }));
    if (tabs.some((t) => t.from !== account)) {
      useTabAccountQuestion.setState({
        question: { projectName, choice, account, tabs, selected: open.selected },
      });
      return;
    }
  }
  await setClaudeAccountChoice(projectName, choice);
}

export async function answerTabAccountQuestion(moveIds: string[]): Promise<void> {
  const { question } = useTabAccountQuestion.getState();
  if (!question) return;
  useTabAccountQuestion.setState({ question: null });
  const { projectName, choice, account } = question;
  if (!(await setClaudeAccountChoice(projectName, choice)) || moveIds.length === 0) return;
  requestClaudeTabMoves(projectName, moveIds, account);
}

export function dismissTabAccountQuestion(): void {
  useTabAccountQuestion.setState({ question: null });
}
