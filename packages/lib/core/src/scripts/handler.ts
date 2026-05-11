import type { WorkerContext } from '#/config';
import type { MessageHandler } from '#/telegram/handler/types';
import type * as Telegram from 'telegram-bot-api-types';
import type { ParsedScriptLibrary } from './types';
import { loadChatLLM } from '#/agent';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { buildScriptLibraryPrompt, withScriptPromptTemperature } from './prompt';
import { getConfiguredFallback, loadScriptLibrary } from './store';

function extractText(message: Telegram.Message): string {
    return (message.text || message.caption || '').trim();
}

async function replyWithScriptPrompt(
    message: Telegram.Message,
    context: WorkerContext,
    library: ParsedScriptLibrary,
): Promise<Response> {
    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    const agent = loadChatLLM(context.USER_CONFIG);
    if (!agent) {
        return sender.sendPlainText('LLM is not enable');
    }
    try {
        const fallback = getConfiguredFallback(library);
        const fallbackContent = fallback?.content || ENV.SCRIPT_DEFAULT_FALLBACK_TEXT;
        const params = buildScriptLibraryPrompt(library, fallbackContent, extractText(message), fallback);
        const answer = await agent.request(params, withScriptPromptTemperature(context.USER_CONFIG), null);
        return sender.sendPlainText(answer.text);
    } catch (e) {
        return sender.sendPlainText(`Error: ${(e as Error).message}`);
    }
}

export class ScriptMatchHandler implements MessageHandler {
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
                fallback: null,
            };
        }

        return await replyWithScriptPrompt(message, context, library);
    };
}
