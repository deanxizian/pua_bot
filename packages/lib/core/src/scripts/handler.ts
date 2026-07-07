import type { MessageHandler } from '#/telegram/handler/types';
import type * as Telegram from 'telegram-bot-api-types';
import type { ParsedScriptLibrary } from './types';
import { ENV, WorkerContext } from '#/config';
import { chatWithMessage, extractUserMessageItem } from '#/telegram/chat';
import { MessageSender } from '#/telegram/sender';
import { buildScriptLibrarySystemPrompt, withScriptPromptTemperature } from './prompt';
import { loadScriptLibrary } from './store';

const SCRIPT_SAFE_ERROR_TEXT = '\u6682\u65F6\u65E0\u6CD5\u751F\u6210\u56DE\u590D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002';

function extractText(message: Telegram.Message): string {
    return (message.text || message.caption || '').trim();
}

async function replyWithScriptPrompt(
    message: Telegram.Message,
    context: WorkerContext,
    library: ParsedScriptLibrary,
): Promise<Response> {
    const scriptContext = new WorkerContext(
        withScriptPromptTemperature(context.USER_CONFIG),
        context.SHARE_CONTEXT,
    );
    try {
        const params = await extractUserMessageItem(message, context);
        return await chatWithMessage(message, params, scriptContext, null, {
            errorText: SCRIPT_SAFE_ERROR_TEXT,
            finalTextMode: 'rich-markdown',
            systemPrompt: buildScriptLibrarySystemPrompt(library),
        });
    } catch (e) {
        console.error(e);
        return MessageSender.fromMessage(context.SHARE_CONTEXT.botToken, message).sendRichMarkdown(SCRIPT_SAFE_ERROR_TEXT);
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
                commonScripts: [],
                coreScripts: [],
                byId: new Map(),
            };
        }

        return await replyWithScriptPrompt(message, context, library);
    };
}
