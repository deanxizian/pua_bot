import type { AgentUserConfig } from '#/config';
import type { ChatAgent } from './types';
import { Claude } from './anthropic';
import { OpenAI } from './openai';

export const CHAT_AGENTS: ChatAgent[] = [
    new OpenAI(),
    new Claude(),
];

export function loadChatLLM(context: AgentUserConfig): ChatAgent | null {
    for (const llm of CHAT_AGENTS) {
        if (llm.name === context.AI_PROVIDER) {
            return llm;
        }
    }
    // Fall back to the first enabled provider when AI_PROVIDER is auto or unavailable.
    for (const llm of CHAT_AGENTS) {
        if (llm.enable(context)) {
            return llm;
        }
    }
    return null;
}
