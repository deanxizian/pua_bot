import type { AgentUserConfig } from '#/config';
import type { MessageHandler } from '#/telegram/handler/types';
import type * as Telegram from 'telegram-bot-api-types';
import type { ParsedScriptLibrary } from './types';
import { loadChatLLM, requestCompletionsFromLLM } from '#/agent';
import { ENV, WorkerContext } from '#/config';
import { extractUserMessageItem } from '#/telegram/chat';
import { MessageSender } from '#/telegram/sender';
import { buildScriptLibrarySystemPrompt, withScriptPromptTemperature } from './prompt';
import { loadScriptLibrary } from './store';

function extractText(message: Telegram.Message): string {
    return (message.text || message.caption || '').trim();
}

function withScriptLibraryPromptConfig(config: AgentUserConfig, library: ParsedScriptLibrary): AgentUserConfig {
    const result = withScriptPromptTemperature(config);
    const existingPrompt = typeof result.SYSTEM_INIT_MESSAGE === 'string'
        ? result.SYSTEM_INIT_MESSAGE.trim()
        : '';
    const scriptPrompt = buildScriptLibrarySystemPrompt(library);
    result.SYSTEM_INIT_MESSAGE = existingPrompt
        ? `${existingPrompt}\n\n${scriptPrompt}`
        : scriptPrompt;
    return result;
}

async function replyWithScriptPrompt(
    message: Telegram.Message,
    context: WorkerContext,
    library: ParsedScriptLibrary,
): Promise<Response> {
    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    const scriptContext = new WorkerContext(
        withScriptLibraryPromptConfig(context.USER_CONFIG, library),
        context.SHARE_CONTEXT,
    );
    const agent = loadChatLLM(scriptContext.USER_CONFIG);
    if (!agent) {
        return sender.sendPlainText('LLM is not enable');
    }
    try {
        const params = await extractUserMessageItem(message, context);
        const answer = await requestCompletionsFromLLM(params, scriptContext, agent, null, null);
        return sender.sendPlainText(answer);
    } catch (e) {
        return sender.sendPlainText(`Error: ${(e as Error).message}`);
    }
}

export class ScriptPromptHandler implements MessageHandler {
    handle = async (message: Telegram.Message, context: WorkerContext): Promise<Response | null> => {
        if (!ENV.SCRIPT_ENABLE) {
            return null;
        }

        const text = extractText(message);
        if (!text || text.startsWith('/')) {
            return null;
        }

        let library: ParsedScriptLibrary;
        try {
            library = await loadScriptLibrary();
        } catch (e) {
            console.error(e);
            library = {
                allVersions: [],
                activeScripts: [],
                byId: new Map(),
            };
        }

        return await replyWithScriptPrompt(message, context, library);
    };
}
