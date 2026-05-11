import type { WorkerContext } from '#/config';
import type { MessageHandler } from '#/telegram/handler/types';
import type * as Telegram from 'telegram-bot-api-types';
import type { ParsedScriptLibrary, ScriptEntry } from './types';
import { loadChatLLM } from '#/agent';
import { ENV } from '#/config';
import { MessageSender } from '#/telegram/sender';
import { matchScript } from './matcher';
import { buildScriptRewritePrompt, withScriptRewriteTemperature } from './prompt';
import { getConfiguredFallback, loadScriptLibrary } from './store';

function extractText(message: Telegram.Message): string {
    return (message.text || message.caption || '').trim();
}

async function replyRewriteScript(
    message: Telegram.Message,
    context: WorkerContext,
    script: ScriptEntry,
    fallback: ScriptEntry | null,
): Promise<Response> {
    const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
    const agent = loadChatLLM(context.USER_CONFIG);
    if (!agent) {
        return sender.sendPlainText('LLM is not enable');
    }
    try {
        const fallbackContent = fallback?.content || ENV.SCRIPT_DEFAULT_FALLBACK_TEXT;
        const params = buildScriptRewritePrompt(script.content, fallbackContent, extractText(message));
        const answer = await agent.request(params, withScriptRewriteTemperature(context.USER_CONFIG), null);
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

        const sender = MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message);
        let library: ParsedScriptLibrary;
        try {
            library = await loadScriptLibrary();
        } catch (e) {
            console.error(e);
            if (ENV.SCRIPT_ONLY_MODE) {
                return sender.sendPlainText(ENV.SCRIPT_DEFAULT_FALLBACK_TEXT);
            }
            return null;
        }

        const fallback = getConfiguredFallback(library);
        const match = matchScript(text, library);
        if (match) {
            if (match.script.meta.mode === 'rewrite') {
                return await replyRewriteScript(message, context, match.script, fallback);
            }
            return sender.sendPlainText(match.script.content);
        }

        if (fallback) {
            return sender.sendPlainText(fallback.content);
        }
        if (ENV.SCRIPT_ONLY_MODE) {
            return sender.sendPlainText(ENV.SCRIPT_DEFAULT_FALLBACK_TEXT);
        }
        return null;
    };
}
